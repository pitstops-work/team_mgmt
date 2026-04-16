/**
 * Role helpers shared between server (API routes) and client hooks.
 *
 * Roles: "admin" | "member" | "viewer"
 * Viewers can read but cannot create, edit, or delete anything.
 */

export function isViewer(role: string | null | undefined): boolean {
  return role === "viewer";
}

export function canEdit(role: string | null | undefined): boolean {
  return role === "admin" || role === "member";
}

/** Use in API route handlers to block viewers from mutations. */
export function viewerForbidden(role: string | null | undefined): Response | null {
  if (isViewer(role)) {
    return Response.json({ error: "Viewers cannot make changes." }, { status: 403 });
  }
  return null;
}
