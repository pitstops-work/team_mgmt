/**
 * Theme catalog for the Operations world.
 *
 * A "theme" is a needs domain (Creche, Children Centre, Youth, Welfare, RO
 * Water, Elderly, Food…). It's enumerable from the same admin-editable config
 * the rest of the app already uses:
 *   - NeedsFormulaConfig  → the domain list + label + colour (`/settings/needs`)
 *   - FacilityLayerConfig → which domains are backed by a physical facility
 *                           layer (creches / youth_centres / …) via needsDomain
 *
 * Facility themes (isFacility) enumerate their centres as LayerFeature rows;
 * non-facility themes (Welfare, zonal review) enumerate clusters/settlements.
 *
 * The catalog is the full set; a given person only sees the themes they own
 * goals in — that intersection happens in the page loader, not here.
 */

import prisma from "@/lib/prisma";

export type ThemeDef = {
  /** Domain key, matches Goal.needsDomain (e.g. "Creche"). */
  key: string;
  label: string;
  color: string;
  /** Facility layer key when this theme is facility-backed, else null. */
  layerKey: string | null;
  isFacility: boolean;
  sortOrder: number;
};

/** Load the full theme catalog, sorted by the domain's configured sortOrder. */
export async function loadThemeCatalog(): Promise<ThemeDef[]> {
  const [domains, facilities] = await Promise.all([
    prisma.needsFormulaConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { domain: true, label: true, color: true, sortOrder: true },
    }),
    prisma.facilityLayerConfig.findMany({
      where: { isActive: true },
      select: { layerKey: true, needsDomain: true },
    }),
  ]);

  const layerByDomain = new Map<string, string>();
  for (const f of facilities) {
    if (f.needsDomain && !layerByDomain.has(f.needsDomain)) {
      layerByDomain.set(f.needsDomain, f.layerKey);
    }
  }

  return domains.map((d) => {
    const layerKey = layerByDomain.get(d.domain) ?? null;
    return {
      key: d.domain,
      label: d.label ?? d.domain,
      color: d.color,
      layerKey,
      isFacility: layerKey !== null,
      sortOrder: d.sortOrder,
    };
  });
}

/** Index a catalog by domain key for O(1) decoration of goals. */
export function indexThemes(catalog: ThemeDef[]): Map<string, ThemeDef> {
  return new Map(catalog.map((t) => [t.key, t]));
}

/**
 * Resolve a goal's theme key. Prefers the explicit needsDomain; falls back to
 * the domain implied by the goal's linked facility layer (a goal can point at a
 * creche without carrying needsDomain). Returns null when neither resolves.
 */
export function resolveGoalThemeKey(
  goal: { needsDomain: string | null; linkedFacility?: { layerKey: string } | null },
  layerKeyToDomain: Map<string, string>,
): string | null {
  if (goal.needsDomain) return goal.needsDomain;
  const lk = goal.linkedFacility?.layerKey;
  if (lk) return layerKeyToDomain.get(lk) ?? null;
  return null;
}

/** Build a layerKey → domain lookup from active facility configs. */
export async function loadLayerToDomain(): Promise<Map<string, string>> {
  const facilities = await prisma.facilityLayerConfig.findMany({
    where: { isActive: true, needsDomain: { not: null } },
    select: { layerKey: true, needsDomain: true },
  });
  const m = new Map<string, string>();
  for (const f of facilities) if (f.needsDomain) m.set(f.layerKey, f.needsDomain);
  return m;
}
