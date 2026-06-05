/**
 * Restore hand-drawn Cluster + Zone polygons from the curated geojson
 * files in public/data/. Use after the geometrySource migration to undo
 * any clobbering by the early auto-recompute hooks (commit 1236e74) +
 * the one-shot scripts/recompute-all-boundaries.ts run.
 *
 *   npx tsx scripts/restore-cluster-zone-polygons.ts [--dry-run]
 *
 * Matching rules (mirror prisma/seed-spatial.ts):
 *  - Zones: "Chennai – Foo" → Foo in city=Chennai, else Foo in city=Bangalore.
 *  - Clusters: case-insensitive, hyphen/underscore/space-insensitive.
 *
 * Side effects on a non-dry run:
 *  - UPDATE "Cluster"  SET geometry = <hand-drawn>, color, label,
 *                          "geometrySource" = 'manual'
 *  - UPDATE "Zone"     SET geometry = <hand-drawn>, color,
 *                          "geometrySource" = 'manual'
 *
 * Idempotent. Logs UPDATED / unchanged / no-match per row.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const DATA_DIR = path.join(process.cwd(), "public/data");

function readGeoJSON(file: string) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
}

const normalize = (s: string) =>
  (s ?? "").toLowerCase().replace(/[_\-\s]+/g, " ").trim();

async function restoreZones(prisma: import("../app/generated/prisma/client").PrismaClient) {
  const gj = readGeoJSON("zones.geojson");
  const zones = await prisma.zone.findMany({
    where: { deletedAt: null },
    include: { city: true },
  });
  let updated = 0;
  let unchanged = 0;
  let missing = 0;
  console.log(`\nZones in geojson: ${gj.features.length}${DRY_RUN ? " (dry run — no writes)" : ""}`);
  for (const feature of gj.features) {
    const rawName = feature.properties?.zone as string;
    const color = (feature.properties?.color as string | undefined) ?? null;
    const isChennai = rawName?.startsWith("Chennai");
    const zoneName = isChennai
      ? rawName.replace(/^Chennai\s*[–-]\s*/u, "").trim()
      : rawName;
    const cityFilter = isChennai ? "chennai" : "bangalore";

    const zone = zones.find((z) => {
      const nameMatch = normalize(z.name) === normalize(zoneName ?? "");
      const cityMatch = z.city?.name?.toLowerCase().includes(cityFilter);
      return nameMatch && cityMatch;
    });
    if (!zone) {
      console.warn(`  ${rawName.padEnd(28)} NO MATCH in DB`);
      missing++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  ${rawName.padEnd(28)} → ${zone.name} (city=${zone.city?.name ?? "?"})`);
      continue;
    }
    const before = await prisma.zone.findUnique({
      where: { id: zone.id },
      select: { geometry: true, geometrySource: true },
    });
    await prisma.$executeRaw`
      UPDATE "Zone"
         SET geometry = ${JSON.stringify(feature.geometry)}::jsonb,
             color = ${color},
             "geometrySource" = 'manual'
       WHERE id = ${zone.id}
    `;
    const changed =
      JSON.stringify(before?.geometry) !== JSON.stringify(feature.geometry) ||
      before?.geometrySource !== "manual";
    console.log(`  ${rawName.padEnd(28)} ${changed ? "UPDATED" : "unchanged"}`);
    if (changed) updated++;
    else unchanged++;
  }
  console.log(`Zones: updated=${updated} unchanged=${unchanged} missing=${missing}`);
}

async function restoreClusters(prisma: import("../app/generated/prisma/client").PrismaClient) {
  const gj = readGeoJSON("clusters.geojson");
  const clusters = await prisma.cluster.findMany({
    where: { deletedAt: null },
    include: { zone: { include: { city: true } } },
  });
  let updated = 0;
  let unchanged = 0;
  let missing = 0;
  console.log(`\nClusters in geojson: ${gj.features.length}${DRY_RUN ? " (dry run — no writes)" : ""}`);
  for (const feature of gj.features) {
    const name = feature.properties?.cluster as string;
    const color = (feature.properties?.color as string | undefined) ?? null;
    const label = (feature.properties?.label as string | undefined) ?? null;
    const zoneHint = feature.properties?.zone as string | undefined;

    // Cluster names can collide across cities (e.g. duplicates after the
    // Chennai import). When the geojson carries a zone hint, prefer the
    // cluster whose zone normalises the same way.
    const matches = clusters.filter((c) => normalize(c.name) === normalize(name ?? ""));
    let cluster: typeof matches[number] | undefined;
    if (matches.length === 1) cluster = matches[0];
    else if (matches.length > 1 && zoneHint) {
      const isChennai = zoneHint.startsWith("Chennai");
      const zoneOnly = isChennai
        ? zoneHint.replace(/^Chennai\s*[–-]\s*/u, "").trim()
        : zoneHint;
      cluster = matches.find((c) =>
        normalize(c.zone.name) === normalize(zoneOnly) &&
        (isChennai
          ? c.zone.city?.name?.toLowerCase().includes("chennai")
          : c.zone.city?.name?.toLowerCase().includes("bangalore"))
      );
    }
    if (!cluster) {
      console.warn(`  ${(name ?? "").padEnd(28)} NO MATCH in DB`);
      missing++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  ${name.padEnd(28)} → ${cluster.name} (zone=${cluster.zone.name})`);
      continue;
    }
    const before = await prisma.cluster.findUnique({
      where: { id: cluster.id },
      select: { geometry: true, geometrySource: true },
    });
    await prisma.$executeRaw`
      UPDATE "Cluster"
         SET geometry = ${JSON.stringify(feature.geometry)}::jsonb,
             color = ${color},
             label = ${label},
             "geometrySource" = 'manual'
       WHERE id = ${cluster.id}
    `;
    const changed =
      JSON.stringify(before?.geometry) !== JSON.stringify(feature.geometry) ||
      before?.geometrySource !== "manual";
    console.log(`  ${name.padEnd(28)} ${changed ? "UPDATED" : "unchanged"}`);
    if (changed) updated++;
    else unchanged++;
  }
  console.log(`Clusters: updated=${updated} unchanged=${unchanged} missing=${missing}`);
}

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  await restoreZones(prisma);
  await restoreClusters(prisma);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
