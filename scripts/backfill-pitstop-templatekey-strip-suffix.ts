/**
 * Backfill: strip legacy "-month-N" / "-week-N" / "-q-N" suffixes from
 * Pitstop.templateKey so they match the template's effectiveKey.
 *
 * Background. Template-apply currently sets `templateKey = slugify(inst.pt.title)`
 * (the template's *original* title — no per-instance suffix). But an older
 * version of that code used `slugify(inst.title)` (which appends " (Month N)"
 * for recurring instances). The 2026-05-27 trim-repeatcount-surplus script
 * collapsed those instances back to a single "Month 1" row but didn't reset the
 * templateKey, leaving rows like `monthly-creche-rounds-month-1` whose key no
 * longer matches the template's `monthly-creche-rounds`.
 *
 * Symptom: template-sync diff sees those instances as orphans (templateKey not
 * in `templateKeys` set) AND wants to add new ones — meaning admin edits to
 * those slots don't propagate, and removing the slot from the template
 * correctly emits a remove (because the legacy key isn't in templateKeys
 * either) but instances of the *current* template slot don't roll up.
 *
 * Fix shape: per-row UPDATE setting templateKey = strip(-month|week|q-\d+$).
 * Skip rows whose stripped key collides with another instance on the same
 * (goalId, templateSlug) to avoid silently merging two distinct slots; surface
 * those for manual review.
 *
 * Run:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/backfill-pitstop-templatekey-strip-suffix.ts            # dry-run
 *   npx tsx scripts/backfill-pitstop-templatekey-strip-suffix.ts --apply    # commit
 */

import prisma from "../lib/prisma";

const apply = process.argv.includes("--apply");

function stripLegacySuffix(key: string): string {
  return key.replace(/-(?:month|week|q)-?\d+$/, "");
}

async function main() {
  const candidates = await prisma.$queryRaw<{
    id: string; goalId: string; templateSlug: string; templateKey: string; title: string;
  }[]>`
    SELECT id, "goalId", "templateSlug", "templateKey", title
    FROM "Pitstop"
    WHERE "templateKey" IS NOT NULL
      AND "templateSlug" IS NOT NULL
      AND "deletedAt" IS NULL
      AND "templateKey" ~ '-(month|week|q)-?[0-9]+$'
    ORDER BY "goalId", "templateKey"
  `;

  console.log(`${candidates.length} pitstop row(s) with legacy-suffixed templateKey.\n`);
  if (candidates.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Collision check: for each (goalId, templateSlug), would the stripped key
  // collide with an EXISTING (non-suffixed) pitstop in the same goal? If so,
  // keep the suffix and surface for review — merging would lose history.
  const existingByKey = new Map<string, Set<string>>();
  const existingRows = await prisma.$queryRaw<{ goalId: string; templateSlug: string; templateKey: string }[]>`
    SELECT "goalId", "templateSlug", "templateKey"
    FROM "Pitstop"
    WHERE "templateKey" IS NOT NULL
      AND "templateSlug" IS NOT NULL
      AND "deletedAt" IS NULL
      AND "templateKey" !~ '-(month|week|q)-?[0-9]+$'
  `;
  for (const r of existingRows) {
    const k = `${r.goalId}::${r.templateSlug}`;
    const set = existingByKey.get(k) ?? new Set<string>();
    set.add(r.templateKey);
    existingByKey.set(k, set);
  }

  const updates: { id: string; from: string; to: string; goalId: string; title: string }[] = [];
  const collisions: typeof candidates = [];

  for (const c of candidates) {
    const stripped = stripLegacySuffix(c.templateKey);
    const goalKey = `${c.goalId}::${c.templateSlug}`;
    const existing = existingByKey.get(goalKey);
    if (existing?.has(stripped)) {
      collisions.push(c);
      continue;
    }
    updates.push({ id: c.id, from: c.templateKey, to: stripped, goalId: c.goalId, title: c.title });
  }

  console.log(`Updates planned: ${updates.length}`);
  for (const u of updates) {
    console.log(`  ${u.id}  "${u.title}"`);
    console.log(`    ${u.from}  →  ${u.to}`);
  }

  if (collisions.length > 0) {
    console.log(`\nSkipped due to collision (review manually): ${collisions.length}`);
    for (const c of collisions) {
      console.log(`  ${c.id}  ${c.goalId}  ${c.templateKey}  "${c.title}"`);
    }
  }

  if (!apply) {
    console.log("\nDry-run only. Pass --apply to commit.");
    return;
  }

  console.log("\nApplying…");
  let n = 0;
  for (const u of updates) {
    await prisma.$executeRaw`
      UPDATE "Pitstop" SET "templateKey" = ${u.to}, "updatedAt" = NOW() WHERE id = ${u.id}
    `;
    n++;
  }
  console.log(`Done. ${n} rows updated.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
