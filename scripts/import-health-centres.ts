/**
 * scripts/import-health-centres.ts
 *
 * Parses health.html, imports health centres into the DB,
 * tags them to settlements within 2 km, and marks clusters as health clusters.
 *
 * Usage:
 *   npx tsx scripts/import-health-centres.ts [--html=path/to/health.html] [--maxKm=2]
 *   npx tsx scripts/import-health-centres.ts --retag [--maxKm=2]
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

const HTML_ARG = process.argv.find(a => a.startsWith("--html="))?.replace("--html=", "")
  ?? "/Users/vishnuharikumar/Downloads/health.html";
const MAX_KM   = parseFloat(process.argv.find(a => a.startsWith("--maxKm="))?.replace("--maxKm=", "") ?? "2");
const RETAG    = process.argv.includes("--retag");

// ── Types to import (excludes Community and Crèche) ──────────────────────────
const HEALTH_TYPES = new Set([
  "CRC",
  "Foundation Health Centre",
  "Government Health Centre",
  "Referral Helpdesk Hospital",
  "Super Speciality Hospital",
]);

// ── Parse HTML ────────────────────────────────────────────────────────────────
interface HealthPoint {
  name: string;
  lat: number;
  lng: number;
  centreType: string;
  notes?: string;
}

function parseHTML(html: string): HealthPoint[] {
  const results: HealthPoint[] = [];
  // Match Point features
  const featureRe = /\{"type":"Feature","geometry":\{"type":"Point","coordinates":\[([^\]]+)\]\},"properties":\{([^}]+)\}/g;
  let m: RegExpExecArray | null;

  while ((m = featureRe.exec(html)) !== null) {
    const coords = m[1].split(",");
    const lng = parseFloat(coords[0]);
    const lat = parseFloat(coords[1]);
    if (isNaN(lat) || isNaN(lng)) continue;

    const props = m[2];

    // Extract type
    const typeMatch = props.match(/"type":"([^"]+)"/);
    const centreType = typeMatch ? typeMatch[1].replace(/\\u00e8/g, "è") : "";
    // Handle unicode escape in Crèche
    const normalizedType = centreType.replace(/Cr.?che/i, "Crèche");
    if (!HEALTH_TYPES.has(normalizedType) && !HEALTH_TYPES.has(centreType)) continue;

    // Extract name
    const nameMatch = props.match(/"Name":"([^"]+)"/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (!name) continue;

    // Extract notes
    const notesMatch = props.match(/"Notes":"([^"]+)"/);
    const notes = notesMatch ? notesMatch[1].trim() : undefined;

    results.push({ name, lat, lng, centreType: HEALTH_TYPES.has(centreType) ? centreType : normalizedType, notes });
  }

  return results;
}

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Tagging + cluster update ──────────────────────────────────────────────────
async function retag(maxKm: number) {
  const centres = await prisma.healthCentre.findMany();
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: { not: null }, centroidLng: { not: null } },
    select: { id: true, clusterId: true, centroidLat: true, centroidLng: true },
  });

  console.log(`\nTagging: ${centres.length} health centres × ${settlements.length} settlements (maxKm=${maxKm})`);

  await prisma.settlementHealthCentre.deleteMany();

  const toCreate: { id: string; settlementId: string; healthCentreId: string; distanceKm: number }[] = [];
  const healthClusterIds = new Set<string>();

  for (const hc of centres) {
    for (const s of settlements) {
      const d = haversine(hc.lat, hc.lng, s.centroidLat!, s.centroidLng!);
      if (d <= maxKm) {
        toCreate.push({ id: crypto.randomUUID(), settlementId: s.id, healthCentreId: hc.id, distanceKm: Math.round(d * 1000) / 1000 });
        healthClusterIds.add(s.clusterId);
      }
    }
  }

  const BATCH = 200;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    await prisma.settlementHealthCentre.createMany({ data: toCreate.slice(i, i + BATCH), skipDuplicates: true });
  }
  console.log(`  Created ${toCreate.length} settlement↔health-centre links`);

  // Reset all clusters, then mark health ones
  await prisma.cluster.updateMany({ data: { isHealthCluster: false } });
  if (healthClusterIds.size > 0) {
    await prisma.cluster.updateMany({
      where: { id: { in: [...healthClusterIds] } },
      data: { isHealthCluster: true },
    });
  }
  console.log(`  Health clusters: ${healthClusterIds.size}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!RETAG) {
    const htmlPath = path.resolve(process.cwd(), HTML_ARG);
    if (!fs.existsSync(htmlPath)) { console.error(`File not found: ${htmlPath}`); process.exit(1); }

    const html = fs.readFileSync(htmlPath, "utf-8");
    const centres = parseHTML(html);
    console.log(`\nParsed ${centres.length} health centres from HTML`);

    const byType: Record<string, number> = {};
    for (const c of centres) byType[c.centreType] = (byType[c.centreType] ?? 0) + 1;
    Object.entries(byType).forEach(([t, n]) => console.log(`  ${n.toString().padStart(3)}  ${t}`));

    // Clear and reimport
    await prisma.settlementHealthCentre.deleteMany();
    await prisma.healthCentre.deleteMany();
    await prisma.healthCentre.createMany({
      data: centres.map(c => ({ id: crypto.randomUUID(), ...c })),
    });
    console.log(`  Inserted ${centres.length} health centres`);
  }

  await retag(MAX_KM);

  const total = await prisma.healthCentre.count();
  const links = await prisma.settlementHealthCentre.count();
  const healthClusters = await prisma.cluster.count({ where: { isHealthCluster: true } });
  const allClusters = await prisma.cluster.count({ where: { deletedAt: null } });
  console.log(`\nDone. Health centres: ${total}  Links: ${links}  Health clusters: ${healthClusters}/${allClusters}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
