/**
 * Multi-location helpers for recruitment JDs.
 *
 * A JD can run in several cities (`RecruitmentJob.locations`), but GENERATION
 * is strictly single-city: city, language, local reference orgs, local red
 * flags and mobility all enter the SYSTEM prompt from ONE RecruitmentLocation
 * (see lib/recruitment/systemPrompt.ts → jdBlock). Merging several cities'
 * context into one prompt would produce nonsense — "primary language: Tamil,
 * Kannada" with both cities' reference orgs — so every scouting day resolves
 * exactly one location and freezes it into its snapshot.
 *
 * `RecruitmentJob.locationId` is the PRIMARY: it drives the JD slug and is the
 * default pick at generate time. Invariant, enforced here and relied on by the
 * generate route: the primary is always a member of `locations`.
 */

/**
 * Normalise a JD's location set. Dedupes, drops blanks, and guarantees the
 * primary is a member. Returns the primary plus the full set, ready to hand to
 * Prisma's `set` connect.
 *
 * Passing an empty/absent list is valid — a JD with one city is just the
 * primary on its own, which is what every pre-multi-location JD looks like.
 */
export function normaliseLocationIds(primaryId: string, ids: unknown): { primaryId: string; locationIds: string[] } {
  const raw = Array.isArray(ids) ? ids.map((x) => String(x).trim()).filter(Boolean) : [];
  // Primary first so the order is stable and meaningful in the UI.
  const locationIds = [primaryId, ...raw.filter((id) => id !== primaryId)];
  return { primaryId, locationIds: Array.from(new Set(locationIds)) };
}

/**
 * Short label for list rows and headers: "Chennai" for a single-city JD,
 * "Chennai +2" when it also runs elsewhere. Primary always leads.
 */
export function locationLabel(primaryCity: string, totalLocations: number): string {
  const extra = totalLocations - 1;
  return extra > 0 ? `${primaryCity} +${extra}` : primaryCity;
}

/**
 * Pick the location a scouting day should be generated for.
 *
 * - An explicit `requestedId` must be one of the JD's cities — otherwise the
 *   prompt would carry context for a city the role isn't hiring in.
 * - With no request, a single-city JD resolves silently to that city; a
 *   multi-city JD refuses rather than guessing, because picking the wrong one
 *   quietly produces a whole scouting doc judged against the wrong local
 *   context. The caller surfaces this as a required choice in the UI.
 */
export function resolveDayLocation<T extends { id: string; city: string }>(
  candidates: T[],
  primaryId: string,
  requestedId: string | null,
): { location: T } | { error: string } {
  if (candidates.length === 0) return { error: "This JD has no location set." };

  if (requestedId) {
    const hit = candidates.find((l) => l.id === requestedId);
    if (!hit) return { error: "Selected location is not one of this JD's cities." };
    return { location: hit };
  }

  if (candidates.length === 1) return { location: candidates[0] };

  const primary = candidates.find((l) => l.id === primaryId);
  return {
    error: `This JD runs in ${candidates.length} cities (${candidates.map((l) => l.city).join(", ")}). Pick which one this scouting day is for${primary ? ` — defaults to ${primary.city}` : ""}.`,
  };
}
