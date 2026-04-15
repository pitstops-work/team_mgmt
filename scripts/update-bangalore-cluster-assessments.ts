/**
 * Update existing Bangalore cluster assessments with child/youth/facility data
 * from the "Cluster Notes Final-2" documents.
 *
 * Existing records already have totalHouseholds and elderly60plus.
 * We fill in the zero fields (children6m3yr, children4to14, youth15to21,
 * existingCreches, existingChildrenCentres) by distributing cluster totals
 * proportionally using each settlement's share of total cluster HH.
 *
 * For Majestic (no settlements in DB): creates settlement stubs first, then seeds.
 *
 * Run: npx tsx scripts/update-bangalore-cluster-assessments.ts
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
  dbName: string;
  hh: number;
  c0_3: number;
  c4_6: number;
  c7_14: number;
  y15_18: number;
  y19_21: number;
  elderly: number;
  creches: number;
  rc: number;
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

// Distribute integer total proportionally using share weights.
// Returns integer array that sums exactly to total.
function distributeByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    // Equal distribution fallback when all weights are 0
    const base = Math.floor(total / weights.length);
    const rem  = total % weights.length;
    return weights.map((_, i) => (i === 0 ? base + rem : base));
  }
  const floats = weights.map(w => (total * w) / sum);
  const floors = floats.map(Math.floor);
  let remaining = total - floors.reduce((a, b) => a + b, 0);
  // Distribute remainder to slots with largest fractional part
  const order = floats
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remaining; k++) floors[order[k].i]++;
  return floors;
}

// Distribute discrete facilities: put 1 unit on each of the first N settlement slots
function distributeFacilities(count: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i < count ? 1 : 0));
}

const YEAR = 2025;

async function main() {
  const assessor = await prisma.user.findFirst({ select: { id: true, name: true } });
  if (!assessor) throw new Error("No users found");
  console.log(`Assessor: ${assessor.name}\n`);

  for (const doc of CLUSTER_DATA) {
    const cluster = await prisma.cluster.findFirst({
      where: { name: { equals: doc.dbName, mode: "insensitive" }, deletedAt: null },
      include: { settlements: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } } },
    });

    if (!cluster) {
      console.log(`⚠  NOT FOUND: "${doc.dbName}"`);
      continue;
    }

    const settlements = cluster.settlements;

    // ── Majestic: no settlements in DB, create stubs from zone_cluster_index ─
    if (settlements.length === 0 && doc.dbName === "Majestic") {
      console.log(`   "Majestic" has no settlements — seeding evenly across 1 placeholder`);
      // Create a single stub settlement so data is stored
      const stub = await prisma.settlement.create({
        data: { name: "Majestic (Aggregate)", clusterId: cluster.id },
      });
      settlements.push({ id: stub.id, name: stub.name });
    }

    if (settlements.length === 0) {
      console.log(`⚠  No settlements in "${doc.dbName}" — skipping`);
      continue;
    }

    const n = settlements.length;

    // Fetch existing 2025 assessments keyed by settlementId
    const existing = await prisma.settlementAssessment.findMany({
      where: { settlementId: { in: settlements.map(s => s.id) }, assessmentYear: YEAR },
      select: { id: true, settlementId: true, totalHouseholds: true, children6m3yr: true, children4to14: true, youth15to21: true },
    });
    const existingById = Object.fromEntries(existing.map(a => [a.settlementId, a]));

    // HH weights for proportional distribution (use existing HH if available, else equal weight)
    const weights = settlements.map(s => existingById[s.id]?.totalHouseholds ?? 1);

    const c0_3   = distributeByWeight(doc.c0_3, weights);
    const c4_14  = distributeByWeight(doc.c4_6 + doc.c7_14, weights);
    const y15_21 = distributeByWeight(doc.y15_18 + doc.y19_21, weights);
    const eld    = distributeByWeight(doc.elderly, weights);
    const hh     = distributeByWeight(doc.hh, weights);
    const crecheArr = distributeFacilities(doc.creches, n);
    const rcArr     = distributeFacilities(doc.rc, n);

    let updatedCount = 0;
    let createdCount = 0;

    for (let i = 0; i < n; i++) {
      const s = settlements[i];
      const rec = existingById[s.id];

      if (rec) {
        // Only update if child fields are still zero (don't clobber real data)
        if (rec.children6m3yr === 0 && rec.children4to14 === 0 && rec.youth15to21 === 0) {
          await prisma.settlementAssessment.update({
            where: { id: rec.id },
            data: {
              totalHouseholds: hh[i],
              children6m3yr:   c0_3[i],
              children4to14:   c4_14[i],
              youth15to21:     y15_21[i],
              elderly60plus:   eld[i],
              existingCreches:          crecheArr[i],
              existingChildrenCentres:  rcArr[i],
            },
          });
          updatedCount++;
        } else {
          console.log(`   Skipping ${s.name} — child data already present`);
        }
      } else {
        // Create new assessment
        await prisma.settlementAssessment.create({
          data: {
            settlementId: s.id,
            assessmentYear: YEAR,
            assessedById: assessor.id,
            assessedAt: new Date("2026-04-16"),
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
          },
        });
        createdCount++;
      }
    }

    const totalC0_3  = doc.c0_3;
    const totalC4_14 = doc.c4_6 + doc.c7_14;
    const totalY     = doc.y15_18 + doc.y19_21;
    console.log(`✓  "${doc.dbName}" (${n} settlements) — updated:${updatedCount} created:${createdCount}`);
    console.log(`   HH:${doc.hh} | 0-3:${totalC0_3} | 4-14:${totalC4_14} | 15-21:${totalY} | 60+:${doc.elderly} | creches:${doc.creches} | RC:${doc.rc}`);
  }

  console.log("\nDone.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
