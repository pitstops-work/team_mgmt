// One-shot: close the "Capex reconciliation" risk on Yelahanka's plan. The
// ₹87 L annexure figure was accepted as authoritative; the ₹88.2 L in the GC
// note's summary table is a note-side rounding, not a real gap.
//
// Idempotent: runs once, no-ops on re-run.
//
// Usage: node --env-file=.env.local ./node_modules/.bin/tsx scripts/close-yelahanka-capex-risk.ts

import prisma from "@/lib/prisma";

async function main() {
  const rows = await prisma.schoolPlanRisk.updateMany({
    where: {
      description: { startsWith: "Capex reconciliation" },
      status: "open",
      plan: { name: "Yelahanka" },
    },
    data: { status: "closed", mitigation: "Accepted: ₹87 L (annexure) is authoritative; note's ₹88.2 L is a summary-table rounding." },
  });
  console.log(`[close-yelahanka-capex-risk] closed ${rows.count} risk row(s).`);
}
main().catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
