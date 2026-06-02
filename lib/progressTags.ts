// Single source of truth for pitstop phase tags.
//
// The template editor's "Phase tag" dropdown writes one of these strings onto
// Pitstop.progressTag. UIs that render phase tags (dashboard Phase tab, quarters
// view, pitstop detail) are data-driven — they accept any tag found in goal
// data — but use this list for ordering and colour-coding known tags.

export const PROGRESS_TAGS = [
  "Team", "Baseline", "Permissions", "Infrastructure", "Training", "Live", "Monitoring",
] as const;

export type ProgressTag = typeof PROGRESS_TAGS[number];

type TagColor = { pill: string; filled: string };

const KNOWN_COLORS: Record<string, TagColor> = {
  Team:           { pill: "bg-stone-50 text-stone-700 border-stone-200",       filled: "bg-stone-500" },
  Baseline:       { pill: "bg-sky-50 text-sky-700 border-sky-200",             filled: "bg-sky-500" },
  Permissions:    { pill: "bg-amber-50 text-amber-700 border-amber-200",       filled: "bg-amber-500" },
  Infrastructure: { pill: "bg-violet-50 text-violet-700 border-violet-200",    filled: "bg-violet-500" },
  Training:       { pill: "bg-teal-50 text-teal-700 border-teal-200",          filled: "bg-teal-500" },
  Live:           { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", filled: "bg-emerald-500" },
  Monitoring:     { pill: "bg-rose-50 text-rose-700 border-rose-200",          filled: "bg-rose-500" },
};

const FALLBACK_COLOR: TagColor = {
  pill: "bg-stone-50 text-stone-600 border-stone-200",
  filled: "bg-stone-400",
};

export function progressTagColor(tag: string): TagColor {
  return KNOWN_COLORS[tag] ?? FALLBACK_COLOR;
}

// Order tags by canonical position; tags not in PROGRESS_TAGS are appended
// at the end, sorted alphabetically.
export function orderProgressTags(tags: Iterable<string>): string[] {
  const seen = new Set<string>();
  const canonical: string[] = [];
  const unknown: string[] = [];
  for (const t of tags) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if ((PROGRESS_TAGS as readonly string[]).includes(t)) canonical.push(t);
    else unknown.push(t);
  }
  canonical.sort(
    (a, b) =>
      (PROGRESS_TAGS as readonly string[]).indexOf(a) -
      (PROGRESS_TAGS as readonly string[]).indexOf(b),
  );
  unknown.sort();
  return [...canonical, ...unknown];
}
