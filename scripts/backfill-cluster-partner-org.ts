/**
 * Populate Cluster.partnerOrgId from the partners of each cluster's settlements.
 *
 * The column was added in the 2026-06-04 Org migration ("Partner that runs this
 * cluster — previously inferred from each settlement's partner") and never
 * filled: 0 of 33. That is not a dormant column. Four places read it, and all
 * four quietly get null:
 *
 *   GoalDetail / PitstopDetail / GoalsDashboard
 *       `linkedFacility?.partnerOrg ?? needsCluster?.partnerOrg ?? null`
 *       — so a goal scoped to a cluster rather than a facility shows no partner
 *         badge at all.
 *   /api/map/partner-index
 *       `if (c.partnerOrg) byClusterName[...]` — so the map's cluster→partner
 *       index is empty, and anything resolving a partner by cluster name misses.
 *
 * A cluster gets its partner only when every partnered settlement in it names
 * the same one. Four clusters genuinely span two partners — JJR Nagar
 * (ActionAid + Maarga), Koramangala (CFAR + Maarga), Peenya - West and
 * Yeshwantpur (both CFAR + Janashayog) — and a single-partner column cannot
 * say that. Those are left null, which is exactly what the readers see today,
 * so there is no regression; picking the majority partner would instead put a
 * confident wrong badge on a goal.
 *
 * APPLIED to production 2026-11-04: 27 of 31 clusters set, the 4 above left
 * null. Verified afterwards by an independent read: every stored partner is
 * the unanimous one, and no unanimous cluster was left null.
 *
 * Idempotent and non-destructive: only writes where partnerOrgId is null, and
 * never clears or overwrites one an admin has set by hand.
 *
 * NOTE: .env.local is production. Requires --apply to write.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { default: prisma } = await import("../lib/prisma");

  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY — writing to production\n" : "DRY RUN — nothing is written\n");

  const clusters = await prisma.cluster.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      partnerOrgId: true,
      settlements: {
        where: { deletedAt: null },
        select: { partnerOrg: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  let written = 0;
  const skipped: string[] = [];

  for (const c of clusters) {
    const orgs = [
      ...new Map(
        c.settlements.filter((s) => s.partnerOrg).map((s) => [s.partnerOrg!.id, s.partnerOrg!]),
      ).values(),
    ];

    if (c.partnerOrgId) {
      console.log(`  keep      ${c.name} — already set`);
      continue;
    }
    if (orgs.length === 0) {
      skipped.push(`${c.name} (no partnered settlements)`);
      continue;
    }
    if (orgs.length > 1) {
      skipped.push(`${c.name} (spans ${orgs.map((o) => o.name).join(" + ")})`);
      continue;
    }

    if (apply) {
      await prisma.cluster.update({ where: { id: c.id }, data: { partnerOrgId: orgs[0].id } });
    }
    console.log(`  ${apply ? "set      " : "would set"} ${c.name} → ${orgs[0].name}`);
    written++;
  }

  if (skipped.length) {
    console.log(`\n── left null (${skipped.length}) ──`);
    for (const s of skipped) console.log(`  ${s}`);
  }
  console.log(`\n${apply ? "set" : "would set"} ${written} of ${clusters.length} clusters.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
