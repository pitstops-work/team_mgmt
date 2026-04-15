/**
 * Seed cluster-level needs assessments for Bangalore clusters
 * from the "Cluster Notes Final-2" documents.
 *
 * Data is at cluster level; we distribute it proportionally across all
 * settlements in each cluster so that the cluster-needs and zone-needs
 * APIs (which aggregate settlement assessments) show the correct totals.
 *
 * Existing 2025 assessments in a cluster are left untouched — the whole
 * cluster is skipped if even one settlement already has a 2025 record.
 *
 * Run: npx tsx scripts/seed-bangalore-cluster-assessments.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

interface ClusterDoc {
  dbName: string;     // display name used to look up cluster in DB (case-insensitive)
  hh: number;
  c0_3: number;       // maps to children6m3yr
  c4_6: number;       // } combined → children4to14
  c7_14: number;      // }
  y15_18: number;     // } combined → youth15to21
  y19_21: number;     // }
  elderly: number;    // maps to elderly60plus
  creches: number;    // existingCreches
  rc: number;         // existingChildrenCentres (resource/children centres)
}

const CLUSTER_DATA: ClusterDoc[] = [
  { dbName: "JJR Nagar",     hh: 8362,  c0_3: 1220, c4_6: 1322, c7_14: 4112, y15_18: 2068, y19_21: 1634, elderly: 1857, creches: 0, rc: 3 },
  { dbName: "KR Market",     hh: 1491,  c0_3: 1633, c4_6: 1689, c7_14: 4940, y15_18: 2534, y19_21: 1743, elderly: 2198, creches: 0, rc: 2 },
  { dbName: "Bellandur",     hh: 6823,  c0_3: 1019, c4_6:  906, c7_14: 1919, y15_18:  939, y19_21: 1949, elderly:  203, creches: 1, rc: 2 },
  { dbName: "Ullalu",        hh: 2256,  c0_3:  334, c4_6:  362, c7_14:  983, y15_18:  464, y19_21:  362, elderly:  427, creches: 0, rc: 1 },
  { dbName: "Yeshwantpur",   hh: 1952,  c0_3:  330, c4_6:  342, c7_14:  859, y15_18:  515, y19_21:  317, elderly:  479, creches: 0, rc: 1 },
  { dbName: "Kengeri",       hh: 13012, c0_3: 2588, c4_6: 2224, c7_14: 6122, y15_18: 3272, y19_21: 2694, elderly: 1901, creches: 1, rc: 2 },
  { dbName: "Jayanagar",     hh: 3665,  c0_3: 3578, c4_6:  540, c7_14: 1609, y15_18:  851, y19_21:  612, elderly:  845, creches: 0, rc: 1 },
  { dbName: "Koramangala",   hh: 4095,  c0_3: 4376, c4_6:  739, c7_14: 2198, y15_18: 1215, y19_21:  882, elderly: 1055, creches: 0, rc: 1 },
  { dbName: "Majestic",      hh: 13630, c0_3: 1971, c4_6: 1931, c7_14: 5766, y15_18: 2991, y19_21: 2220, elderly: 3023, creches: 0, rc: 1 },
  { dbName: "Nagarbhavi",    hh: 5513,  c0_3: 1541, c4_6: 1270, c7_14: 3411, y15_18: 1623, y19_21: 1198, elderly:  944, creches: 0, rc: 0 },
  { dbName: "Peenya North",  hh: 5220,  c0_3: 1124, c4_6: 1116, c7_14: 2968, y15_18: 1425, y19_21: 1415, elderly: 1033, creches: 2, rc: 1 },
  { dbName: "Anekal",        hh: 6531,  c0_3: 1139, c4_6: 1058, c7_14: 3896, y15_18: 1480, y19_21: 1239, elderly: 1768, creches: 0, rc: 1 },
  { dbName: "Bagalur",       hh: 2235,  c0_3:  885, c4_6:  479, c7_14: 1300, y15_18:  641, y19_21:  480, elderly:  562, creches: 0, rc: 1 },
  { dbName: "Sarjapur Road", hh: 2445,  c0_3:  329, c4_6:  369, c7_14:  842, y15_18:  328, y19_21:  383, elderly:   79, creches: 1, rc: 0 },
  { dbName: "Dasarahalli",   hh: 2660,  c0_3:  568, c4_6:  575, c7_14: 1621, y15_18:  930, y19_21:  651, elderly:  602, creches: 0, rc: 2 },
  { dbName: "Rayapuram",     hh: 3435,  c0_3:  568, c4_6:  575, c7_14: 1621, y15_18:  930, y19_21:  651, elderly:  602, creches: 0, rc: 1 },
];

// Distribute an integer total across n slots as evenly as possible.
// Remainder is added to the first slot.
function distribute(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rem  = total % n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rem : base));
}

async function main() {
  // Use first available user as the assessor
  const assessor = await prisma.user.findFirst({ select: { id: true, name: true } });
  if (!assessor) throw new Error("No users found in DB — cannot set assessedById");
  console.log(`Using assessor: ${assessor.name} (${assessor.id})\n`);

  const YEAR = 2025;
  const assessedAt = new Date("2026-04-16");

  let created = 0;
  let skipped = 0;

  for (const doc of CLUSTER_DATA) {
    // Find the cluster (case-insensitive)
    const cluster = await prisma.cluster.findFirst({
      where: { name: { equals: doc.dbName, mode: "insensitive" }, deletedAt: null },
      include: { settlements: { where: { deletedAt: null }, select: { id: true, name: true } } },
    });

    if (!cluster) {
      console.log(`⚠  CLUSTER NOT FOUND: "${doc.dbName}" — skipping`);
      skipped++;
      continue;
    }

    const settlements = cluster.settlements;
    if (settlements.length === 0) {
      console.log(`⚠  No settlements in "${doc.dbName}" — skipping`);
      skipped++;
      continue;
    }

    // Skip cluster if any settlement already has a 2025 assessment
    const existing = await prisma.settlementAssessment.findFirst({
      where: { settlementId: { in: settlements.map(s => s.id) }, assessmentYear: YEAR },
      select: { id: true },
    });
    if (existing) {
      console.log(`↩  "${doc.dbName}" already has 2025 assessments — skipping`);
      skipped++;
      continue;
    }

    const n = settlements.length;

    // Distribute population fields
    const hh     = distribute(doc.hh,              n);
    const c0_3   = distribute(doc.c0_3,            n);
    const c4_14  = distribute(doc.c4_6 + doc.c7_14, n);
    const y15_21 = distribute(doc.y15_18 + doc.y19_21, n);
    const eld    = distribute(doc.elderly,         n);

    // Distribute physical facilities: put 1 on each of the first N slots
    const crecheArr = Array.from({ length: n }, (_, i) => (i < doc.creches ? 1 : 0));
    const rcArr     = Array.from({ length: n }, (_, i) => (i < doc.rc     ? 1 : 0));

    const records = settlements.map((s, i) => ({
      settlementId: s.id,
      assessmentYear: YEAR,
      assessedById: assessor.id,
      assessedAt,
      totalHouseholds:     hh[i],
      children6m3yr:       c0_3[i],
      children4to14:       c4_14[i],
      youth15to21:         y15_21[i],
      elderly60plus:       eld[i],
      existingCreches:          crecheArr[i],
      existingChildrenCentres:  rcArr[i],
      existingYouthGroups:      0,
      existingElderlyKitchens:  0,
      existingPalliativeUnits:  0,
      existingCommunityToilets: 0,
      existingWaterATMs:        0,
    }));

    await prisma.settlementAssessment.createMany({ data: records });
    console.log(`✓  "${doc.dbName}" — ${n} settlements seeded (HH: ${doc.hh}, creches: ${doc.creches}, RC: ${doc.rc})`);
    created += n;
  }

  console.log(`\nDone. Created ${created} assessment records, skipped ${skipped} clusters.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
