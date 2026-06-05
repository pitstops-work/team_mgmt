/**
 * Recompute every Cluster + Zone polygon from the current settlement
 * geometry. Useful after a bulk settlement-import where the per-row
 * recompute hooks were bypassed.
 *
 *   npx tsx scripts/recompute-all-boundaries.ts [--dry-run] [--force-all]
 *
 * Idempotent. Skips clusters/zones with < 3 contributing points (the hull
 * builder bails — same behaviour as the per-row hooks).
 *
 * By default this script SKIPS rows where geometrySource = 'manual' so
 * hand-drawn / seeded polygons are never clobbered. Pass --force-all to
 * recompute every row (and flip them all to 'auto'). Don't do that
 * unless you've checked with whoever owns the curated geojson layers.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_ALL = process.argv.includes("--force-all");

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { recomputeClusterBoundary, recomputeZoneBoundary } = await import("../lib/geo");

  const clusters = await prisma.cluster.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, geometry: true, geometrySource: true },
    orderBy: { name: "asc" },
  });
  console.log(`Clusters total: ${clusters.length}${DRY_RUN ? " (dry run — no writes)" : ""}${FORCE_ALL ? " [FORCE-ALL]" : ""}`);

  let bumped = 0;
  let skipped = 0;
  for (const c of clusters) {
    if (!FORCE_ALL && c.geometrySource === "manual") {
      console.log(`  ${c.name.padEnd(28)} skipped (manual)`);
      skipped++;
      continue;
    }
    if (DRY_RUN) {
      const setCount = await prisma.settlement.count({
        where: { clusterId: c.id, deletedAt: null },
      });
      console.log(`  ${c.name.padEnd(28)} settlements=${setCount} hasGeometry=${c.geometry !== null} source=${c.geometrySource}`);
      continue;
    }
    const before = c.geometry;
    await recomputeClusterBoundary(c.id, prisma, { force: FORCE_ALL });
    const after = await prisma.cluster.findUnique({ where: { id: c.id }, select: { geometry: true } });
    const changed = JSON.stringify(before) !== JSON.stringify(after?.geometry);
    console.log(`  ${c.name.padEnd(28)} ${changed ? "UPDATED" : "unchanged"}`);
    if (changed) bumped++;
  }

  const zones = await prisma.zone.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, geometrySource: true },
    orderBy: { name: "asc" },
  });
  console.log(`\nZones total: ${zones.length}`);
  let zonesBumped = 0;
  let zonesSkipped = 0;
  for (const z of zones) {
    if (!FORCE_ALL && z.geometrySource === "manual") {
      console.log(`  ${z.name.padEnd(28)} skipped (manual)`);
      zonesSkipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  ${z.name.padEnd(28)} source=${z.geometrySource}`);
      continue;
    }
    const before = await prisma.zone.findUnique({ where: { id: z.id }, select: { geometry: true } });
    await recomputeZoneBoundary(z.id, prisma, { force: FORCE_ALL });
    const after = await prisma.zone.findUnique({ where: { id: z.id }, select: { geometry: true } });
    const changed = JSON.stringify(before?.geometry) !== JSON.stringify(after?.geometry);
    console.log(`  ${z.name.padEnd(28)} ${changed ? "UPDATED" : "unchanged"}`);
    if (changed) zonesBumped++;
  }

  console.log(`\nClusters updated: ${bumped}/${clusters.length}  (skipped manual: ${skipped})`);
  console.log(`Zones updated:    ${zonesBumped}/${zones.length}  (skipped manual: ${zonesSkipped})`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
