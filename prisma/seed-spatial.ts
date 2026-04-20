/**
 * Seed spatial data into DB:
 * 1. Zone.geometry + color from zones.geojson
 * 2. Cluster.geometry + color + label from clusters.geojson
 * 3. LayerFeature rows from creches, children_centres, youth_centres, resource_centres GeoJSON
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";
import path from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DATA_DIR = path.join(process.cwd(), "public/data");

function readGeoJSON(file: string) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
}

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function seedZones() {
  const gj = readGeoJSON("zones.geojson");
  const zones = await prisma.zone.findMany();
  let updated = 0;
  for (const feature of gj.features) {
    const name = feature.properties?.zone as string;
    const color = feature.properties?.color as string | undefined;
    const zone = zones.find(
      (z) => z.name.toLowerCase() === name?.toLowerCase()
    );
    if (!zone) { console.warn("Zone not found:", name); continue; }
    await prisma.$executeRaw`
      UPDATE "Zone" SET geometry = ${JSON.stringify(feature.geometry)}::jsonb, color = ${color ?? null}
      WHERE id = ${zone.id}
    `;
    updated++;
  }
  console.log(`Zones: ${updated}/${gj.features.length} updated`);
}

async function seedClusters() {
  const gj = readGeoJSON("clusters.geojson");
  const clusters = await prisma.cluster.findMany({ include: { zone: true } });
  let updated = 0;
  for (const feature of gj.features) {
    const name = feature.properties?.cluster as string;
    const color = feature.properties?.color as string | undefined;
    const label = feature.properties?.label as string | undefined;
    // Match by name (case-insensitive, ignoring underscores/hyphens)
    const normalize = (s: string) => s.toLowerCase().replace(/[_\-\s]+/g, " ").trim();
    const cluster = clusters.find((c) => normalize(c.name) === normalize(name ?? ""));
    if (!cluster) { console.warn("Cluster not found:", name); continue; }
    await prisma.$executeRaw`
      UPDATE "Cluster" SET geometry = ${JSON.stringify(feature.geometry)}::jsonb,
        color = ${color ?? null}, label = ${label ?? null}
      WHERE id = ${cluster.id}
    `;
    updated++;
  }
  console.log(`Clusters: ${updated}/${gj.features.length} updated`);
}

async function seedLayerFeatures() {
  const LAYERS: { file: string; layerKey: string }[] = [
    { file: "creches.geojson",          layerKey: "creches" },
    { file: "children_centres.geojson", layerKey: "children_centres" },
    { file: "youth_centres.geojson",    layerKey: "youth_centres" },
    { file: "resource_centres.geojson", layerKey: "resource_centres" },
  ];

  // Load all settlements (with cluster + zone) for matching
  const settlements = await prisma.settlement.findMany({
    include: { cluster: { include: { zone: true } } },
  });
  const clusters = await prisma.cluster.findMany({ include: { zone: true } });
  const zones = await prisma.zone.findMany();

  const normalize = (s: string) =>
    (s ?? "").toLowerCase().replace(/[_\-\s]+/g, " ").trim();

  function findSettlement(name: string) {
    return settlements.find((s) => normalize(s.name) === normalize(name));
  }
  function findCluster(name: string) {
    return clusters.find((c) => normalize(c.name) === normalize(name));
  }
  function findZone(name: string) {
    return zones.find((z) => normalize(z.name) === normalize(name));
  }

  // Delete existing LayerFeature rows before re-seeding
  await prisma.$executeRaw`DELETE FROM "LayerFeature"`;
  console.log("Cleared existing LayerFeature rows");

  let totalInserted = 0;

  for (const { file, layerKey } of LAYERS) {
    const gj = readGeoJSON(file);
    let inserted = 0;

    for (const feature of gj.features) {
      if (feature.geometry?.type !== "Point") continue;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties ?? {};

      const matchedSettlementName = props.matched_settlement as string | undefined;
      const clusterName = props.cluster as string | undefined;
      const zoneName = props.zone as string | undefined;

      const settlement = matchedSettlementName ? findSettlement(matchedSettlementName) : null;
      const cluster = settlement?.cluster ?? (clusterName ? findCluster(clusterName) : null);
      const zone = cluster?.zone ?? (zoneName ? findZone(zoneName) : null);

      if (matchedSettlementName && !settlement) {
        console.warn(`  [${layerKey}] No settlement match: "${matchedSettlementName}"`);
      }

      await prisma.$executeRaw`
        INSERT INTO "LayerFeature" (id, name, "layerKey", "centreType", partner, lat, lng,
          "settlementId", "clusterId", "zoneId", notes, "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(),
          ${props.name as string},
          ${layerKey},
          ${(props.centre_type ?? props.layer ?? null) as string | null},
          ${(props.partner ?? null) as string | null},
          ${lat}, ${lng},
          ${settlement?.id ?? null},
          ${cluster?.id ?? null},
          ${zone?.id ?? null},
          ${(props.description ?? props.notes ?? null) as string | null},
          NOW(), NOW()
        )
      `;
      inserted++;
    }
    totalInserted += inserted;
    console.log(`  [${layerKey}] ${inserted} features inserted`);
  }

  console.log(`LayerFeature: ${totalInserted} total inserted`);
}

async function main() {
  console.log("=== Seeding spatial data ===\n");
  await seedZones();
  await seedClusters();
  await seedLayerFeatures();
  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
