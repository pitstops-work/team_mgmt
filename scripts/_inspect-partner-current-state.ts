/**
 * Read-only snapshot of partner-shaped data before the Org migration.
 * Counts MapPartner rows, settlements bound to each, Orgs by kind, and
 * the free-text partner labels living on LayerFeature.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { default: p } = await import("../lib/prisma");

  const mapPartners = await p.mapPartner.findMany({
    select: { id: true, key: true, label: true, isBuiltIn: true, color: true, contactName: true, contactPhone: true, _count: { select: { settlements: true } } },
    orderBy: [{ isBuiltIn: "desc" }, { label: "asc" }],
  });
  console.log(`=== MapPartner rows: ${mapPartners.length} ===`);
  for (const m of mapPartners) console.log(`  ${m.isBuiltIn ? "[built-in]" : "[custom]  "} ${m.label.padEnd(28)} key=${m.key.padEnd(28)} settlements=${m._count.settlements} contact=${m.contactName ?? "—"}`);

  const orgsByKind = await p.org.groupBy({ by: ["kind"], _count: { _all: true } });
  console.log(`\n=== Org rows by kind ===`);
  for (const r of orgsByKind) console.log(`  ${r.kind}: ${r._count._all}`);
  const partnerOrgs = await p.org.findMany({ where: { kind: "partner" }, select: { id: true, name: true, slug: true } });
  console.log(`\nPartner Orgs:`);
  for (const o of partnerOrgs) console.log(`  ${o.name.padEnd(28)} slug=${o.slug}`);

  // Count name collisions between MapPartner.label and Org.name (case-insensitive)
  const collisions: string[] = [];
  for (const m of mapPartners) {
    const hit = partnerOrgs.find((o) => o.name.toLowerCase() === m.label.toLowerCase());
    if (hit) collisions.push(`  "${m.label}" — MapPartner.${m.id} ↔ Org.${hit.id}`);
  }
  console.log(`\nName matches (MapPartner.label ≈ Org.name): ${collisions.length}`);
  for (const c of collisions) console.log(c);

  // LayerFeature.partner free-text distribution
  const layerPartners = await p.$queryRaw<{ partner: string | null; n: bigint }[]>`
    SELECT partner, COUNT(*) AS n FROM "LayerFeature" GROUP BY partner ORDER BY n DESC
  `;
  console.log(`\n=== LayerFeature.partner (free-text) distribution ===`);
  for (const r of layerPartners) console.log(`  ${(r.partner ?? "(null)").padEnd(30)} ${r.n}`);

  // Settlement.partnerId coverage
  const setTotal = await p.settlement.count();
  const setWithPartner = await p.settlement.count({ where: { partnerId: { not: null } } });
  console.log(`\nSettlement: ${setWithPartner}/${setTotal} have partnerId set`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
