/**
 * Collapse duplicate candidate rows on a scouting desk, keeping the row that
 * carries the team's work.
 *
 * ## Why there are duplicates
 *
 * The temp CV area holds one copy of a pool for every time it was uploaded, and
 * the 2026-09-22/23 recovery run was handed all of them: 173 CVs that were only
 * ~46 distinct people. `runOneChunk`'s code-based dedupe (`codesOnDesk`) landed
 * AFTER that run, so nothing stopped the same person being scouted three and
 * four times over. New runs are protected; these rows are the residue.
 *
 * ## Which row survives
 *
 * The one with the team's work on it — score, verdict, notes, asked-question
 * ticks or an attached transcript, all of which live in RecruitmentScoutState
 * keyed by slug then candidate id. If exactly one row in a group has work, it
 * wins. If none do, the earliest row wins (scouting order, so the pool reads
 * the way it was built). If TWO rows both carry work the group is REPORTED AND
 * SKIPPED — merging would mean choosing whose interview to discard, and that is
 * not a script's call.
 *
 * Grouping needs the application reference AND the name to agree — see groupKey
 * for why the reference alone is not safe. Run scripts/repair-candidate-refs.ts
 * first anyway, so the references being compared are the real ones.
 *
 * Usage:
 *   npx tsx scripts/dedupe-desk-candidates.ts                    # dry run
 *   npx tsx scripts/dedupe-desk-candidates.ts --apply            # write it
 *   npx tsx scripts/dedupe-desk-candidates.ts --slug=<desk-slug> # one desk
 *
 * NOTE: .env.local points at the production Neon endpoint. --apply writes to
 * production.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import type { ScoutCandidate, ScoutDocData } from "../lib/recruitment/renderDoc";

type State = Record<string, Record<string, unknown> | undefined>;

/** How much of the team's work sits on this candidate row. */
function workOn(st: Record<string, unknown> | undefined): { score: number; what: string[] } {
  if (!st) return { score: 0, what: [] };
  const what: string[] = [];
  if (st.score != null) what.push(`score ${st.score}`);
  if (st.verdict) what.push(String(st.verdict));
  if (typeof st.notes === "string" && st.notes.trim()) what.push(`notes (${st.notes.trim().length}ch)`);
  if (st.transcript) what.push("transcript");
  const asked = Object.values((st.asked as Record<string, unknown>) ?? {}).filter(Boolean).length;
  if (asked) what.push(`${asked} qs asked`);
  return { score: what.length, what };
}

/** "Hrushikesh Patra (dup)" and "Esther Gangmei (dup 3)" are the same person as
 *  the plain name — the parenthetical is the model's own duplicate note. */
function nameKey(name: string): string {
  return String(name || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * Two rows are the same person only if the reference AND the name agree.
 *
 * The reference alone is not enough, and the dry run proved it: on the Guwahati
 * desk a candidate still carrying an INVENTED APPRF-2703 sat next to Padma Kr
 * Paw, whose real reference is APPRF-2703. Grouping on the code alone offered to
 * delete one of two different applicants. Any desk still holding invented
 * references (see scripts/repair-candidate-refs.ts, and the collisions it could
 * not resolve) would hit the same trap, so the name is part of identity here.
 */
function groupKey(c: ScoutCandidate, cvCode: (n: string) => string | null): string {
  const code = cvCode(String(c.code ?? "")) ?? String(c.code ?? "").trim().toUpperCase();
  return `${code || "nocode"}|${nameKey(c.name)}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const only = process.argv.find((a) => a.startsWith("--slug="))?.slice("--slug=".length);

  const { prisma } = await import("../lib/prisma");
  const { cvCode } = await import("../lib/recruitment/scoutingDayOps");
  const { renderScoutingDoc } = await import("../lib/recruitment/renderDoc");

  const days = await prisma.recruitmentScoutingDay.findMany({
    where: only ? { slug: only } : {},
    select: { slug: true, snapshotJson: true },
    orderBy: { createdAt: "asc" },
  });
  if (only && days.length === 0) throw new Error(`No desk with slug "${only}"`);

  let dropped = 0;
  let conflicts = 0;
  let desksTouched = 0;

  for (const day of days) {
    const data = day.snapshotJson as unknown as ScoutDocData | null;
    if (!Array.isArray(data?.candidates) || data.candidates.length === 0) continue;

    const stateRow = await prisma.recruitmentScoutState.findUnique({ where: { slug: day.slug } });
    const state = ((stateRow?.stateJson as State) ?? {}) as State;

    // Group in scouting order, so "earliest" means what it looks like on the desk.
    const groups = new Map<string, ScoutCandidate[]>();
    for (const c of data.candidates) {
      const k = groupKey(c, cvCode);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(c);
    }

    const drop = new Set<string>();
    const lines: string[] = [];
    for (const [key, rows] of groups) {
      if (rows.length < 2) continue;
      const worked = rows.filter((c) => workOn(state[c.id]).score > 0);
      if (worked.length > 1) {
        conflicts++;
        lines.push(
          `  ! ${key} — ${rows.length} rows, ${worked.length} of them carry work, SKIPPED:\n` +
            worked.map((c) => `      "${c.name}" (${c.id}): ${workOn(state[c.id]).what.join(", ")}`).join("\n"),
        );
        continue;
      }
      const keeper = worked[0] ?? rows[0];
      const losers = rows.filter((c) => c.id !== keeper.id);
      const why = worked[0] ? `carries ${workOn(state[keeper.id]).what.join(", ")}` : "earliest, no work on any row";
      lines.push(
        `  ✓ ${key} — keep "${keeper.name}" (${keeper.id}, ${why}); drop ${losers.map((c) => `"${c.name}" (${c.id})`).join(", ")}`,
      );
      for (const c of losers) drop.add(c.id);
      dropped += losers.length;
    }

    if (lines.length === 0) continue;
    desksTouched++;
    console.log(`\n${day.slug} (${data.candidates.length} rows):`);
    console.log(lines.join("\n"));
    if (!apply || drop.size === 0) continue;

    const repaired: ScoutDocData = { ...data, candidates: data.candidates.filter((c) => !drop.has(c.id)) };

    // Drop the dead rows' state too. Every one of them is empty — a row with
    // work on it is either the keeper or a skipped conflict — so nothing the
    // team did is discarded here.
    if (stateRow) {
      const rest: State = { ...state };
      for (const id of drop) delete rest[id];
      await prisma.recruitmentScoutState.update({
        where: { slug: day.slug },
        data: { stateJson: rest as never, version: { increment: 1 } },
      });
    }

    // Blob is a render cache — loadDoc re-renders from snapshotJson — so a blob
    // failure must not lose the DB write.
    try {
      const { put } = await import("@vercel/blob");
      await put(`recruitment/docs/${day.slug}.html`, renderScoutingDoc(day.slug, repaired), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/html; charset=utf-8",
      });
    } catch (e) {
      console.error(`    blob refresh failed for ${day.slug} (DB still authoritative):`, e instanceof Error ? e.message : e);
    }
    await prisma.recruitmentScoutingDay.update({
      where: { slug: day.slug },
      data: { snapshotJson: repaired as unknown as never },
    });
    console.log(`    → ${data.candidates.length} rows becomes ${repaired.candidates.length}`);
  }

  console.log(
    `\n${apply ? "DROPPED" : "would drop"}: ${dropped} duplicate rows across ${desksTouched} desk(s) | ` +
      `conflicts left for a human: ${conflicts}`,
  );
  if (!apply && dropped > 0) console.log("\nDry run — nothing written. Re-run with --apply.");
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
