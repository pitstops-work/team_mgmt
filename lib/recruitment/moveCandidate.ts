/**
 * Move one candidate from the desk they were scouted on to the desk for the
 * city they actually belong to.
 *
 * This is a RE-SCOUT, not a row copy, and that distinction is the whole point.
 * A candidate on the unplaced desk was read with no local context at all —
 * nobody checked their language fit, whether the organisations on their CV
 * mean anything in that city, or whether any of that city's local red flags
 * apply. Their radar axes were also chosen for a different pool. Copying that
 * report into Guwahati's desk would drop them into a league table they are not
 * comparable to, carrying a verdict that never asked the questions Guwahati
 * cares about.
 *
 * So the move re-runs the append path against the TARGET desk: the target's
 * job snapshot supplies that city's context, and buildAppendSystemPrompt locks
 * the target's existing axes, which is exactly what makes the newcomer
 * rankable against the people already there.
 *
 * Evidence comes from the `cvText` persisted on every candidate at generation
 * time — the original CV blob is deleted once a desk is built, so there is no
 * file to re-read. Pre-cvText candidates fall back to their prior scout prose,
 * the same degradation regenerateScoutingDay already accepts.
 */

import prisma from "@/lib/prisma";
import { renderScoutingDoc, type ScoutCandidate, type ScoutDocData } from "@/lib/recruitment/renderDoc";
import { appendExtracted } from "@/lib/recruitment/scoutingDayOps";
import { createDeskForCity } from "@/lib/recruitment/createDesk";

type SessionLike = { user?: { id?: string; name?: string | null } | null } | null;

export type MoveResult =
  | { ok: true; toSlug: string; toCandidateId: string; city: string; createdDesk: boolean; name: string }
  | { ok: false; status: number; error: string };

/**
 * Build the evidence block for a candidate being moved. Prefers the stored CV
 * text; otherwise reconstructs what we know from the prior scout report, and
 * says plainly that it is second-hand so the target desk does not over-read it.
 */
function evidenceFor(c: ScoutCandidate): string {
  if (c.cvText && c.cvText.trim()) return c.cvText;
  return [
    `(No CV text was stored for this candidate — the following is a PRIOR SCOUT REPORT, not the CV. Score conservatively and do not invent details beyond it.)`,
    ``,
    `Name: ${c.name}`,
    c.meta ? `Profile: ${c.meta}` : null,
    c.pos ? `Prior positional read: ${c.pos}` : null,
    c.scout ? `Prior scout report: ${c.scout}` : null,
    (c.flags || []).length ? `Prior flags: ${(c.flags || []).map(([sev, t]) => `[${sev}] ${t}`).join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Carry the team's work across with the person.
 *
 * Scores, verdict, notes, asked-question ticks and any interview transcript
 * live in RecruitmentScoutState, keyed by slug then candidate id — and the
 * candidate gets a NEW id on the target desk, so this has to be an explicit
 * re-key. Without it a move silently discards an interview that already
 * happened, which is worse than not offering the move at all.
 *
 * The `city` field is set to the destination so the target desk shows them as
 * allocated rather than asking again.
 */
async function moveSharedState(fromSlug: string, toSlug: string, fromId: string, toId: string, toLocationId: string) {
  const from = await prisma.recruitmentScoutState.findUnique({ where: { slug: fromSlug } });
  const carried = from ? ((from.stateJson as Record<string, unknown>) ?? {})[fromId] : undefined;

  if (carried && typeof carried === "object") {
    const to = await prisma.recruitmentScoutState.findUnique({ where: { slug: toSlug } });
    const toState = { ...(((to?.stateJson as Record<string, unknown>) ?? {}) as Record<string, unknown>) };
    toState[toId] = { ...(carried as Record<string, unknown>), city: toLocationId };
    await prisma.recruitmentScoutState.upsert({
      where: { slug: toSlug },
      create: { slug: toSlug, stateJson: toState as never, version: 1 },
      update: { stateJson: toState as never, version: { increment: 1 } },
    });
  }

  if (from) {
    const rest = { ...((from.stateJson as Record<string, unknown>) ?? {}) };
    delete rest[fromId];
    await prisma.recruitmentScoutState.update({
      where: { slug: fromSlug },
      data: { stateJson: rest as never, version: { increment: 1 } },
    });
  }
}

export async function moveCandidate(
  fromSlug: string,
  candidateId: string,
  toLocationId: string,
  session: SessionLike,
): Promise<MoveResult> {
  const day = await prisma.recruitmentScoutingDay.findUnique({
    where: { slug: fromSlug },
    include: { job: { include: { location: true, locations: { orderBy: { city: "asc" } } } } },
  });
  if (!day) return { ok: false, status: 404, error: "This desk isn't one that can be edited." };
  if (!day.snapshotJson) return { ok: false, status: 400, error: "This desk has no saved snapshot — moving isn't supported on it." };
  if (!day.job) return { ok: false, status: 400, error: "This desk isn't linked to a JD, so it has no cities to move between." };

  const source = day.snapshotJson as unknown as ScoutDocData;
  const candidate = source.candidates.find((c) => c.id === candidateId);
  if (!candidate) return { ok: false, status: 404, error: "That candidate is no longer on this desk — reload and try again." };

  const cities = day.job.locations.length > 0 ? day.job.locations : [day.job.location];
  const target = cities.find((l) => l.id === toLocationId);
  if (!target) return { ok: false, status: 400, error: "That city isn't on this JD." };
  if (day.locationId === toLocationId) {
    return { ok: false, status: 400, error: `${candidate.name} is already on the ${target.city} desk.` };
  }

  // Prefer a desk from the same run; fall back to any desk for this JD+city so
  // a later move still lands somewhere sensible rather than making a duplicate.
  const existingTarget =
    (day.batchId
      ? await prisma.recruitmentScoutingDay.findFirst({
          where: { jobId: day.jobId, locationId: toLocationId, batchId: day.batchId, slug: { not: fromSlug } },
          orderBy: { createdAt: "asc" },
        })
      : null) ??
    (await prisma.recruitmentScoutingDay.findFirst({
      where: { jobId: day.jobId, locationId: toLocationId, slug: { not: fromSlug } },
      orderBy: { createdAt: "desc" },
    }));

  const item = { name: candidate.name, text: evidenceFor(candidate) };
  let toSlug: string;
  let toCandidateId: string;
  let createdDesk = false;

  // ORDER MATTERS. Add to the destination first, and only then remove from
  // here. A failure part-way then leaves a duplicate — visible, and fixable by
  // a second move — rather than deleting someone from the only desk they were
  // on because the destination write failed.
  if (existingTarget) {
    const res = await appendExtracted(existingTarget.slug, [item]);
    if (!res.ok) return { ok: false, status: res.status, error: res.error };
    toSlug = existingTarget.slug;
    toCandidateId = res.addedIds[0];
  } else {
    const res = await createDeskForCity({
      job: day.job,
      location: target,
      // "Seedg Rp — Unplaced" becomes "Seedg Rp — Guwahati": strip the trailing
      // city segment the batch runner added rather than stacking another on.
      titleBase: day.title.replace(/\s+—\s+[^—]*$/, ""),
      matchday: day.matchday,
      batchId: day.batchId,
      items: [item],
      session,
    });
    if (!res.ok) return { ok: false, status: res.status, error: res.error };
    toSlug = res.slug;
    toCandidateId = res.addedIds[0];
    createdDesk = true;
  }

  const remaining: ScoutDocData = {
    ...source,
    candidates: source.candidates.filter((c) => c.id !== candidateId),
  };
  // Blob refresh is best-effort for the same reason as persist(): the DB is
  // what loadDoc renders from, and the candidate has already been added to the
  // destination. Failing here would strand them on both desks.
  try {
    const { put } = await import("@vercel/blob");
    await put(`recruitment/docs/${fromSlug}.html`, renderScoutingDoc(fromSlug, remaining), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/html; charset=utf-8",
    });
  } catch (e) {
    console.error(`[recruitment-move] blob refresh failed for ${fromSlug} (DB still authoritative):`, e instanceof Error ? e.message : e);
  }
  await prisma.recruitmentScoutingDay.update({
    where: { slug: fromSlug },
    data: { snapshotJson: remaining as unknown as never },
  });

  await moveSharedState(fromSlug, toSlug, candidateId, toCandidateId, toLocationId);

  return { ok: true, toSlug, toCandidateId, city: target.city, createdDesk, name: candidate.name };
}
