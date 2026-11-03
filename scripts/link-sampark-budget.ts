/**
 * One-off: give Sampark's orphaned budgets their grantee.
 *
 * Sampark was created in the partner registry from the grant notes that name
 * it ("Food Distribution Programme, Bangalore / Implementation Partner:
 * Sampark"). Three budgets carried no grantee at all:
 *
 *   Sampark       — the only one of the 51 whose owner could be read off its
 *                   own name (domain Creche, oddly, while every Sampark note
 *                   describes Food Distribution).
 *   fooddp1       — Others/draft, FoodDistribution. Confirmed Sampark's by the
 *   Kitchen test  — user; the names alone would not have said so, which is why
 *                   neither was linked when the first one was.
 *
 * `Budget.grantPartnerId` must point at a grant relationship in the budget's
 * own granting unit (the same invariant updateBudgetGrantPartner enforces), so
 * the relationship is created for that unit first — "Others", for all three.
 *
 * Idempotent: a budget that already has a grantee is left alone, and
 * ensureGrantRelationship is a no-op when the relationship exists.
 *
 * NOTE: .env.local is production. Requires --apply to write.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

/** Budget names confirmed as Sampark's. Exact matches only — no guessing. */
const BUDGET_NAMES = ["Sampark", "fooddp1", "Kitchen test"];

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { resolvePartnerByName, ensureGrantRelationship } = await import("../lib/partners/registry");

  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY — writing to production\n" : "DRY RUN — nothing is written\n");

  const match = await resolvePartnerByName("Sampark");
  if (!match) throw new Error("Sampark is not in the partner registry");

  for (const name of BUDGET_NAMES) {
    const budget = await prisma.budget.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true, city: true, status: true, domains: true, grantPartnerId: true },
    });
    if (!budget) {
      console.log(`  MISSING   no budget named "${name}"`);
      continue;
    }
    const label = `${budget.name} [${budget.city}/${budget.status}] ${budget.domains.join(",")}`;
    if (budget.grantPartnerId) {
      console.log(`  skip      ${label} — already has a grantee`);
      continue;
    }
    if (!apply) {
      console.log(`  would link ${label} → ${match.partner.name} (via a "${budget.city}" relationship)`);
      continue;
    }
    const rel = await ensureGrantRelationship(match.partner.id, budget.city);
    await prisma.budget.update({ where: { id: budget.id }, data: { grantPartnerId: rel.id } });
    console.log(`  linked    ${label} → ${match.partner.name} (GrantPartner ${rel.id}, unit ${rel.city})`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
