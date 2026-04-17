/**
 * Cron: sync pre-existing scheme possession from Janadhikara household survey XLSX exports.
 *
 * Fills `EntitlementBaseline.surveyEnrolled` — households that ALREADY HAD a scheme
 * at the time the NGO first surveyed the slum (2022–present). Distinct from
 * `enrolledHouseholds` (NGO-assisted cases from scheme_report).
 *
 * True saturation = surveyEnrolled + enrolledHouseholds (small overlap for long-running slums).
 *
 * XLSX column mapping (0-indexed, from All Partners HouseHold export):
 *   [0]   household_code
 *   [5]   slum_name
 *   [38]  Whether_family_has_a_ration_card           → ration-card
 *   [68]  Age
 *   [75]  Are_you_getting_elderly_pension?            → pension-old-age
 *   [80]  Marital_Status
 *   [81]  Are_you_getting_widow_pension?              → pension-widow
 *   [104] Has_Aadhar_card?                            → aadhaar
 *   [116] Are_you_a_beneficiary_of_any_health_insurance? → ayushman-bharat
 *   [121] Is_PwD?
 *   [125] Are_they_having_UDID_Card?
 *   [126] Are_you_getting_Disability_pension_and_other_benifits? → pension-disability
 *   [133] Are_you_registered_under_the_specific_occupation_welfare_scheme_... → bocw-card
 *
 * Aggregation rules:
 *   ration-card, aadhaar, ayushman-bharat → count distinct HH codes where any member = Yes
 *   pension-old-age  → member rows where elderly_pension = Yes
 *   pension-widow    → member rows where widow_pension = Yes
 *   pension-disability → member rows where PwD = Yes AND (UDID = Yes OR disability pension = Yes)
 *   bocw-card        → member rows where occupation welfare ≠ NA / No / null
 *
 * Export strategy:
 *   Download ALL completed "All Partners" HouseHold exports from list_export.
 *   Stitch them together, deduplicating by household_code (latest wins).
 *   This currently covers Nov 2022 → Sep 2023 (the bulk of initial survey cohort).
 *   When the Janadhikara admin generates new All Partners exports, they are automatically
 *   picked up on the next monthly run.
 *
 * Scheduled monthly (1st of month, 03:00 UTC) via vercel.json.
 * Manual: GET /api/cron/sync-entitlements-survey  with  Authorization: Bearer $CRON_SECRET
 */

import { NextRequest } from "next/server";
import { createHash } from "crypto";
import * as XLSX from "xlsx";
import prisma from "@/lib/prisma";

const JANADHIKARA_BASE = "https://janadhikara.org/backend/api";

// ── Auth ──────────────────────────────────────────────────────────────────────

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function loginJanadhikara(): Promise<string> {
  const email = (process.env.JANADHIKARA_EMAIL ?? "").trim();
  const plain = (process.env.JANADHIKARA_PASSWORD ?? "").trim();
  const now = new Date().toISOString().replace("T", " ").split(".")[0];
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  const salt = sha256(now + rand);
  const password = sha256(sha256(plain) + salt);
  const body = new URLSearchParams({ email, password, salt });
  const res = await fetch(`${JANADHIKARA_BASE}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://janadhikara.org",
      "Referer": "https://janadhikara.org/",
    },
    body: body.toString(),
  });
  const data = await res.json() as { token?: string };
  if (!data.token) throw new Error("Janadhikara login failed");
  return data.token;
}

// ── XLSX parsing ──────────────────────────────────────────────────────────────

// Column indices (0-based)
const C_HH_CODE    = 0;
const C_SLUM       = 5;
const C_RATION     = 38;
const C_AGE        = 68;
const C_ELDERLY_PENSION = 75;
const C_MARITAL    = 80;
const C_WIDOW_PENSION = 81;
const C_AADHAAR    = 104;
const C_INSURANCE  = 116;
const C_PWD        = 121;
const C_UDID       = 125;
const C_DISABILITY_PENSION = 126;
const C_OCCUPATION_WELFARE = 133;

function isYes(val: unknown): boolean {
  return typeof val === "string" && val.toLowerCase().trim().startsWith("yes");
}

type SlumCounts = {
  totalHH:        Set<string>;
  rationCardHH:   Set<string>;
  aadhaarHH:      Set<string>;
  healthInsHH:    Set<string>;
  elderlyPension: number;
  widowPension:   number;
  disabilityPwd:  number;
  bocwCard:       number;
};

// Merge one XLSX buffer into an existing slumCounts map (deduplicating by hhCode across exports).
// SheetJS dense mode stores rows as ws[0], ws[1], ... (numeric keys), not ws["!data"].
function mergeXlsx(buffer: ArrayBuffer, result: Map<string, SlumCounts>): void {
  const wb = XLSX.read(Buffer.from(buffer), { type: "buffer", dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]] as unknown as Record<number, XLSX.CellObject[]>;

  // Find row count from the sheet range
  const range = (wb.Sheets[wb.SheetNames[0]] as XLSX.WorkSheet)["!ref"] ?? "";
  const decoded = XLSX.utils.decode_range(range);
  const rowCount = decoded.e.r + 1;

  // Row 0 is header — skip it
  for (let r = 1; r < rowCount; r++) {
    const row = ws[r] as XLSX.CellObject[] | undefined;
    if (!row) continue;

    const slum = row[C_SLUM]?.v as string | undefined;
    if (!slum || slum.toString().trim() === "") continue;

    const slumKey = slum.toString().trim();
    if (!result.has(slumKey)) {
      result.set(slumKey, {
        totalHH:        new Set(),
        rationCardHH:   new Set(),
        aadhaarHH:      new Set(),
        healthInsHH:    new Set(),
        elderlyPension: 0,
        widowPension:   0,
        disabilityPwd:  0,
        bocwCard:       0,
      });
    }
    const counts = result.get(slumKey)!;

    const hhCode = (row[C_HH_CODE]?.v ?? "").toString().trim();
    if (hhCode) counts.totalHH.add(hhCode);

    // Household-level (same value for all member rows of a HH — use Set for deduplication)
    if (hhCode && isYes(row[C_RATION]?.v))   counts.rationCardHH.add(hhCode);
    if (hhCode && isYes(row[C_AADHAAR]?.v))  counts.aadhaarHH.add(hhCode);
    if (hhCode && isYes(row[C_INSURANCE]?.v)) counts.healthInsHH.add(hhCode);

    // Member-level (individual pension/disability)
    if (isYes(row[C_ELDERLY_PENSION]?.v))   counts.elderlyPension++;
    if (isYes(row[C_WIDOW_PENSION]?.v))     counts.widowPension++;

    // Disability: PwD = Yes AND (has UDID OR getting disability pension)
    if (isYes(row[C_PWD]?.v) && (isYes(row[C_UDID]?.v) || isYes(row[C_DISABILITY_PENSION]?.v))) {
      counts.disabilityPwd++;
    }

    // BoCW: registered under occupation welfare scheme (not NA/No/null)
    const occ = (row[C_OCCUPATION_WELFARE]?.v ?? "").toString().toLowerCase().trim();
    if (occ && occ !== "na" && occ !== "no" && occ !== "n/a") {
      counts.bocwCard++;
    }
  }

}

// ── Assessment name lookup ────────────────────────────────────────────────────

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function wordOverlapMatch(
  name: string,
  normMap: Map<string, string>
): string | undefined {
  const words = normName(name).split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return undefined;
  let bestId: string | undefined;
  let bestScore = 0;
  for (const [candNorm, id] of normMap) {
    const candWords = candNorm.split(" ").filter((w: string) => w.length > 2);
    const shared = words.filter((w) => candWords.includes(w)).length;
    const score = shared / Math.max(words.length, candWords.length);
    if (score > bestScore && score >= 0.5) { bestScore = score; bestId = id; }
  }
  return bestId;
}

// ── Main handler ──────────────────────────────────────────────────────────────

type ExportRow = {
  id: number;
  partner_name: string;
  export_from: string;
  export_to: string;
  status: string;
  export_url: string;
  export_type: string;
};

const SURVEY_SCHEMES = [
  "ration-card", "aadhaar", "ayushman-bharat",
  "pension-old-age", "pension-widow", "pension-disability", "bocw-card",
];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const token = await loginJanadhikara();

  // 1. Collect all completed "All Partners" HouseHold exports (sorted oldest→newest so newest data wins on merge)
  const listRes = await fetch(`${JANADHIKARA_BASE}/list_export?token=${token}`);
  const exports = await listRes.json() as ExportRow[];

  const allPartnersExports = exports
    .filter((e) =>
      e.status === "Completed" &&
      e.export_type === "HouseHold" &&
      e.partner_name?.toLowerCase().trim() === "all partners" &&
      e.export_url
    )
    .sort((a, b) => a.id - b.id);  // oldest first so newer exports overwrite on merge

  if (allPartnersExports.length === 0) {
    return Response.json({
      ok: false,
      status: "no_exports",
      message: "No completed All Partners HouseHold exports found in Janadhikara. Ask the admin to generate one.",
    });
  }

  // 2. Download and merge all exports (deduplicated by household_code)
  const slumCounts = new Map<string, SlumCounts>();
  const downloaded: number[] = [];

  for (const exp of allPartnersExports) {
    const url = `https://janadhikara.org/${exp.export_url}`;
    const res = await fetch(url);
    if (!res.ok) continue;  // skip if file gone
    const buf = await res.arrayBuffer();
    mergeXlsx(buf, slumCounts);
    downloaded.push(exp.id);
  }

  // 4. Build assessment lookup (Bangalore only) — LATEST assessment per settlement
  // DISTINCT ON with ORDER BY assessedAt DESC ensures we write to the same assessment
  // that latestAssessments queries use, avoiding a mismatch where surveyEnrolled ends
  // up on an older assessment while enrolledHouseholds is on a newer one.
  const bangaloreAssessments = await prisma.$queryRaw<
    Array<{ assessment_id: string; settlement_name: string }>
  >`
    SELECT DISTINCT ON (s.id) sa.id as assessment_id, s.name as settlement_name
    FROM "SettlementAssessment" sa
    JOIN "Settlement" s ON s.id = sa."settlementId"
    JOIN "Cluster" cl ON cl.id = s."clusterId"
    JOIN "Zone" z ON z.id = cl."zoneId"
    JOIN "City" c ON c.id = z."cityId"
    WHERE c.name = 'Bangalore'
    ORDER BY s.id, sa."assessedAt" DESC
  `;

  const exactMap = new Map(bangaloreAssessments.map((a) => [a.settlement_name, a.assessment_id]));
  const nMap = new Map(bangaloreAssessments.map((a) => [normName(a.settlement_name), a.assessment_id]));

  function lookupAssessment(name: string): string | undefined {
    return exactMap.get(name) ?? nMap.get(normName(name)) ?? wordOverlapMatch(name, nMap);
  }

  function surveyCountForScheme(schemeId: string, c: SlumCounts): number {
    switch (schemeId) {
      case "ration-card":        return c.rationCardHH.size;
      case "aadhaar":            return c.aadhaarHH.size;
      case "ayushman-bharat":    return c.healthInsHH.size;
      case "pension-old-age":    return c.elderlyPension;
      case "pension-widow":      return c.widowPension;
      case "pension-disability": return c.disabilityPwd;
      case "bocw-card":          return c.bocwCard;
      default:                   return -1;
    }
  }

  // 5. Upsert surveyEnrolled
  let upserted = 0;
  const unmatched: string[] = [];

  for (const [slumName, counts] of slumCounts) {
    const assessmentId = lookupAssessment(slumName);
    if (!assessmentId) { unmatched.push(slumName); continue; }

    for (const schemeId of SURVEY_SCHEMES) {
      const surveyCount = surveyCountForScheme(schemeId, counts);
      if (surveyCount < 0) continue;

      await prisma.entitlementBaseline.upsert({
        where: { assessmentId_schemeId: { assessmentId, schemeId } },
        update: { surveyEnrolled: surveyCount },
        create: {
          id: `sv${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          assessmentId,
          schemeId,
          eligibleHouseholds: counts.totalHH.size,
          enrolledHouseholds: 0,
          surveyEnrolled: surveyCount,
        },
      });
      upserted++;
    }
  }

  return Response.json({
    ok: true,
    exportsDownloaded: downloaded,
    slumsFound: slumCounts.size,
    slumsMatched: slumCounts.size - unmatched.length,
    skippedNoMatch: unmatched.length,
    unmatched: unmatched.slice(0, 30),
    upserted,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
  });
}
