/**
 * Verify the sync results: list every Chennai settlement, what its
 * elderly60plus is now, and re-run the household-occupancy join to see
 * if the Active-individual filter alone over-counts.
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "", max: 1 });
const prisma = new PrismaClient({ adapter });

const FRAPPE_BASE = process.env.FRAPPE_CHENNAI_URL!;
const FRAPPE_KEY = process.env.FRAPPE_CHENNAI_KEY!;
const FRAPPE_SECRET = process.env.FRAPPE_CHENNAI_SECRET!;

async function fetchAll<T>(doctype: string, fields: string[]): Promise<T[]> {
  const enc = encodeURIComponent(doctype);
  const fEnc = encodeURIComponent(JSON.stringify(fields));
  const out: T[] = [];
  let offset = 0;
  while (true) {
    const r = await fetch(`${FRAPPE_BASE}/api/resource/${enc}?limit=500&limit_start=${offset}&fields=${fEnc}`, {
      headers: { Authorization: `token ${FRAPPE_KEY}:${FRAPPE_SECRET}`, Connection: "close" },
    });
    const j = await r.json() as { data?: T[] };
    const rows = j.data ?? [];
    out.push(...rows);
    if (rows.length < 500) break;
    offset += 500;
  }
  return out;
}

async function main() {
  // 1. Pull all settlements in DB
  const dbSettlements = await prisma.$queryRaw<Array<{ id: string; name: string; deletedAt: Date | null }>>`
    SELECT s.id, s.name, s."deletedAt"
    FROM "Settlement" s
    JOIN "Cluster" cl ON cl.id = s."clusterId"
    JOIN "Zone" z ON z.id = cl."zoneId"
    JOIN "City" c ON c.id = z."cityId"
    WHERE c.name = 'Chennai'
  `;
  console.log(`Chennai DB settlements: ${dbSettlements.length} total, ${dbSettlements.filter(s => !s.deletedAt).length} active`);

  // 2. Pull household occupancy from Frappe
  type HH = { name: string | number; survay_status?: string };
  const households = await fetchAll<HH>("Household Profile-WRP", ["name", "survay_status"]);
  const occupiedHHIDs = new Set<string | number>();
  const statusCounts: Record<string, number> = {};
  for (const h of households) {
    const s = (h.survay_status ?? "").trim();
    statusCounts[s || "(blank)"] = (statusCounts[s || "(blank)"] ?? 0) + 1;
    if (s.toLowerCase().startsWith("occupied")) occupiedHHIDs.add(h.name);
  }
  console.log(`Households scanned: ${households.length}, occupied: ${occupiedHHIDs.size}`);
  console.log("Household status distribution:", statusCounts);

  // 3. Pull individuals with hhid + age + status + settlement
  type IND = { hhid: string | number | null; age: number | string | null; status: string | null; settlement_intervention_unit: string | null };
  const individuals = await fetchAll<IND>("Individual Profile-WRP", ["hhid", "age", "status", "settlement_intervention_unit"]);

  // 4. Count under different filters
  const bucketActive55plus = new Map<string, number>();
  const bucketActive55plusOccupied = new Map<string, number>();
  let activeIndividuals = 0;
  let active55 = 0;
  let active55occupied = 0;

  for (const i of individuals) {
    const status = (i.status ?? "").trim().toLowerCase();
    if (!status.startsWith("active")) continue;
    activeIndividuals++;
    const age = typeof i.age === "number" ? i.age : Number(i.age);
    if (!Number.isFinite(age) || age < 55) continue;
    active55++;
    const settlement = (i.settlement_intervention_unit ?? "").trim();
    if (!settlement) continue;
    bucketActive55plus.set(settlement, (bucketActive55plus.get(settlement) ?? 0) + 1);

    if (i.hhid != null && occupiedHHIDs.has(i.hhid)) {
      active55occupied++;
      bucketActive55plusOccupied.set(settlement, (bucketActive55plusOccupied.get(settlement) ?? 0) + 1);
    }
  }
  console.log(`\nActive individuals: ${activeIndividuals}`);
  console.log(`Active + age 55+ (current sync): ${active55}`);
  console.log(`Active + age 55+ AND in Occupied household: ${active55occupied}`);

  // 5. Per-settlement check
  console.log(`\nSettlements found in Frappe with 55+: ${bucketActive55plus.size}`);
  console.log(`After occupancy filter: ${bucketActive55plusOccupied.size}`);

  // 6. Match those Frappe names to DB settlements (uniquely by name)
  function normName(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  }
  const exactMap = new Map(dbSettlements.filter(s => !s.deletedAt).map(s => [s.name, s.id]));
  const normMap = new Map(dbSettlements.filter(s => !s.deletedAt).map(s => [normName(s.name), s.id]));
  function wordOverlapMatch(name: string): string | undefined {
    const words = normName(name).split(" ").filter((w) => w.length > 2);
    if (words.length === 0) return undefined;
    let bestId: string | undefined;
    let bestScore = 0;
    for (const [candNorm, id] of normMap) {
      const candWords = candNorm.split(" ").filter((w: string) => w.length > 2);
      const shared = words.filter((w) => candWords.includes(w)).length;
      const score = shared / Math.max(words.length, candWords.length);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestId = id;
      }
    }
    return bestId;
  }
  const matchedSettlementIds = new Set<string>();
  const collisions: Array<{ frappeName: string; dbId: string }> = [];
  for (const frappeName of bucketActive55plus.keys()) {
    const id = exactMap.get(frappeName) ?? normMap.get(normName(frappeName)) ?? wordOverlapMatch(frappeName);
    if (!id) continue;
    if (matchedSettlementIds.has(id)) {
      collisions.push({ frappeName, dbId: id });
    }
    matchedSettlementIds.add(id);
  }
  console.log(`\nUnique DB settlements matched: ${matchedSettlementIds.size}`);
  console.log(`Frappe-name collisions (same DB id matched by 2+ Frappe names): ${collisions.length}`);
  for (const c of collisions) {
    const dbName = dbSettlements.find(s => s.id === c.dbId)?.name ?? "?";
    console.log(`  • Frappe "${c.frappeName}" → DB "${dbName}" (already matched)`);
  }

  // 7. Show 55+ count per settlement using OCCUPANCY filter
  console.log(`\nPer-settlement 55+ count after occupancy filter:`);
  const rows: Array<{ name: string; before: number; after: number }> = [];
  for (const frappeName of bucketActive55plus.keys()) {
    rows.push({
      name: frappeName,
      before: bucketActive55plus.get(frappeName) ?? 0,
      after: bucketActive55plusOccupied.get(frappeName) ?? 0,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(35)}  before=${String(r.before).padStart(4)}  occupied=${String(r.after).padStart(4)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
