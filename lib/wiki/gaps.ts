import prisma from "@/lib/prisma";

/**
 * Practice gap routing. See module 5 of the practice-documentation training
 * (`public/training/modules/practice-documentation/05-practice-gap-queue.html`)
 * for the protocol.
 *
 * MVP rule, in order:
 *   1. If a wiki page tagged `vertical=<vertical>` exists and has an owner,
 *      route there (preferring `partner_org=<partnerOrgSlug>` tagged page
 *      when a partner is named).
 *   2. Otherwise return null — caller leaves `assignedOwnerId` empty so the
 *      gap lands in the curator's weekly walk.
 *
 * No automatic assignment beyond this. Triage decisions (assign / merge /
 * decline) are explicit human steps via PATCH /api/wiki/gaps/[id].
 */
export async function suggestAssignedOwnerId(input: {
  vertical: string;
  partnerOrgId: string | null;
}): Promise<string | null> {
  const { vertical, partnerOrgId } = input;
  if (!vertical) return null;

  // Look up partner-scoped tagged page first when a partner is named.
  if (partnerOrgId) {
    const partnerOrg = await prisma.org.findUnique({
      where: { id: partnerOrgId },
      select: { slug: true },
    });
    if (partnerOrg?.slug) {
      const partnerScoped = await prisma.wikiPage.findFirst({
        where: {
          archivedAt: null,
          status: { not: "retired" },
          ownerId: { not: null },
          tags: {
            some: { tagType: "partner_org", tagValue: partnerOrg.slug },
          },
          AND: {
            tags: { some: { tagType: "vertical", tagValue: vertical } },
          },
        },
        orderBy: { lastEditedAt: "desc" },
        select: { ownerId: true },
      });
      if (partnerScoped?.ownerId) return partnerScoped.ownerId;
    }
  }

  // Fall back to vertical-tagged page with an active owner.
  const verticalPage = await prisma.wikiPage.findFirst({
    where: {
      archivedAt: null,
      status: { not: "retired" },
      ownerId: { not: null },
      tags: { some: { tagType: "vertical", tagValue: vertical } },
    },
    orderBy: { lastEditedAt: "desc" },
    select: { ownerId: true },
  });
  return verticalPage?.ownerId ?? null;
}

export const GAP_STATUSES = [
  "open",
  "assigned",
  "drafted",
  "merged",
  "published",
  "declined",
] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

export function isGapStatus(s: unknown): s is GapStatus {
  return typeof s === "string" && (GAP_STATUSES as readonly string[]).includes(s);
}

/** Default drafting window per page type, in days. */
export const DRAFTING_WINDOW_DAYS = {
  runbook: 7,
  playbook: 14,
  principle: 30,
} as const;
