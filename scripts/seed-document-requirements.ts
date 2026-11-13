/**
 * Seed the default document requirements.
 *
 * Dry-run by default; `--apply` writes. Same discipline as
 * scripts/seed-authority-rules.ts, and for the same reason: this writes policy,
 * and `.env.local` points at production.
 *
 *   npx tsx scripts/seed-document-requirements.ts            # show the diff
 *   npx tsx scripts/seed-document-requirements.ts --apply    # write it
 *
 * ── These defaults are a STARTING POINT, not policy ────────────────────────
 *
 * Nobody has written down which documents must be on file before money moves.
 * The delegation-of-authority document that would settle it was never
 * obtained, so the list below is what a grant-maker of this shape usually
 * requires — not what this organisation has decided. It is in a script rather
 * than a migration precisely so that it is a deliberate act by someone who can
 * make the call, and it is additive-upsert so re-running it after an edit does
 * not undo the edit.
 *
 * One thing to know before running it: `releaseGate()` enforces
 * `pre_disbursement` requirements on the FIRST tranche only, and does not read
 * `pre_tranche`, `during_grant` or `pre_closure` at all. Seeding those three
 * records an expectation and gates nothing. The documents screen says so on
 * each row rather than letting a tick box imply a control that is not there.
 */

import type { GrantConditionTiming, GrantDocumentKind } from "../app/generated/prisma/client";

type Req = {
  kind: GrantDocumentKind;
  timing: GrantConditionTiming;
  note: string;
};

/** Global — not scoped to a granting unit. A unit can add its own later. */
const DEFAULTS: Req[] = [
  // Before the first rupee. These three are the ones the gate will enforce.
  {
    kind: "agreement_executed",
    timing: "pre_disbursement",
    note: "The signed agreement itself on file, not merely marked executed.",
  },
  {
    kind: "budget_workbook",
    timing: "pre_disbursement",
    note: "The budget as agreed, so what was approved can be read without the app.",
  },
  {
    kind: "dd_evidence",
    timing: "pre_disbursement",
    note: "Registration and statutory papers gathered during due diligence.",
  },

  // Recorded, not yet enforced — see the note above.
  {
    kind: "utilisation_certificate",
    timing: "pre_tranche",
    note: "Utilisation of the previous tranche before the next is released.",
  },
  {
    kind: "financial_report",
    timing: "pre_tranche",
    note: "Expenditure against the approved lines for the period.",
  },
  {
    kind: "narrative_report",
    timing: "pre_tranche",
    note: "What was done, against what was planned.",
  },
  {
    kind: "audited_accounts",
    timing: "during_grant",
    note: "The grantee's audited accounts for each year the grant spans.",
  },
  {
    kind: "closure_report",
    timing: "pre_closure",
    note: "The final account of the grant.",
  },
  {
    kind: "asset_register",
    timing: "pre_closure",
    note: "Assets bought with grant money, for the exit decision.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const { default: prisma } = await import("../lib/prisma");

  const existing = await prisma.grantDocumentRequirement.findMany({
    where: { grantingUnitId: null },
    select: { id: true, kind: true, timing: true, isActive: true, note: true },
  });
  const key = (k: string, t: string) => `${k}|${t}`;
  const have = new Map(existing.map((r) => [key(r.kind, r.timing), r]));

  const toCreate = DEFAULTS.filter((d) => !have.has(key(d.kind, d.timing)));
  const already = DEFAULTS.filter((d) => have.has(key(d.kind, d.timing)));

  console.log(`\nglobal requirements already present: ${existing.length}`);
  for (const r of existing) {
    console.log(`  = ${r.kind} (${r.timing})${r.isActive ? "" : " [inactive]"}`);
  }

  console.log(`\nwould create: ${toCreate.length}`);
  for (const d of toCreate) console.log(`  + ${d.kind} (${d.timing}) — ${d.note}`);
  if (already.length) {
    console.log(`\nleaving alone: ${already.length}`);
    for (const d of already) console.log(`  . ${d.kind} (${d.timing})`);
  }

  if (!apply) {
    console.log("\nDry run. Nothing written. Re-run with --apply to write.\n");
    await prisma.$disconnect();
    return;
  }

  if (!toCreate.length) {
    console.log("\nNothing to do.\n");
    await prisma.$disconnect();
    return;
  }

  // createMany, not upsert: anything already there was either seeded before or
  // edited by someone, and overwriting an edit is the failure mode this script
  // is shaped to avoid.
  const result = await prisma.grantDocumentRequirement.createMany({
    data: toCreate.map((d) => ({
      kind: d.kind,
      timing: d.timing,
      grantingUnitId: null,
      isActive: true,
      note: d.note,
    })),
  });
  console.log(`\ncreated ${result.count}.\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
