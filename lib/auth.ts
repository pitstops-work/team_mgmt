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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        // Record login time (fire-and-forget — don't block auth on DB write)
        prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {});

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
      // For Google sign-in, look up (or create) the user by email
      if (account?.provider === "google" && token.email) {
        const dbUser = await prisma.user.upsert({
          where: { email: token.email },
          create: {
            email: token.email,
            name: token.name ?? null,
            image: token.picture ?? null,
            role: "viewer",
          },
          update: {
            name: token.name ?? undefined,
            image: token.picture ?? undefined,
            lastSeenAt: new Date(),
          },
        });
        token.id = dbUser.id;
        token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string ?? "member";
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
