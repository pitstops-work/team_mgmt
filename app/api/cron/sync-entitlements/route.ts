/**
 * Cron: sync entitlement baselines from Janadhikara scheme_report API.
 *
 * Denominator logic (eligibleHouseholds):
 *   bocw-card + all bocw-* sub-schemes → BoCW Labour Card tracked count per slum
 *     (people identified as construction workers in Janadhikara)
 *   pension-old-age (+ sandya/indira gandhi variants) → elder count per slum
 *   pension-disability → pwd count per slum
 *   pension-widow → widow count per slum
 *   all other schemes → total surveyed households per slum
 *
 * Enrolled = scheme_report rows with Approved > 0 or Benefit > 0.
 *
 * Scheduled weekly (Sunday 02:00 UTC) via vercel.json.
 * Also callable manually: GET /api/cron/sync-entitlements
 * with Authorization: Bearer $CRON_SECRET
 */

import { NextRequest } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";

// ── Janadhikara auth ──────────────────────────────────────────────────────

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function loginJanadhikara(): Promise<string> {
  const email = (process.env.JANADHIKARA_EMAIL ?? "philanthropy.apps@azimpremjifoundation.org").trim();
  const plain = (process.env.JANADHIKARA_PASSWORD ?? "123456").trim();
  const now = new Date().toISOString().replace("T", " ").split(".")[0];
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  const salt = sha256(now + rand);
  const password = sha256(sha256(plain) + salt);

  const body = new URLSearchParams({ email, password, salt });
  const res = await fetch("https://janadhikara.org/backend/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://janadhikara.org",
      "Referer": "https://janadhikara.org/",
    },
    body: body.toString(),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Janadhikara login failed: " + JSON.stringify(data));
  return data.token as string;
}

// ── Scheme name → our EntitlementScheme ID ────────────────────────────────

function mapScheme(name: string): string | null {
  const k = name.toLowerCase().trim();
  if (k.includes("ration card")) return "ration-card";
  if (k.includes("aadhaar")) return "aadhaar";
  if (k.startsWith("bocw labour card")) return "bocw-card";
  if (k === "bocw accident benefits") return "bocw-accident-benefit";
  if (k.includes("shrama samarthya")) return "bocw-tools";
  if (k.includes("maternity") || k.includes("thayi magu")) return "bocw-maternity";
  if ((k.includes("medical") || k.includes("major ailments")) && k.includes("bocw")) return "bocw-medical";
  if ((k.includes("education") || k.includes("kalike bhagya")) && k.includes("bocw")) return "bocw-education";
  if (k.includes("marriage") && k.includes("bocw")) return "bocw-marriage";
  if (k.includes("house") && k.includes("bocw")) return "bocw-housing";
  if (k.includes("funeral") || k.includes("ex gratia")) return "bocw-funeral";
  if (k.includes("bocw pension")) return "bocw-pension";
  if (k.includes("sandya") || k.includes("sandhya") || k.includes("indira gandhi old") || k.includes("pension elderly")) return "pension-old-age";
  if (k.includes("pension widow") || k.includes("widow pension") || k.includes("mythree")) return "pension-widow";
  if (k.includes("manaswini") || (k.includes("pension") && k.includes("disability"))) return "pension-disability";
  if (k.includes("hakku")) return "housing-hakkupatra";
  if (k.includes("rajiv gandhi vasati")) return "housing-pmay";
  if (k.includes("sale deed")) return "housing-sale-deed";
  if (k.includes("ayushman") || k.includes("abark")) return "ayushman-bharat";
  if (k.includes("pre-matric") || k.includes("pre matric")) return "scholarship-pre-matric";
  if (k.includes("post-matric") || k.includes("post matric") || k.includes("fee reimbursement")) return "scholarship-post-matric";
  if (k.includes("azim premji") || k.includes("prize money") || k.includes("sponsorship scheme")) return "scholarship-minority";
  if (k.includes("matru vandana") || k.includes("pmmvy")) return "pm-matru-vandana";
  if (k.includes("sukanya")) return "sukanya";
  return null;
}

// Which schemes use which denominator type
function denominatorType(schemeId: string): "bocw" | "elder" | "pwd" | "widow" | "household" {
  if (schemeId.startsWith("bocw")) return "bocw";
  if (schemeId === "pension-old-age") return "elder";
  if (schemeId === "pension-disability") return "pwd";
  if (schemeId === "pension-widow") return "widow";
  return "household";
}

// ── Main handler ──────────────────────────────────────────────────────────

type SlumStats = { total_hh: number; elder: number; pwd: number; widow: number };
type SchemeRow = { slum_id: number; Scheme_Name: string; Approved?: number; Benefit?: number };

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  const token = await loginJanadhikara();

  // 1. Fetch Reports (per-slum demographics) and scheme_report in parallel
  const [reportsRes, schemeRes] = await Promise.all([
    fetch(`https://janadhikara.org/backend/api/Reports?token=${token}`),
    fetch(`https://janadhikara.org/backend/api/scheme_report?token=${token}&partner_id=1`),
  ]);
  const { items: reportItems = [] } = await reportsRes.json() as {
    items: Array<{ slum_id: number; total_hh_survey: number; elder: number; pwd: number }>
  };
  const { items = [] } = await schemeRes.json() as { items: SchemeRow[] };

  // 2. Build per-slum stats maps
  //    Reports gives total_hh, elder, pwd
  //    BoCW Labour Card rows in scheme_report give construction worker count
  const slumStats = new Map<number, SlumStats>();
  for (const r of reportItems) {
    slumStats.set(r.slum_id, {
      total_hh: r.total_hh_survey ?? 0,
      elder: r.elder ?? 0,
      pwd: r.pwd ?? 0,
      widow: 0,  // filled below from scheme_report proxy
    });
  }

  // Widow proxy: count unique scheme_report entries for widow pension schemes per slum
  // (people who applied for widow pension ≈ widows identified in that slum)
  const widowSchemes = new Set(["pension-widow", "pension-mythree"]);
  const widowBySlum = new Map<number, number>();
  for (const row of items) {
    const sid = mapScheme(row.Scheme_Name);
    if (sid && widowSchemes.has(sid)) {
      widowBySlum.set(row.slum_id, (widowBySlum.get(row.slum_id) ?? 0) + 1);
    }
  }
  // BoCW Labour Card: construction workers per slum
  const bocwBySlum = new Map<number, number>();
  for (const row of items) {
    if (row.Scheme_Name.toLowerCase().includes("labour card")) {
      bocwBySlum.set(row.slum_id, (bocwBySlum.get(row.slum_id) ?? 0) + 1);
    }
  }

  // 3. Build slum_id → assessmentId map from DB enumeratorNotes
  const assessments = await prisma.settlementAssessment.findMany({
    where: { enumeratorNotes: { not: null } },
    select: { id: true, enumeratorNotes: true },
  });

  const slumToAssessments = new Map<number, string[]>();
  for (const a of assessments) {
    if (!a.enumeratorNotes) continue;
    try {
      const notes = JSON.parse(a.enumeratorNotes);
      const ids: number[] = notes.slum_ids ?? (notes.slum_id != null ? [notes.slum_id] : []);
      for (const sid of ids) {
        const existing = slumToAssessments.get(sid) ?? [];
        existing.push(a.id);
        slumToAssessments.set(sid, existing);
      }
    } catch {
      // non-JSON notes — skip
    }
  }

  // 4. Aggregate enrolled counts from scheme_report
  //    eligible is set from denominator maps, not counted from scheme_report
  const enrolled = new Map<string, number>();  // key = assessmentId::schemeId
  const seenAssessmentSchemes = new Set<string>();

  for (const row of items) {
    const schemeId = mapScheme(row.Scheme_Name);
    if (!schemeId) continue;
    const assessmentIds = slumToAssessments.get(row.slum_id);
    if (!assessmentIds) continue;

    for (const assessmentId of assessmentIds) {
      const key = `${assessmentId}::${schemeId}`;
      seenAssessmentSchemes.add(key);
      if ((row.Approved ?? 0) > 0 || (row.Benefit ?? 0) > 0) {
        enrolled.set(key, (enrolled.get(key) ?? 0) + 1);
      }
    }
  }

  // 5. Build assessment → slum_id reverse map (for denominator lookup)
  const assessmentToSlum = new Map<string, number>();
  for (const [slumId, aIds] of slumToAssessments) {
    for (const aId of aIds) {
      assessmentToSlum.set(aId, slumId);
    }
  }

  // 6. Upsert EntitlementBaseline rows
  let upserted = 0;

  for (const key of seenAssessmentSchemes) {
    const [assessmentId, schemeId] = key.split("::");
    const slumId = assessmentToSlum.get(assessmentId);
    const stats = slumId != null ? slumStats.get(slumId) : undefined;

    let eligible = 0;
    if (stats) {
      const dtype = denominatorType(schemeId);
      if (dtype === "bocw") eligible = bocwBySlum.get(slumId!) ?? 0;
      else if (dtype === "elder") eligible = stats.elder;
      else if (dtype === "pwd") eligible = stats.pwd;
      else if (dtype === "widow") eligible = widowBySlum.get(slumId!) ?? 0;
      else eligible = stats.total_hh;
    } else {
      // No Reports data for this slum — fall back to scheme_report count
      eligible = seenAssessmentSchemes.size > 0 ? 1 : 0; // placeholder
    }

    const enrolledCount = enrolled.get(key) ?? 0;

    await prisma.entitlementBaseline.upsert({
      where: { assessmentId_schemeId: { assessmentId, schemeId } },
      update: { eligibleHouseholds: eligible, enrolledHouseholds: enrolledCount },
      create: {
        id: `jd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        assessmentId,
        schemeId,
        eligibleHouseholds: eligible,
        enrolledHouseholds: enrolledCount,
      },
    });
    upserted++;
  }

  return Response.json({
    ok: true,
    upserted,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    janadhikaraRows: items.length,
    slumsWithStats: slumStats.size,
    assessmentsMapped: slumToAssessments.size,
  });
}
