type SessionLike = { user?: { role?: string; email?: string | null } } | null;

export function isSuperAdmin(email: string | null | undefined) {
  return !!email && email === process.env.ADMIN_EMAIL;
}

export function isAdminUser(session: SessionLike) {
  return session?.user?.role === "admin" || isSuperAdmin(session?.user?.email);
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
