/**
 * Put the right application reference back on candidates who were renumbered
 * when they were moved between desks.
 *
 * ## What went wrong
 *
 * `moveCandidates` handed the destination desk only a name and the stored CV
 * text. The reference lives in the CV's FILENAME, and the blob is deleted once
 * a desk is built — so the destination re-scout had no reference to read, hit
 * the prompt's fallback ("else the next number after the existing pool") and
 * issued a fresh sequential number. The arrival kept their scores and notes but
 * lost the reference the applicant system knows them by, and the invented
 * numbers landed on top of real references belonging to other applicants:
 * APPRF-2703 is stored against Honnappa Halager on the Bangalore desk and
 * truly belongs to Padma Kr Paw on Guwahati.
 *
 * Fixed forward in lib/recruitment/{moveCandidate,scoutingDayOps,createDesk,
 * generateDesk}.ts — the caller now carries the reference and the server stamps
 * it, so the model cannot renumber anyone. This script repairs what the old
 * path already wrote.
 *
 * ## How a reference is recovered
 *
 * `RecruitmentBatchRun.planJson` still holds every CV filename the run was fed,
 * and those filenames carry the real references. Matching a desk candidate to a
 * filename on NAME recovers it. Where a name resolves to more than one
 * reference — a genuine duplicate submission — nothing is written and the case
 * is printed for someone to decide.
 *
 * Idempotent: a candidate already carrying their real reference is skipped.
 *
 * Usage:
 *   npx tsx scripts/repair-candidate-refs.ts          # dry run, writes nothing
 *   npx tsx scripts/repair-candidate-refs.ts --apply  # write it
 *
 * NOTE: .env.local points at the production Neon endpoint. --apply writes to
 * production.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
// Type-only, so it does not pull the module in ahead of dotenv.config().
import type { ScoutDocData } from "../lib/recruitment/renderDoc";

/** "Sandhya Singh (duplicate submission)" and "Honnappa Halager (dup 3)" are the
 *  same person as the plain name — the parenthetical is the model's own note. */
function nameKey(name: string): string {
  return String(name || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../lib/prisma");
  const { cvCode } = await import("../lib/recruitment/scoutingDayOps");
  const { renderScoutingDoc } = await import("../lib/recruitment/renderDoc");

  // Every real reference still on record, by the name its filename carries.
  const runs = await prisma.recruitmentBatchRun.findMany({ select: { planJson: true } });
  const realByName = new Map<string, Set<string>>();
  for (const run of runs) {
    const plan = run.planJson as { desks?: { cvs?: { name: string }[] }[] } | null;
    for (const desk of plan?.desks ?? []) {
      for (const cv of desk.cvs ?? []) {
        const code = cvCode(cv.name);
        if (!code) continue;
        // "Abdul_Masood_S_APPRF-0768_Resume-xxx.pdf" -> "abdul masood s"
        const key = nameKey(cv.name.split(/_?APPRF/i)[0].replace(/[_-]+/g, " "));
        if (!key) continue;
        if (!realByName.has(key)) realByName.set(key, new Set());
        realByName.get(key)!.add(code);
      }
    }
  }
  console.log(`References recoverable from run filenames: ${realByName.size} people\n`);

  const days = await prisma.recruitmentScoutingDay.findMany({ select: { slug: true, snapshotJson: true } });
  let fixed = 0;
  let ambiguous = 0;
  let alreadyRight = 0;
  let noRecord = 0;

  for (const day of days) {
    const data = day.snapshotJson as unknown as ScoutDocData | null;
    if (!Array.isArray(data?.candidates) || data.candidates.length === 0) continue;

    const changes: string[] = [];
    const candidates = data.candidates.map((c) => {
      const real = realByName.get(nameKey(c.name));
      if (!real) {
        noRecord++;
        return c;
      }
      if (real.has(String(c.code))) {
        alreadyRight++;
        return c;
      }
      if (real.size > 1) {
        // Two CVs, two references, one name. Picking one would be a guess, and
        // a wrong reference is the bug being fixed — so leave it alone.
        console.log(`  ? ${day.slug}: "${c.name}" stored=${c.code} — AMBIGUOUS (${[...real].join(", ")}), left as is`);
        ambiguous++;
        return c;
      }
      const code = [...real][0];
      changes.push(`  ✓ ${day.slug}: "${c.name}" ${c.code} → ${code}`);
      fixed++;
      return { ...c, code };
    });

    if (changes.length === 0) continue;
    console.log(changes.join("\n"));
    if (!apply) continue;

    const repaired: ScoutDocData = { ...data, candidates };
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
  }

  console.log(
    `\n${apply ? "WROTE" : "would fix"}: ${fixed} | ambiguous, skipped: ${ambiguous} | ` +
      `already correct: ${alreadyRight} | no filename on record: ${noRecord}`,
  );
  if (!apply && fixed > 0) console.log("\nDry run — nothing written. Re-run with --apply.");
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
