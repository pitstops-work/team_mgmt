// Place search for every /urban picker. Pure: safe in client components.
//
// Ranks by how well the place's OWN NAME matches, not its full path. Matching
// on the path alone made a search for "Bangalore" return every place in
// Bangalore (their paths all end "· Bangalore"), sorted alphabetically, so the
// city itself fell below the cut-off.
export type SearchablePlace = { id: string; level: string; name: string; path: string };

const LEVEL_RANK: Record<string, number> = { city: 0, zone: 1, cluster: 2, settlement: 3, site: 4 };
export const PLACE_LEVELS_ORDERED = ["city", "zone", "cluster", "settlement", "site"] as const;

/** 0 exact · 1 name starts with · 2 a word in the name starts with · 3 name contains · 4 only the path contains · null no match. */
function score(p: SearchablePlace, q: string): number | null {
  const name = p.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.split(/[\s\-·,/()]+/).some((w) => w.startsWith(q))) return 2;
  if (name.includes(q)) return 3;
  if (p.path.toLowerCase().includes(q)) return 4;
  return null;
}

/**
 * Places matching `query`, best first, optionally limited to some levels.
 * An empty query returns the places in level then path order.
 */
export function searchPlaces<T extends SearchablePlace>(places: T[], query: string, levels?: readonly string[]): T[] {
  const pool = levels?.length ? places.filter((p) => levels.includes(p.level)) : places;
  const q = query.trim().toLowerCase();
  const byLevelThenPath = (a: T, b: T) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9) || a.path.localeCompare(b.path);
  if (!q) return [...pool].sort(byLevelThenPath);
  const scored: { p: T; s: number }[] = [];
  for (const p of pool) {
    const s = score(p, q);
    if (s !== null) scored.push({ p, s });
  }
  scored.sort((a, b) => a.s - b.s || byLevelThenPath(a.p, b.p));
  return scored.map((x) => x.p);
}
