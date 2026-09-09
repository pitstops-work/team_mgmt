/**
 * scripts/import-bbmp-schools.ts
 *
 * Imports BBMP-run schools into BbmpSchool, then haversine-tags them to nearby
 * settlements (SettlementBbmpSchool). Mirrors scripts/import-canteens.ts.
 *
 * SOURCE OF TRUTH — UDISE+ "Know Your School" (kys.udiseplus.gov.in), searched
 * per education district with Management = "Local body" (managementId=3):
 *   Bengaluru U North  districtId=3927
 *   Bengaluru U South  districtId=3918
 * The search is captcha-gated, so the result pages are saved as HTML by hand and
 * passed in here with --north / --south.
 *
 * COORDINATES — UDISE carries none. They are joined from the KGIS "Bengaluru
 * Urban District Schools" layer on the UDISE code (KGIS calls it DepartmentCode).
 * Schools with no KGIS match are stored with NULL lat/lng: they still appear in
 * reports but are excluded from the map until geocoded.
 *
 * Deliberately NOT used for coordinates (all tested and rejected):
 *   - the "BBMP Schools Map" KML — primary schools only, no UDISE code, and its
 *     coordinates disagree with KGIS by kilometres
 *   - fuzzy name matching into KGIS — matches the locality, not the school
 *   - Nominatim — resolves to ward centroids 1-2 km out, which would corrupt the
 *     settlement-proximity distances this layer exists to measure
 *
 * Usage:
 *   npx tsx scripts/import-bbmp-schools.ts \
 *     --north=path/to/north.html --south=path/to/south.html [--kgis=path/to/district.kml] [--maxKm=4]
 *
 * --kgis defaults to downloading the OpenCity KGIS layer if not supplied.
 * To re-tag without reimporting:
 *   npx tsx scripts/import-bbmp-schools.ts --retag [--maxKm=4]
 */

import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.replace(`--${k}=`, "");
const NORTH = arg("north");
const SOUTH = arg("south");
const KGIS = arg("kgis");
const MAX_KM = parseFloat(arg("maxKm") ?? "4");
const RETAG_ONLY = process.argv.includes("--retag");

const KGIS_URL =
  "https://data.opencity.in/dataset/947c79ea-7377-463d-8aae-2816b423b94f/resource/" +
  "93d55d2b-5d5f-4f8c-b46f-03f294867a9a/download/bd02f7b2-4c06-4e5d-9ecd-b78a1a142761.kml";

interface SchoolRec {
  udiseCode: string;
  name: string;
  status: string;
  eduDistrict: string;
  eduBlock: string;
  category: string;
  management: string;
  urbanLocalBody: string;
  lgdWard: string;
  address: string;
  pincode: string;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function decodeEntities(v: string): string {
  return v
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}
const clean = (v: string) => decodeEntities(v ?? "").replace(/\s+/g, " ").trim();

/** Parse one saved KYS results page. Each school is an accordion keyed by "<udise>Id". */
function parseKys(htmlText: string, eduDistrict: string): { recs: SchoolRec[]; declared: number | null } {
  const declaredM = htmlText.match(/Showing <b[^>]*>(\d+)<\/b> Result/i);
  const declared = declaredM ? parseInt(declaredM[1], 10) : null;

  const parts = htmlText.split(/<div[^>]*class="accordion-collapse[^"]*"[^>]*id="(\d+)Id"/);
  const recs: SchoolRec[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const udiseCode = parts[i];
    const body = parts[i + 1].split("accordionFlushExample")[0];
    const field = (label: string) => {
      const re = new RegExp(
        `class="fw-600"[^>]*>\\s*${label}\\s*:?\\s*</span>(?:\\s*:\\s*)?(?:<br[^>]*>)?\\s*<span[^>]*>([^<]*)</span>`,
        "i"
      );
      return clean(body.match(re)?.[1] ?? "");
    };
    recs.push({
      udiseCode,
      name: clean(body.match(/<h4[^>]*>([^<]*)<\/h4>/)?.[1] ?? ""),
      status: clean(body.match(/class="ms-2 \w+">([^<]*)<\/span>/)?.[1] ?? ""),
      eduDistrict,
      eduBlock: field("Edu\\. Block"),
      category: field("School Category"),
      management: field("School Management"),
      urbanLocalBody: field("Urban Local Body"),
      lgdWard: field("LGD Ward"),
      address: field("Address"),
      pincode: field("PIN Code"),
    });
  }
  return { recs, declared };
}

/** UDISE code → [lng, lat] from the KGIS school layer. */
function parseKgis(kml: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const placemarks = kml.match(/<Placemark\b[^>]*>[\s\S]*?<\/Placemark>/gi) ?? [];
  for (const pm of placemarks) {
    const code = pm.match(/<SimpleData name="DepartmentCode">([\s\S]*?)<\/SimpleData>/)?.[1]?.trim();
    const coord = pm.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/i)?.[1]?.trim();
    if (!code || !coord) continue;
    const [lng, lat] = coord.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.set(code, [lng, lat]);
  }
  return out;
}

// ── Haversine distance (km) ───────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Tagging ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function retag(prisma: any, maxKm: number) {
  const schools = await prisma.bbmpSchool.findMany({
    where: { lat: { not: null }, lng: { not: null } },
  });
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: { not: null }, centroidLng: { not: null } },
    select: { id: true, centroidLat: true, centroidLng: true },
  });
  console.log(`\nTagging: ${schools.length} geocoded schools × ${settlements.length} settlements (maxKm=${maxKm})`);

  const deleted = await prisma.settlementBbmpSchool.deleteMany();
  console.log(`  Cleared ${deleted.count} existing links`);

  const toCreate: { id: string; settlementId: string; schoolId: string; distanceKm: number }[] = [];
  for (const school of schools) {
    for (const s of settlements) {
      const d = haversine(school.lat!, school.lng!, s.centroidLat!, s.centroidLng!);
      if (d <= maxKm) {
        toCreate.push({
          id: crypto.randomUUID(),
          settlementId: s.id,
          schoolId: school.id,
          distanceKm: Math.round(d * 1000) / 1000,
        });
      }
    }
  }
  const BATCH = 200;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    await prisma.settlementBbmpSchool.createMany({ data: toCreate.slice(i, i + BATCH), skipDuplicates: true });
  }
  console.log(`  Created ${toCreate.length} settlement–school links`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { prisma } = await import("../lib/prisma");

  if (!RETAG_ONLY) {
    if (!NORTH || !SOUTH) {
      console.error("Usage: npx tsx scripts/import-bbmp-schools.ts --north=<north.html> --south=<south.html> [--kgis=<district.kml>] [--maxKm=4]");
      console.error("       npx tsx scripts/import-bbmp-schools.ts --retag [--maxKm=4]");
      process.exit(1);
    }
    for (const p of [NORTH, SOUTH]) {
      if (!fs.existsSync(path.resolve(process.cwd(), p))) {
        console.error(`File not found: ${p}`);
        process.exit(1);
      }
    }

    const north = parseKys(fs.readFileSync(path.resolve(process.cwd(), NORTH), "utf-8"), "Bengaluru U North");
    const south = parseKys(fs.readFileSync(path.resolve(process.cwd(), SOUTH), "utf-8"), "Bengaluru U South");
    for (const [label, r] of [["North", north], ["South", south]] as const) {
      const gap = r.declared != null && r.declared !== r.recs.length;
      console.log(`  ${label}: parsed ${r.recs.length}${r.declared != null ? ` of ${r.declared} declared` : ""}${gap ? "  ⚠ MISSING ROWS" : ""}`);
    }

    const recs = [...north.recs, ...south.recs];
    const nonLocal = recs.filter(r => !/local body/i.test(r.management));
    if (nonLocal.length) {
      console.log(`\n  ⚠ ${nonLocal.length} rows are not "Local body" management — check the search filter:`);
      nonLocal.forEach(r => console.log(`      ${r.udiseCode} ${r.name} [${r.management}]`));
    }

    let kgisKml: string;
    if (KGIS) {
      kgisKml = fs.readFileSync(path.resolve(process.cwd(), KGIS), "utf-8");
    } else {
      console.log(`\n  Downloading KGIS school layer…`);
      kgisKml = await (await fetch(KGIS_URL)).text();
    }
    const coords = parseKgis(kgisKml);
    console.log(`  KGIS records with a UDISE code + coordinates: ${coords.size}`);

    let geocoded = 0;
    const ungeocoded: SchoolRec[] = [];
    for (const r of recs) {
      const c = coords.get(r.udiseCode);
      if (c) geocoded++; else ungeocoded.push(r);
      await prisma.bbmpSchool.upsert({
        where: { udiseCode: r.udiseCode },
        create: {
          udiseCode: r.udiseCode, name: r.name,
          lat: c ? c[1] : null, lng: c ? c[0] : null,
          geocodeSource: c ? "kgis" : null,
          category: r.category, management: r.management, urbanLocalBody: r.urbanLocalBody,
          lgdWard: r.lgdWard, eduBlock: r.eduBlock, eduDistrict: r.eduDistrict,
          address: r.address, pincode: r.pincode, status: r.status,
        },
        // Never clobber a better fix (google/manual) with a null from KGIS.
        update: {
          name: r.name,
          ...(c ? { lat: c[1], lng: c[0], geocodeSource: "kgis" } : {}),
          category: r.category, management: r.management, urbanLocalBody: r.urbanLocalBody,
          lgdWard: r.lgdWard, eduBlock: r.eduBlock, eduDistrict: r.eduDistrict,
          address: r.address, pincode: r.pincode, status: r.status,
        },
      });
    }
    console.log(`\n  Upserted ${recs.length} schools — ${geocoded} geocoded from KGIS, ${ungeocoded.length} awaiting coordinates:`);
    ungeocoded.forEach(r => console.log(`      ${r.udiseCode}  ${r.name}`));
  }

  await retag(prisma, MAX_KM);

  const total = await prisma.bbmpSchool.count();
  const withGeo = await prisma.bbmpSchool.count({ where: { lat: { not: null } } });
  const links = await prisma.settlementBbmpSchool.count();
  console.log(`\nDone. BBMP schools: ${total} (${withGeo} on the map, ${total - withGeo} ungeocoded)  Links: ${links}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
