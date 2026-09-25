/**
 * Admin "View as" for the /field world.
 *
 * /field replaces /operations for the pilot, so the QA problem it inherits is
 * the same one `lib/operations/viewAs.ts` solves: every /field page is scoped
 * to the logged-in user, and an admin (who is NOT an RP and usually holds no
 * clusters) therefore cannot see what an RP or a ZL actually gets. These
 * helpers return the *effective* user to load data for — normally the caller,
 * but an admin passing `?asUser=<id>` gets that user instead.
 *
 * Preview is READ-ONLY by contract: the pages pass `readOnly` down so every
 * action button is disabled. A mutation in preview would run as the admin, not
 * as the previewed user, which is exactly the wrong thing to test with.
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { fieldEnabledForSession } from "@/lib/field/access";

export type FieldViewContext = {
  /** The user whose field data the page should load. */
  userId: string;
  /** The logged-in user. */
  selfId: string;
  /** Set only when an admin is previewing someone else — drives the banner + read-only mode. */
  viewingAs: { id: string; name: string | null; designation: string | null } | null;
  /** Whether the logged-in user may preview others (drives the "View as" picker). */
  isAdmin: boolean;
};

/** Resolve the RP-surface view context (/field, /field/[cluster], /field/intervention). */
export async function resolveFieldView(asUserParam?: string): Promise<FieldViewContext | null> {
  const session = await auth();
  const selfId = session?.user?.id;
  if (!selfId) return null;
  if (!fieldEnabledForSession(session)) return null;
  const isAdmin = isAdminUser(session);

  if (asUserParam && asUserParam !== selfId && isAdmin) {
    const target = await prisma.user.findUnique({
      where: { id: asUserParam },
      select: { id: true, name: true, designation: true },
    });
    if (target) return { userId: target.id, selfId, viewingAs: target, isAdmin };
  }
  return { userId: selfId, selfId, viewingAs: null, isAdmin };
}

export type FieldOversightView = FieldViewContext & {
  /** Whose clusters are in scope — the previewed user's own set when previewing. */
  visibleIds: string[];
  /**
   * False when the previewed user is not a supervisor. The page renders a
   * notice instead of a redirect: an RP hitting /field/oversight is bounced to
   * /field, and silently bouncing the admin who asked to preview them reads as
   * a bug rather than as the answer to the question they asked.
   */
  targetIsSupervisor: boolean;
};

/**
 * Resolve the manager-surface view context (/field/oversight[/cluster]).
 *
 * Without `asUser` this is `getFieldOversightScope()` — unchanged. With it, the
 * scope is recomputed from the PREVIEWED user's designation, so a ZL preview
 * shows their one-hop reports' clusters and a Leader preview shows the tree.
 */
export async function resolveFieldOversightView(asUserParam?: string): Promise<FieldOversightView | null> {
  const view = await resolveFieldView(asUserParam);
  if (!view) return null;

  const { visibleIds, isSupervisor } = await scopeForUser(view.userId);
  return { ...view, visibleIds, targetIsSupervisor: isSupervisor };
}

/**
 * The oversight scope of an arbitrary user.
 *
 * Deliberately NOT a new RBAC permission. A `field.oversee` grant would mean a
 * prod grant migration (see scripts/add-field-manage-grant.ts for the pattern)
 * for a surface that is still behind FIELD_SURFACE_ENABLED. Composed from what
 * already exists instead: being a supervisor — the same predicate
 * /operations/oversight/dashboard uses (anyone whose visibility set reaches
 * past themselves) — or holding `field.manage`, since a programme lead running
 * the backend should be able to read the dashboard for it.
 *
 * Resolved from a user id rather than the session so it can be run for the
 * PREVIEWED user: a ZL preview must show their reports' clusters, not the
 * admin's whole tree. getUserClusters already takes a list, so widening from
 * the RP's self-scope is free.
 */
async function scopeForUser(userId: string): Promise<{ visibleIds: string[]; isSupervisor: boolean }> {
  const { buildRbacContext, can } = await import("@/lib/rbac");
  const ctx = await buildRbacContext({ user: { id: userId } });
  if (!ctx) return { visibleIds: [userId], isSupervisor: false };

  const { getVisibleUserIds } = await import("@/lib/visibilityScope");
  const visibleIds = await getVisibleUserIds(ctx);
  const isSupervisor = visibleIds.length > 1 || (await can(ctx, "field", "manage"));
  return { visibleIds: visibleIds.length ? visibleIds : [userId], isSupervisor };
}

/** `?asUser=<id>` when previewing, "" otherwise — for carrying the preview down through links. */
export function fieldPreviewQuery(view: { viewingAs: unknown; userId: string }): string {
  return view.viewingAs ? `asUser=${encodeURIComponent(view.userId)}` : "";
}

/** Append the preview param (and any extras) to a /field href. */
export function fieldHref(base: string, view: { viewingAs: unknown; userId: string }, extra: string[] = []): string {
  const qs = [...extra, fieldPreviewQuery(view)].filter(Boolean).join("&");
  return `${base}${qs ? `?${qs}` : ""}`;
}
