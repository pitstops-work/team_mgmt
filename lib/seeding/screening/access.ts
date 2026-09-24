/**
 * Who may do what in screening, on top of the seeding membership layer.
 *
 *   L2 screener      coordinator, geo POC or geography lead — in their own
 *                    geography, narrowed to districts if a ScreeningScope says so
 *   L3 (lead)        geography lead or geo POC for that geography; central
 *                    lead / central team for every geography
 *   Settings         whoever manages the seeding portal's structure
 *
 * Applications are personal data: outreach support and viewers see nothing.
 * Nobody sees an application they declared a conflict on.
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import type { SeedingAccess } from "@/lib/seeding/access";

const SCREENER_ROLES = new Set(["coordinator", "geo_poc", "geo_lead"]);
const LEAD_ROLES = new Set(["geo_poc", "geo_lead"]);
const CENTRAL_LEAD_ROLES = new Set(["central_lead", "central_team"]);

export type ScreeningAccess = {
  userId: string;
  /** Sees and screens every geography. */
  all: boolean;
  /** Geographies this person screens at L2. */
  screenGeoIds: string[];
  /** Geographies this person decides at L3. */
  leadGeoIds: string[];
  /** L3 across every geography. */
  leadAll: boolean;
  canConfigure: boolean;
  /** geoId → districts, for screeners narrowed below geography level. */
  districtScope: Record<string, string[]>;
};

export async function getScreeningAccess(a: SeedingAccess): Promise<ScreeningAccess | null> {
  if (!a.userId) return null;
  const all = a.isSuperAdmin || a.isCentral;
  const screenGeoIds = [...new Set(a.memberships.filter((m) => m.geoId && SCREENER_ROLES.has(m.role)).map((m) => m.geoId!))];
  const leadGeoIds = [...new Set(a.memberships.filter((m) => m.geoId && LEAD_ROLES.has(m.role)).map((m) => m.geoId!))];
  const leadAll = a.isSuperAdmin || a.memberships.some((m) => CENTRAL_LEAD_ROLES.has(m.role));
  if (!all && screenGeoIds.length === 0) return null;

  const scopes = all ? [] : await prisma.screeningScope.findMany({ where: { userId: a.userId } });
  const districtScope: Record<string, string[]> = {};
  for (const s of scopes) {
    // A lead is never narrowed in their own geography — they own all of it.
    if (s.districts.length && !leadGeoIds.includes(s.geoId)) districtScope[s.geoId] = s.districts;
  }
  return { userId: a.userId, all, screenGeoIds, leadGeoIds, leadAll, canConfigure: a.canManageStructure, districtScope };
}

/** Prisma filter for the applications this person may see. */
export function visibleWhere(s: ScreeningAccess): Prisma.ScreeningApplicationWhereInput {
  const notConflicted: Prisma.ScreeningApplicationWhereInput = { NOT: { conflictUserIds: { has: s.userId } } };
  if (s.all) return notConflicted;
  const geoClauses: Prisma.ScreeningApplicationWhereInput[] = s.screenGeoIds.map((geoId) => {
    const districts = s.districtScope[geoId];
    return districts?.length
      ? { geoId, district: { in: districts, mode: "insensitive" } }
      : { geoId };
  });
  return { AND: [notConflicted, { OR: geoClauses }] };
}

export function canSee(
  s: ScreeningAccess,
  app: { geoId: string | null; district: string | null; conflictUserIds: string[] },
): boolean {
  if (app.conflictUserIds.includes(s.userId)) return false;
  if (s.all) return true;
  if (!app.geoId || !s.screenGeoIds.includes(app.geoId)) return false;
  const districts = s.districtScope[app.geoId];
  if (!districts?.length) return true;
  return !!app.district && districts.some((d) => d.toLowerCase() === app.district!.toLowerCase());
}

export function canLead(s: ScreeningAccess, geoId: string | null): boolean {
  if (s.leadAll) return true;
  return !!geoId && s.leadGeoIds.includes(geoId);
}
