import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/api/auth/",
  "/api/register",
  "/api/cron/",
  "/api/debug/",
  "/_next",
  "/favicon",
  "/manifest",
  "/icons",
  "/data/",
];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip auth for public routes
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Not logged in — redirect to login
  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  const role = (token as { role?: string }).role;
  const method = req.method;
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isApiRoute = pathname.startsWith("/api/");

  if (role === "viewer" && isMutation && isApiRoute) {
    const allowed = [
      "/api/account/password",
      "/api/account/external-calendar",
      "/api/notifications",
      "/api/account",
    ];
    if (!allowed.some((p) => pathname.startsWith(p))) {
      return NextResponse.json({ error: "Viewers cannot make changes." }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|data).*)",
  ],
};
