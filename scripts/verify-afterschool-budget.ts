// Quick sanity check: pull the Yelahanka plan's budget, load its templates +
// registry + inputs, run the generator, print the section subtotals + grand
// total, and flag any mismatch vs the annexure (Y1 = ₹195.79 L per centre).
//
// Run: node --env-file=.env.local ./node_modules/.bin/tsx scripts/verify-afterschool-budget.ts

import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateBudgetLines } from "../lib/budget-generator";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const plan = await prisma.schoolPlan.findFirst({
    where: { name: "Yelahanka" },
    select: {
      name: true, targetChildrenPerDay: true, budgetId: true,
      budget: { select: { id: true, city: true, domains: true, inputs: true } },
    },
  });
  if (!plan?.budget) throw new Error("Yelahanka has no budget.");

  // Load templates for the budget's city, filtered to its domains.
  const raw = await prisma.lineTemplate.findMany({
    where: { city: plan.budget.city },
    orderBy: { position: "asc" },
  });
  const templates = raw.map((t) => ({ ...t, isActive: t.isActive ?? true }));

  const registryRows = await prisma.costRegistry.findMany({
    where: { city: plan.budget.city },
    select: { itemKey: true, unitCost: true },
  });
  const registry: Record<string, number> = {};
  for (const r of registryRows) registry[r.itemKey] = r.unitCost;

  const bi = plan.budget.inputs;
  const inp: Record<string, number> = {
    nSettlements: 0, nClusters: 0, nCLCs: 0, clcRentPerMonth: 0,
    nYRCs: 0, yrcRentPerMonth: 0, nElderlyCentres: 0, nElderly: 0,
    elderlyCentreRentPerMonth: 0, cosPerCluster: 0, rcRentPerMonth: 0,
    nCreches: 0, crecheRentPerMonth: 0,
    ...(bi?.extraInputs ?? {}) as Record<string, number>,
  };

  const opts = {
    applyInflation: true,
    inflationSalaryPct: 10, inflationOtherPct: 5, inflationNilPct: 0,
    horizonMonths: 60, partialPosition: "end" as const,
  };

  const lines = generateBudgetLines(plan.budget.domains, inp as never, opts as never, registry, templates as never);
  const bySection: Record<string, number> = {};
  for (const l of lines) {
    bySection[l.section] = (bySection[l.section] ?? 0) + (l.y1Total ?? 0);
  }
  const capex     = bySection.capex ?? 0;
  const salary    = bySection.salary ?? 0;
  const travel    = bySection.travel ?? 0;
  const programme = bySection.programme ?? 0;
  const total     = capex + salary + travel + programme;
  const recurring = salary + travel + programme;

  const lakh = (r: number) => `₹${(r / 1_00_000).toFixed(2)} L`;

  console.log(`Yelahanka · nAfterSchoolCentres=${inp.nAfterSchoolCentres} · targetChildrenPerDay=${inp.targetChildrenPerDay}`);
  console.log(`Y1 sections:`);
  console.log(`  capex     ${lakh(capex)}   [annexure 87.00 L]`);
  console.log(`  salary    ${lakh(salary)}   [annexure 74.76 L]`);
  console.log(`  travel    ${lakh(travel)}   [annexure 0.36 L]`);
  console.log(`  programme ${lakh(programme)}   [annexure 33.67 L]`);
  console.log(`  recurring ${lakh(recurring)}   [annexure 108.79 L]`);
  console.log(`  TOTAL     ${lakh(total)}   [annexure 195.79 L]`);
  console.log(`  ${lines.length} lines generated\n`);

  // Dump every line so any mismatch is obvious.
  console.log("Per-line detail (Y1 only):");
  for (const l of lines) {
    if ((l.y1Total ?? 0) === 0) continue;
    console.log(`  [${String(l.section).padEnd(10)}] ${(l.templateKey ?? l.description).padEnd(40)} = ₹${(l.y1Total / 1_00_000).toFixed(2)} L  (${l.description})`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
