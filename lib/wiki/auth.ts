import prisma from "@/lib/prisma";

type SessionLike = { user?: { id?: string; role?: string } } | null;

export async function isWikiSteward(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const row = await prisma.wikiStaff.findFirst({
    where: { userId, wikiRole: "steward" },
    select: { id: true },
  });
  return !!row;
}

export async function isWikiCurator(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const row = await prisma.wikiStaff.findFirst({
    where: { userId, wikiRole: "curator" },
    select: { id: true },
  });
  return !!row;
}

/** Page owner OR steward (emergency edit). */
export function canEditPage(
  page: { ownerId: string | null },
  session: SessionLike,
  stewardOverride: boolean,
): boolean {
  const userId = session?.user?.id;
  if (!userId) return false;
  if (page.ownerId === userId) return true;
  return stewardOverride;
}

/** Steward only (creates, assigns ownership, retires). */
export function requireSteward(steward: boolean): Response | null {
  if (!steward) return Response.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

/**
 * Page archive (soft-delete) authz. Spec: stewards + curators only; owners and
 * editors cannot remove their own pages. City-scoping on curator is not yet
 * enforced here — deferred until the WikiStaff.cityId scope is wired into a
 * cityCanArchive() helper.
 */
export function canArchivePage(steward: boolean, curator: boolean): boolean {
  return steward || curator;
}
