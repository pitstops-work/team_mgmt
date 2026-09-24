import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSeedingAccess } from "@/lib/seeding/access";
import { getScreeningAccess, type ScreeningAccess } from "@/lib/seeding/screening/access";
import { rubricFor, totalScore, type Rubric } from "@/lib/seeding/screening/rubric";
import type { AiDraft } from "@/lib/seeding/screening/draft";

/** Screening access for a page, or null when this person has none. */
export async function pageAccess(): Promise<ScreeningAccess | null> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return getScreeningAccess(await getSeedingAccess(session));
}

/** Rubrics by geography key, loaded once per page. */
export function rubricCache() {
  const cache = new Map<string, Promise<Rubric>>();
  return (geoKey: string | null) => {
    const k = geoKey ?? "";
    if (!cache.has(k)) cache.set(k, rubricFor(geoKey));
    return cache.get(k)!;
  };
}

export function aiTotal(rubric: Rubric, draft: unknown, isGroup: boolean): number | null {
  const d = draft as AiDraft | null;
  if (!d?.scores) return null;
  const scores = Object.fromEntries(Object.entries(d.scores).map(([k, v]) => [k, v.score]));
  return totalScore(rubric.dimensions, scores, isGroup);
}
