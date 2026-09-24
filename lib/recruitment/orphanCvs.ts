/**
 * Temp CVs left behind in the upload area, and what can still be done with them.
 *
 * `recruitment/cv-tmp/` holds a pool between upload and scouting. A run that
 * completes clears its own; a run that is abandoned — at the triage screen, or
 * by a failure nobody came back to — leaves its CVs there forever. Before the
 * server owned runs, that was every interrupted run: the 89-CV run of
 * 2026-09-22 stopped at 48 scouted and left 41 CVs with nothing pointing at
 * them, because the only record of their URLs was a React state object in a
 * tab that had since been closed.
 *
 * Listing them is only possible server-side (the store is private and its
 * token is a sensitive project env var), which is why this is a server helper
 * feeding the page rather than a script.
 *
 * ## Matching a leftover CV to a candidate
 *
 * On the APPRF code in the filename — `Harivishnu_Mishra_APPRF-2418.pdf` — and
 * `code` on the scouted candidate. On the 2026-09-22 pool that was 48 distinct
 * codes with no collisions. A CV whose filename carries no code can't be
 * matched either way, so it is reported separately rather than guessed at:
 * treating it as scouted risks deleting a CV nobody has read, and treating it
 * as unscouted risks scouting someone twice.
 */

import { list } from "@vercel/blob";
import prisma from "@/lib/prisma";
import type { CvRef } from "@/lib/recruitment/scoutingDayOps";
import { cvCode as codeOf, readPlan } from "@/lib/recruitment/batchRunner";

export type TempCv = CvRef & { code: string | null; uploadedAt: string };

export type TempCvSurvey = {
  /** Uploaded, never scouted, and not part of a run currently in flight. */
  unscouted: TempCv[];
  /** Already on a desk — the run that used them just never cleaned up. */
  scouted: TempCv[];
  /** No APPRF code in the filename, so neither claim can be made safely. */
  unmatched: TempCv[];
  /**
   * Further uploads of a CV already in `unscouted`. A pool that was uploaded
   * four times sits here four times over; scouting every copy puts the same
   * person on the desk four times. Once the first copy is scouted these
   * become `scouted`, and clearable.
   */
  copies: TempCv[];
  /** Held by a live run. Left strictly alone. */
  inFlight: number;
};

export async function surveyTempCvs(): Promise<TempCvSurvey> {
  const blobs: TempCv[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "recruitment/cv-tmp/", cursor, limit: 1000 });
    for (const b of page.blobs) {
      const name = b.pathname.replace(/^recruitment\/cv-tmp\//, "");
      blobs.push({ url: b.url, name, code: codeOf(name), uploadedAt: b.uploadedAt.toISOString() });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const survey: TempCvSurvey = { unscouted: [], scouted: [], unmatched: [], copies: [], inFlight: 0 };
  // Nothing in the temp area is the normal case, and it must not cost a
  // snapshot scan on every page load.
  if (blobs.length === 0) return survey;

  // A run still working is the owner of its CVs — never offer them.
  const live = await prisma.recruitmentBatchRun.findMany({
    where: { status: { in: ["running", "failed"] } },
    select: { planJson: true },
  });
  const claimed = new Set<string>();
  for (const r of live) for (const d of readPlan(r).desks) for (const cv of d.cvs) claimed.add(cv.url);

  // Pull the codes out in SQL. Loading every snapshot to read one field per
  // candidate would drag each desk's full cvText through the app — megabytes,
  // on a page that renders a list of links.
  const rows = await prisma.$queryRaw<{ code: string | null }[]>`
    SELECT DISTINCT c->>'code' AS code
    FROM "RecruitmentScoutingDay",
         LATERAL jsonb_array_elements("snapshotJson"->'candidates') AS c
    WHERE jsonb_typeof("snapshotJson"->'candidates') = 'array'
  `;
  const scoutedCodes = new Set(rows.map((r) => r.code?.toUpperCase()).filter(Boolean) as string[]);
  // Oldest first, so the copy kept for scouting is the original upload.
  blobs.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const taken = new Set<string>();
  for (const b of blobs) {
    if (claimed.has(b.url)) survey.inFlight++;
    else if (!b.code) survey.unmatched.push(b);
    else if (scoutedCodes.has(b.code.toUpperCase())) survey.scouted.push(b);
    else if (taken.has(b.code)) survey.copies.push(b);
    else {
      taken.add(b.code);
      survey.unscouted.push(b);
    }
  }
  const byName = (a: TempCv, b: TempCv) => a.name.localeCompare(b.name);
  survey.unscouted.sort(byName);
  survey.scouted.sort(byName);
  survey.unmatched.sort(byName);
  return survey;
}
