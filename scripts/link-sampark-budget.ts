/**
 * One-off: give the orphaned "Sampark" budget its grantee.
 *
 * Sampark was created in the partner registry from the grant notes that name
 * it ("Food Distribution Programme, Bangalore / Implementation Partner:
 * Sampark"), and there is a budget called "Sampark" carrying no grantee at all
 * — the only one of the 51 grantee-less budgets whose owner can be read off
 * its own name. This links the two.
 *
 * `Budget.grantPartnerId` must point at a grant relationship in the budget's
 * own granting unit (the same invariant updateBudgetGrantPartner enforces), so
 * the relationship is created for that unit first — "Others", for this budget.
 *
 * Idempotent: a budget that already has a grantee is left alone, and
 * ensureGrantRelationship is a no-op when the relationship exists.
 *
 * NOTE: .env.local is production. Requires --apply to write.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { resolvePartnerByName, ensureGrantRelationship } = await import("../lib/partners/registry");

  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY — writing to production\n" : "DRY RUN — nothing is written\n");

  const budget = await prisma.budget.findFirst({
    where: { name: { equals: "Sampark", mode: "insensitive" } },
    select: { id: true, name: true, city: true, status: true, domains: true, grantPartnerId: true },
  });
  if (!budget) throw new Error('No budget named "Sampark"');

  console.log(
    `  budget: ${budget.name} [${budget.city}/${budget.status}] ` +
      `domains=${budget.domains.join(",")} grantee=${budget.grantPartnerId ?? "NONE"}`,
  );

  if (budget.grantPartnerId) {
    console.log("  already has a grantee — nothing to do");
    await prisma.$disconnect();
    return;
  }

  const match = await resolvePartnerByName("Sampark");
  if (!match) throw new Error("Sampark is not in the partner registry");

  if (!apply) {
    console.log(
      `  would give ${match.partner.name} a grant relationship with "${budget.city}" ` +
        `and point the budget at it`,
    );
    await prisma.$disconnect();
    return;
  }

  const rel = await ensureGrantRelationship(match.partner.id, budget.city);
  await prisma.budget.update({ where: { id: budget.id }, data: { grantPartnerId: rel.id } });
  console.log(`  linked ${budget.name} → ${match.partner.name} (GrantPartner ${rel.id}, unit ${rel.city})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
