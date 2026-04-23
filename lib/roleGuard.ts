type SessionLike = { user?: { role?: string; email?: string | null } } | null;

export function isSuperAdmin(session: SessionLike) {
  return session?.user?.role === "super-admin";
}

export function isAdminUser(session: SessionLike) {
  const role = session?.user?.role;
  return role === "admin" || role === "super-admin";
}

/** Returns a 403 Response if the user is a viewer, otherwise null. */
export function viewerForbidden(session: SessionLike): Response | null {
  if (session?.user?.role === "viewer") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Returns a 403 Response if the user is not an admin or super-admin. */
export function adminForbidden(session: SessionLike): Response | null {
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
