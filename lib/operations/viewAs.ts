/**
 * Super-admin "View as" for the Operations world.
 *
 * /operations is self-scoped to the logged-in user. For QA, an admin needs to
 * preview another person's exact portals + driver. `resolveViewContext` returns
 * the effective user to load data for: normally the caller, but an admin passing
 * `?asUser=<id>` gets that user instead. Preview is READ-ONLY by contract — the
 * pages render a non-interactive driver in this mode (mutations would run as the
 * admin, not the viewed user).
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export type ViewContext = {
  /** The user whose data the page should load. */
  userId: string;
  /** The logged-in user. */
  selfId: string;
  /** Set only when an admin is previewing someone else — drives the banner + read-only mode. */
  viewingAs: { id: string; name: string | null } | null;
};

export async function resolveViewContext(asUserParam?: string): Promise<ViewContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const selfId = session.user.id;

  if (asUserParam && asUserParam !== selfId && isAdminUser(session)) {
    const target = await prisma.user.findUnique({
      where: { id: asUserParam },
      select: { id: true, name: true },
    });
    if (target) return { userId: target.id, selfId, viewingAs: target };
  }
  return { userId: selfId, selfId, viewingAs: null };
}
