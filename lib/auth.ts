import { AuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import prisma from "./prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
    };
  }
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Email is case-insensitive: users may type caps even though stored
        // emails are normalised to lowercase on create/register.
        const email = String(credentials.email).trim();
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });

        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        // Record login time + history (fire-and-forget — don't block auth on DB write)
        const now = new Date();
        Promise.all([
          prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: now } }),
          prisma.userLoginEvent.create({ data: { userId: user.id, provider: "credentials" } }),
        ]).catch(() => {});

        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role ?? "member" };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "member";
      }
      // For Google sign-in, look up (or create) the user by email.
      // ADMIN_EMAIL is honored only on CREATE — bootstrap-only.
      if (account?.provider === "google" && token.email) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const dbUser = await prisma.user.upsert({
          where: { email: token.email },
          create: {
            email: token.email,
            name: token.name ?? null,
            image: token.picture ?? null,
            role: adminEmail && token.email === adminEmail ? "super-admin" : "viewer",
          },
          update: {
            name: token.name ?? undefined,
            image: token.picture ?? undefined,
            lastSeenAt: new Date(),
          },
        });
        prisma.userLoginEvent.create({ data: { userId: dbUser.id, provider: "google" } }).catch(() => {});
        token.id = dbUser.id;
        token.role = dbUser.role;
      }
      // If role is missing from an old JWT, re-fetch from DB once so the user
      // doesn't need to sign out/in after the role system was introduced.
      if (!token.role && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        });
        if (dbUser) token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string | undefined) ?? "member";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

export function auth() {
  return getServerSession(authOptions);
}
