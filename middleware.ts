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
  // One-shot review-portal migration runner — gated by STAFF_PASSPHRASE inside the route.
  // Remove this line + the route file once migrations have been applied.
  "/api/review/admin/migrate",
  "/_next",
  "/favicon",
  "/manifest",
  "/icon-",
  "/icons",
  "/sw.js",
  "/.well-known/",
  "/data/",
  "/index.html",
  "/welcome.html",
  "/workshop-agenda.html",
  "/pitstops-training.html",
  "/pitstops-presentation.html",
  "/workshop/",
  "/training/",
];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip auth for public routes
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Not logged in — redirect HTML routes to login, return JSON 401 for API routes
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  const role = (token as { role?: string }).role;
  const method = req.method;
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isApiRoute = pathname.startsWith("/api/");

  // budget-admin: only the budget section + account settings allowed
  if (role === "budget-admin") {
    const BUDGET_PREFIXES = ["/budget", "/admin", "/api/budget", "/api/admin/budget", "/settings", "/api/account"];
    if (!BUDGET_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/budget", req.url));
    }
  }

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
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-|icons|sw.js|\\.well-known|data).*)",
  ],
};
