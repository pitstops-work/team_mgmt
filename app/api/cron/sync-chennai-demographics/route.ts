/**
 * Cron: sync Chennai demographic counts from Frappe (chennai.dignifiedlife.in).
 *
 * Source: Individual Profile-WRP (~66k rows, each with settlement + age).
 *
 * Chennai uses **age 55+** as the elderly threshold (vs. 60+ in Bangalore).
 * This sync overwrites `SettlementAssessment.elderly60plus` for the latest
 * Chennai assessment per settlement with the count of Active individuals
 * with age >= 55. The column name stays as `elderly60plus` because the
 * downstream formula machinery already keys on that field — only the value
 * source differs per city.
 *
 * Scheduled weekly via vercel.json. Also callable manually with
 *   Authorization: Bearer $CRON_SECRET
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const FRAPPE_BASE = (process.env.FRAPPE_CHENNAI_URL ?? "https://chennai.dignifiedlife.in").trim();
const FRAPPE_KEY = (process.env.FRAPPE_CHENNAI_KEY ?? "").trim();
const FRAPPE_SECRET = (process.env.FRAPPE_CHENNAI_SECRET ?? "").trim();

// Frappe's status field is bilingual: "Active- ஆக்டிவ்". Match on the English prefix.
const ACTIVE_PREFIX = "active";
// Chennai's elderly threshold (vs. 60 in Bangalore).
const ELDERLY_MIN_AGE = 55;
// settlement_selection_status values to include — "Yes" (fully in programme)
// and "Yes - Partially". Excludes "Yes, but not for Phase 1" and blanks.
const INCLUDED_SELECTION_STATUSES = new Set([
  "yes",
  "yes - partially",
]);

type IndividualRow = {
  name: number | string;
  age: number | null;
  status: string | null;
  settlement_intervention_unit: string | null;
  settlement_selection_status: string | null;
};

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
        await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // 1. Paginate through every individual profile row.
  const fields = encodeURIComponent(
    JSON.stringify(["settlement_intervention_unit", "age", "status", "settlement_selection_status"])
  );
  const elderlyBySettlement = new Map<string, number>();
  let scanned = 0;
  let activeKept = 0;
  let inProgramme = 0;
  let elderlyKept = 0;
  let offset = 0;
  while (true) {
    const batch = await frappeFetch(
      `/resource/Individual%20Profile-WRP?limit=500&limit_start=${offset}&fields=${fields}`
    );
    const rows: IndividualRow[] = (batch as { data?: IndividualRow[] }).data ?? [];
    scanned += rows.length;
    for (const r of rows) {
      const settlement = r.settlement_intervention_unit?.trim();
      if (!settlement) continue;
      const status = (r.status ?? "").trim().toLowerCase();
      if (!status.startsWith(ACTIVE_PREFIX)) continue;
      activeKept++;
      // Only count people the programme is actually serving in Phase 1.
      // Excludes "Yes, but not for Phase 1" and blank/unset rows.
      const selection = (r.settlement_selection_status ?? "").trim().toLowerCase();
      if (!INCLUDED_SELECTION_STATUSES.has(selection)) continue;
      inProgramme++;
      const age = typeof r.age === "number" ? r.age : Number(r.age);
      if (!Number.isFinite(age) || age < ELDERLY_MIN_AGE) continue;
      elderlyKept++;
      elderlyBySettlement.set(settlement, (elderlyBySettlement.get(settlement) ?? 0) + 1);
    }
    if (rows.length < 500) break;
    offset += 500;
  }

  // 2. Resolve Frappe settlement names → Chennai DB settlement IDs.
  //    Mirror the matching strategy used by sync-entitlements-chennai.
  //    Also filters out settlements whose parent cluster or zone is soft-deleted
  //    so we don't write to settlements that the UI considers gone.
  const chennaiSettlements = await prisma.$queryRaw<
    Array<{ settlement_id: string; settlement_name: string }>
  >`
    SELECT s.id as settlement_id, s.name as settlement_name
    FROM "Settlement" s
    JOIN "Cluster" cl ON cl.id = s."clusterId"
    JOIN "Zone" z ON z.id = cl."zoneId"
    JOIN "City" c ON c.id = z."cityId"
    WHERE c.name = 'Chennai'
      AND s."deletedAt" IS NULL
      AND cl."deletedAt" IS NULL
      AND z."deletedAt" IS NULL
  `;

  function normName(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  }

  const exactMap = new Map(chennaiSettlements.map((s) => [s.settlement_name, s.settlement_id]));
  const normMap = new Map(
    chennaiSettlements.map((s) => [normName(s.settlement_name), s.settlement_id])
  );

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

  function lookupSettlement(name: string): string | undefined {
    return exactMap.get(name) ?? normMap.get(normName(name)) ?? wordOverlapMatch(name);
  }

  // 3. Update latest SettlementAssessment.elderly60plus + the SettlementProfile snapshot.
  const unmatched: string[] = [];
  let updatedAssessments = 0;
  let updatedProfiles = 0;
  for (const [settlementName, elderlyCount] of elderlyBySettlement) {
    const settlementId = lookupSettlement(settlementName);
    if (!settlementId) { unmatched.push(settlementName); continue; }

    const latestAssessment = await prisma.settlementAssessment.findFirst({
      where: { settlementId },
      orderBy: { assessedAt: "desc" },
      select: { id: true },
    });
    if (!latestAssessment) continue;

    await prisma.settlementAssessment.update({
      where: { id: latestAssessment.id },
      data: { elderly60plus: elderlyCount },
    });
    updatedAssessments++;

    // Refresh the snapshot so downstream readers (formulas, /needs) see the new number.
    await prisma.settlementProfile.upsert({
      where: { settlementId },
      create: {
        settlementId,
        elderly60plus: elderlyCount,
        lastAssessmentId: latestAssessment.id,
        lastSyncedAt: new Date(),
      },
      update: { elderly60plus: elderlyCount, lastSyncedAt: new Date() },
    });
    updatedProfiles++;
  }

  return Response.json({
    ok: true,
    individualsScanned: scanned,
    activeIndividuals: activeKept,
    inProgrammePhase1: inProgramme,
    elderly55plus: elderlyKept,
    settlementsFound: elderlyBySettlement.size,
    settlementsMatched: elderlyBySettlement.size - unmatched.length,
    updatedAssessments,
    updatedProfiles,
    skippedNoMatch: unmatched.length,
    unmatched,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
  });
}
