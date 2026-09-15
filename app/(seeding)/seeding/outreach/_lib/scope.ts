// Shared scope helpers for the outreach pages. Filters travel in searchParams
// so every view is a shareable URL and the client components stay dumb (the
// rest of /seeding has no client-side data fetching either).

import { CENTRAL_KEY, CENTRAL_LABEL } from "@/lib/seeding/outreach";

export type GeoOption = { id: string | null; key: string; label: string };

/** Geo picker options, with the central/national bucket appended. */
export function geoOptions(geos: { id: string; key: string; label: string }[]): GeoOption[] {
  return [...geos, { id: null, key: CENTRAL_KEY, label: CENTRAL_LABEL }];
}

/**
 * Resolve a `?geo=` param to a geo id. Returns:
 *   undefined → no filter (all geographies)
 *   null      → the central/national bucket (geoId IS NULL)
 *   string    → that geo's id
 */
export function resolveGeoParam(
  raw: string | undefined,
  geos: { id: string; key: string }[],
): string | null | undefined {
  if (!raw) return undefined;
  if (raw === CENTRAL_KEY) return null;
  const match = geos.find((g) => g.id === raw || g.key === raw);
  return match ? match.id : undefined;
}

/** Turn a resolved geo scope into a Prisma `where` fragment. */
export function geoWhere(scope: string | null | undefined): { geoId?: string | null } {
  if (scope === undefined) return {};
  return { geoId: scope };
}

export const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
