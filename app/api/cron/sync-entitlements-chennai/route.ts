/**
 * Cron: sync Chennai entitlement baselines from Frappe (chennai.dignifiedlife.in).
 *
 * Source: Household Profile-WRP (29k+ households, each with settlement_id)
 * Fields used:
 *   - availability_ration_card: "Yes/ஆம்" | "No/இல்லை"
 *   - cmchis_status: "CMCHIS Active" | "CMCHIS Applied – ETA 5d" | "Rejected" | "Start – CMCHIS not applied"
 *
 * For each settlement × scheme:
 *   eligibleHouseholds  = total surveyed households in that settlement
 *   enrolledHouseholds  = households with the scheme active
 *     ration-card:    availability_ration_card starts with "yes"
 *     cmchis:         cmchis_status contains "active"
 *
 * Scheduled weekly (Sunday 02:30 UTC) via vercel.json.
 * Also callable manually: GET /api/cron/sync-entitlements-chennai
 * with Authorization: Bearer $CRON_SECRET
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const FRAPPE_BASE = (process.env.FRAPPE_CHENNAI_URL ?? "https://chennai.dignifiedlife.in").trim();
const FRAPPE_KEY = (process.env.FRAPPE_CHENNAI_KEY ?? "").trim();
const FRAPPE_SECRET = (process.env.FRAPPE_CHENNAI_SECRET ?? "").trim();

async function frappeFetch(path: string, retries = 3): Promise<unknown> {
  const url = `${FRAPPE_BASE}/api${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          Authorization: `token ${FRAPPE_KEY}:${FRAPPE_SECRET}`,
          Connection: "close",
        },
      });
      return r.json();
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException })?.cause?.code;
      if (attempt < retries && (code === "UND_ERR_SOCKET" || code === "ECONNRESET")) {
        // Frappe closes TCP connection after response — retry
        await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

type HHRow = {
  settlement_id: string;
  survay_status?: string;
  availability_ration_card?: string;
  cmchis_status?: string;
};

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // 1. Fetch all Household Profile-WRP records (paginated with limit_start)
  const fields = encodeURIComponent(
    JSON.stringify(["settlement_id", "survay_status", "availability_ration_card", "cmchis_status"])
  );
  const allHH: HHRow[] = [];
  let offset = 0;
  while (true) {
    const batch = await frappeFetch(
      `/resource/Household%20Profile-WRP?limit=500&limit_start=${offset}&fields=${fields}`
    );
    const rows: HHRow[] = (batch as { data?: HHRow[] }).data ?? [];
    allHH.push(...rows);
    if (rows.length < 500) break;
    offset += 500;
  }

  // 2. Aggregate by settlement — both schemes use all surveyed HHs as denominator
  type SchemeAgg = { total: number; enrolled: number };
  const agg = new Map<string, Map<string, SchemeAgg>>();

  for (const hh of allHH) {
    const settlement = hh.settlement_id?.trim();
    if (!settlement) continue;
    // Only count occupied households — exclude vacant, door-closed, moved-out
    if (!(hh.survay_status ?? "").toLowerCase().startsWith("occupied")) continue;

    if (!agg.has(settlement)) agg.set(settlement, new Map());
    const sMap = agg.get(settlement)!;

    const inc = (schemeId: string, enrolled: boolean) => {
      const entry = sMap.get(schemeId) ?? { total: 0, enrolled: 0 };
      entry.total += 1;
      if (enrolled) entry.enrolled += 1;
      sMap.set(schemeId, entry);
    };

    // Ration card
    const hasRation = (hh.availability_ration_card ?? "").toLowerCase().startsWith("yes");
    inc("ration-card", hasRation);

    // CMCHIS — count all surveyed HHs; enrolled = those with active status
    const cmchis = (hh.cmchis_status ?? "").toLowerCase();
    const cmchisActive = cmchis.includes("active");
    inc("cmchis", cmchisActive);
  }

  // 3. Build settlement name → assessmentId map (Chennai only)
  const chennaiAssessments = await prisma.$queryRaw<
    Array<{ assessment_id: string; settlement_name: string }>
  >`
    SELECT sa.id as assessment_id, s.name as settlement_name
    FROM "SettlementAssessment" sa
    JOIN "Settlement" s ON s.id = sa."settlementId"
    JOIN "Cluster" cl ON cl.id = s."clusterId"
    JOIN "Zone" z ON z.id = cl."zoneId"
    JOIN "City" c ON c.id = z."cityId"
    WHERE c.name = 'Chennai'
  `;

  const exactMap = new Map(chennaiAssessments.map((a) => [a.settlement_name, a.assessment_id]));

  function normName(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  }
  const normMap = new Map(
    chennaiAssessments.map((a) => [normName(a.settlement_name), a.assessment_id])
  );

  // Word-overlap fuzzy fallback for names that differ in spelling/punctuation
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

  function lookupAssessment(name: string): string | undefined {
    return exactMap.get(name) ?? normMap.get(normName(name)) ?? wordOverlapMatch(name);
  }

  // 4. Upsert EntitlementBaseline rows
  let upserted = 0;
  const unmatched: string[] = [];

  for (const [settlementName, schemeMap] of agg) {
    const assessmentId = lookupAssessment(settlementName);
    if (!assessmentId) { unmatched.push(settlementName); continue; }

    for (const [schemeId, { total, enrolled }] of schemeMap) {
      await prisma.entitlementBaseline.upsert({
        where: { assessmentId_schemeId: { assessmentId, schemeId } },
        update: { eligibleHouseholds: total, enrolledHouseholds: enrolled },
        create: {
          id: `ch${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          assessmentId,
          schemeId,
          eligibleHouseholds: total,
          enrolledHouseholds: enrolled,
        },
      });
      upserted++;
    }
  }

  return Response.json({
    ok: true,
    householdsScanned: allHH.length,
    settlementsFound: agg.size,
    settlementsMatched: agg.size - unmatched.length,
    skippedNoMatch: unmatched.length,
    unmatched,
    upserted,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
  });
}
