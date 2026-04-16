import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Middleware runs on every matched request before it reaches route handlers.
 *
 * Two responsibilities:
 * 1. Require authentication for all app routes (handled by withAuth).
 * 2. Block viewers from any mutating API request (POST/PUT/PATCH/DELETE),
 *    except their own password/profile changes and the register endpoint.
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const method = req.method;
    const role = (req.nextauth.token as { role?: string } | null)?.role;

    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    const isApiRoute = pathname.startsWith("/api/");

    if (role === "viewer" && isMutation && isApiRoute) {
      // Allow viewers to change their own password / external calendar / account settings
      const allowed = [
        "/api/account/password",
        "/api/account/external-calendar",
        "/api/notifications",      // marking notifications read
        "/api/account",
      ];
      if (!allowed.some(p => pathname.startsWith(p))) {
        return NextResponse.json(
          { error: "Viewers cannot make changes." },
          { status: 403 }
        );
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Public routes that don't need auth
        const { pathname } = req.nextUrl;
        if (
          pathname.startsWith("/login") ||
          pathname.startsWith("/register") ||
          pathname.startsWith("/api/register") ||
          pathname.startsWith("/_next") ||
          pathname.startsWith("/favicon") ||
          pathname.startsWith("/manifest") ||
          pathname.startsWith("/icons") ||
          pathname.startsWith("/data/")
        ) {
          return true;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|data).*)",
  ],
};
