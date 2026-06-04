/**
 * Recompute every Cluster + Zone polygon from the current settlement
 * geometry. Use after extending pointsForSettlement (lib/geo.ts) so the
 * centroid fallback kicks in across the existing data, or after a bulk
 * settlement-import where the per-row recompute hooks were bypassed.
 *
 *   npx tsx scripts/recompute-all-boundaries.ts [--dry-run]
 *
 * Idempotent. Skips clusters/zones with < 3 contributing points (the hull
 * builder bails — same behaviour as the per-row hooks).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { recomputeClusterBoundary, recomputeZoneBoundary } = await import("../lib/geo");

  const clusters = await prisma.cluster.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, geometry: true },
    orderBy: { name: "asc" },
  });
  console.log(`Clusters total: ${clusters.length}${DRY_RUN ? " (dry run — no writes)" : ""}`);

  let bumped = 0;
  for (const c of clusters) {
    if (DRY_RUN) {
      const setCount = await prisma.settlement.count({
        where: { clusterId: c.id, deletedAt: null },
      });
      console.log(`  ${c.name.padEnd(28)} settlements=${setCount} hasGeometry=${c.geometry !== null}`);
      continue;
    }
    const before = c.geometry;
    await recomputeClusterBoundary(c.id, prisma);
    const after = await prisma.cluster.findUnique({ where: { id: c.id }, select: { geometry: true } });
    const changed = JSON.stringify(before) !== JSON.stringify(after?.geometry);
    console.log(`  ${c.name.padEnd(28)} ${changed ? "UPDATED" : "unchanged"}`);
    if (changed) bumped++;
  }

  const zones = await prisma.zone.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`\nZones total: ${zones.length}`);
  let zonesBumped = 0;
  for (const z of zones) {
    if (DRY_RUN) {
      console.log(`  ${z.name}`);
      continue;
    }
    const before = await prisma.zone.findUnique({ where: { id: z.id }, select: { geometry: true } });
    await recomputeZoneBoundary(z.id, prisma);
    const after = await prisma.zone.findUnique({ where: { id: z.id }, select: { geometry: true } });
    const changed = JSON.stringify(before?.geometry) !== JSON.stringify(after?.geometry);
    console.log(`  ${z.name.padEnd(28)} ${changed ? "UPDATED" : "unchanged"}`);
    if (changed) zonesBumped++;
  }

  console.log(`\nClusters updated: ${bumped}/${clusters.length}`);
  console.log(`Zones updated:    ${zonesBumped}/${zones.length}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
