/**
 * scripts/import-schools.ts
 *
 * Imports school locations from a Google My Maps KML export into the School table.
 * Also runs haversine tagging to link schools to nearby settlements.
 *
 * Usage:
 *   npx tsx scripts/import-schools.ts --kml=path/to/schools.kml [--maxKm=4]
 *
 * To re-tag without reimporting:
 *   npx tsx scripts/import-schools.ts --retag [--maxKm=4]
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

const KML_ARG = process.argv.find(a => a.startsWith("--kml="))?.replace("--kml=", "");
const MAX_KM = parseFloat(process.argv.find(a => a.startsWith("--maxKm="))?.replace("--maxKm=", "") ?? "4");
const RETAG_ONLY = process.argv.includes("--retag");

// ── KML parser ────────────────────────────────────────────────────────────────

// Map KML style color codes → school type labels
const STYLE_TYPE_MAP: Record<string, string> = {
  "000000": "BBMP",
  "0288D1": "Karnataka Public School",
  "A52714": "Government",
};

function schoolTypeFromStyle(styleUrl: string): string {
  for (const [color, label] of Object.entries(STYLE_TYPE_MAP)) {
    if (styleUrl.includes(color)) return label;
  }
  return "Government";
}

interface SchoolPoint {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  gmapsId?: string;
  schoolType: string;
}

function parseKML(kmlContent: string): SchoolPoint[] {
  const schools: SchoolPoint[] = [];

  // Match all Placemark blocks
  const placemarkRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let pm: RegExpExecArray | null;

  while ((pm = placemarkRe.exec(kmlContent)) !== null) {
    const block = pm[1];

    // Only process Point placemarks
    if (!/<Point/i.test(block)) continue;

    // Extract name
    const nameMatch = block.match(/<name>\s*([\s\S]*?)\s*<\/name>/i);
    const name = nameMatch ? nameMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : "";
    if (!name) continue;

    // Extract coordinates (lng,lat,alt)
    const coordMatch = block.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/i);
    if (!coordMatch) continue;
    const parts = coordMatch[1].trim().split(",");
    if (parts.length < 2) continue;
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) continue;

    // Extract description (optional)
    const descMatch = block.match(/<description>\s*([\s\S]*?)\s*<\/description>/i);
    const rawDesc = descMatch ? descMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : undefined;
    const address = rawDesc && rawDesc.length < 200 ? rawDesc : undefined;

    // Extract gx:id or use name+coords as id
    const idMatch = block.match(/gx:id="([^"]+)"/i) ?? block.match(/<gx:id>([\s\S]*?)<\/gx:id>/i);
    const gmapsId = idMatch ? idMatch[1].trim() : undefined;

    // Extract school type from styleUrl
    const styleMatch = block.match(/<styleUrl>#([^<]+)<\/styleUrl>/i);
    const schoolType = styleMatch ? schoolTypeFromStyle(styleMatch[1]) : "Government";

    schools.push({ name, lat, lng, address, gmapsId, schoolType });
  }

  return schools;
}

// ── Haversine distance (km) ───────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

// ── Tagging logic ─────────────────────────────────────────────────────────────

async function retag(maxKm: number) {
  const schools = await prisma.school.findMany();
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: { not: null }, centroidLng: { not: null } },
    select: { id: true, name: true, centroidLat: true, centroidLng: true },
  });

  console.log(`\nTagging: ${schools.length} schools × ${settlements.length} settlements (maxKm=${maxKm})`);

  // Delete all existing links
  const deleted = await prisma.settlementSchool.deleteMany();
  console.log(`  Cleared ${deleted.count} existing links`);

  let links = 0;
  for (const school of schools) {
    for (const s of settlements) {
      const d = haversine(school.lat, school.lng, s.centroidLat!, s.centroidLng!);
      if (d <= maxKm) {
        await prisma.settlementSchool.create({
          data: {
            settlementId: s.id,
            schoolId: school.id,
            distanceKm: Math.round(d * 1000) / 1000,
          },
        });
        links++;
      }
    }
  }

  console.log(`  Created ${links} settlement-school links`);
  return links;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!RETAG_ONLY) {
    if (!KML_ARG) {
      console.error("Usage: npx tsx scripts/import-schools.ts --kml=path/to/schools.kml [--maxKm=4]");
      console.error("       npx tsx scripts/import-schools.ts --retag [--maxKm=4]");
      process.exit(1);
    }

    const kmlPath = path.resolve(process.cwd(), KML_ARG);
    if (!fs.existsSync(kmlPath)) {
      console.error(`KML file not found: ${kmlPath}`);
      process.exit(1);
    }

    console.log(`\nParsing KML: ${kmlPath}`);
    const kml = fs.readFileSync(kmlPath, "utf-8");
    const schools = parseKML(kml);
    console.log(`Found ${schools.length} school Placemarks`);

    if (schools.length === 0) {
      console.error("No schools found in KML. Check the file format.");
      process.exit(1);
    }

    // Upsert schools
    let inserted = 0, updated = 0;
    for (const s of schools) {
      if (s.gmapsId) {
        await prisma.school.upsert({
          where: { gmapsId: s.gmapsId },
          create: { name: s.name, lat: s.lat, lng: s.lng, address: s.address, gmapsId: s.gmapsId, schoolType: s.schoolType },
          update: { name: s.name, lat: s.lat, lng: s.lng, address: s.address, schoolType: s.schoolType },
        });
        updated++;
      } else {
        await prisma.school.create({
          data: { name: s.name, lat: s.lat, lng: s.lng, address: s.address, schoolType: s.schoolType },
        });
        inserted++;
      }
    }

    console.log(`  Inserted: ${inserted}  Upserted: ${updated}`);
  }

  await retag(MAX_KM);

  const schoolCount = await prisma.school.count();
  const linkCount = await prisma.settlementSchool.count();
  console.log(`\nDone. Total schools in DB: ${schoolCount}  Total links: ${linkCount}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
