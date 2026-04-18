/**
 * Seed EntitlementBaseline from Janadhikara scheme_report API.
 *
 * For each (assessment × scheme) pair:
 *   eligibleHouseholds  = count of HH rows for that slum+scheme (all statuses)
 *   enrolledHouseholds  = count of HH rows where Approved > 0 or Benefit > 0
 *
 * Run:
 *   node scripts/seed-entitlement-baselines.mjs
 *
 * Requires DATABASE_URL in env (use .env.local or export).
 */

import { createRequire } from "module";
import crypto from "crypto";
const require = createRequire(import.meta.url);
const { Pool } = require("pg");

// ── helpers ────────────────────────────────────────────────────────────────

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

async function loginJanadhikara() {
  const email = process.env.JANADHIKARA_EMAIL ?? "philanthropy.apps@azimpremjifoundation.org";
  const plainPassword = process.env.JANADHIKARA_PASSWORD ?? "123456";

  const now = new Date().toISOString().replace("T", " ").split(".")[0];
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  const salt = sha256(now + rand);
  const pwHash = sha256(plainPassword);
  const password = sha256(pwHash + salt);

  const body = new URLSearchParams({ email, password, salt });
  const res = await fetch("https://janadhikara.org/backend/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Origin": "https://janadhikara.org", "Referer": "https://janadhikara.org/" },
    body: body.toString(),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Login failed: " + JSON.stringify(data));
  console.log("✓ Logged in to Janadhikara");
  return data.token;
}

async function fetchSchemeReport(token) {
  console.log("Fetching scheme_report (this may take a moment)...");
  const res = await fetch(`https://janadhikara.org/backend/api/scheme_report?token=${token}&partner_id=1`);
  const data = await res.json();
  const items = data.items ?? [];
  console.log(`✓ Got ${items.length} rows`);
  return items;
}

// ── scheme name → our EntitlementScheme ID ────────────────────────────────
// Keys are lowercased janadhikara Scheme_Name for fuzzy matching.
const SCHEME_MAP = {
  // Ration card
  "ration card": "ration-card",
  "ration card update": "ration-card",

  // Aadhaar
  "aadhaar card": "aadhaar",
  "aadhaar card update": "aadhaar",

  // BoCW
  "bocw labour card": "bocw-card",
  "bocw labour card renewal": "bocw-card",

  "bocw accident benefits": "bocw-accident-benefit",
  "bocw shrama samarthya toolkit": "bocw-tools",
  "bocw thayi magu sahaya hastha": "bocw-maternity",
  "bocw maternity benefit": "bocw-maternity",
  "bocw medical assistance(karmika arogya bhagya)": "bocw-medical",
  "bocw assistance for major ailments (karmika chikitsa bhagya)": "bocw-medical",
  "bocw education assistance": "bocw-education",
  "bocw kalike bhagya educational assistance": "bocw-education",
  "bocw education kit": "bocw-education",
  "bocw marriage assistance": "bocw-marriage",
  "bocw house assitance(karmika ghruha bhagya)": "bocw-housing",
  "bocw assistance to meet the funeral expenses and ex gratia": "bocw-funeral",
  "bocw pension disability": "bocw-pension",
  "bocw assistance for free bmtc bus pass": null, // no matching scheme

  // Pensions
  "pension sandya suraksha": "pension-old-age",
  "pension indira gandhi old age": "pension-old-age",
  "pension elderly": "pension-old-age",
  "pension widow": "pension-widow",
  "pension mythree": "pension-widow",
  "pension manaswini": "pension-disability",
  "pension disability": "pension-disability",
  "pension family": null,

  // Housing
  "hakku pathra": "housing-hakkupatra",
  "hakkupatra": "housing-hakkupatra",
  "rajiv gandhi vasati yojane": "housing-pmay",
  "absolute sale deed": "housing-sale-deed",

  // Ayushman Bharat
  "ayushman barath arogya karnataka health card abark": "ayushman-bharat",
  "ayushman bharat health account abha": "ayushman-bharat",

  // Scholarships
  "scholarship ssp pre-matriculation 2025": "scholarship-pre-matric",
  "scholarship ssp pre matriculation 2023": "scholarship-pre-matric",
  "scholarship ssp pre matriculation 2024": "scholarship-pre-matric",
  "scholarship ssp post-matriculation 2025": "scholarship-post-matric",
  "scholarship ssp post-matriculation 2023": "scholarship-post-matric",
  "scholarship ssp post-matriculation 2024": "scholarship-post-matric",
  "fee reimbursement": "scholarship-post-matric",
  "azim premji scholarship": "scholarship-minority",
  "prize money scholarship": "scholarship-minority",
  "sponsorship scheme": "scholarship-minority",

  // PM schemes
  "pradhan mantri matru vandana yojana (pmmvy)": "pm-matru-vandana",
  "sukanya samriddhi yojana (ssy)": "sukanya",
};

function mapScheme(schemeName) {
  const key = schemeName.toLowerCase().trim();
  // Direct match
  if (key in SCHEME_MAP) return SCHEME_MAP[key];
  // Partial fuzzy matches
  if (key.startsWith("bocw labour card")) return "bocw-card";
  if (key.includes("maternity")) return "bocw-maternity";
  if (key.includes("funeral") || key.includes("ex gratia")) return "bocw-funeral";
  if (key.includes("medical") && key.includes("bocw")) return "bocw-medical";
  if (key.includes("education") && key.includes("bocw")) return "bocw-education";
  if (key.includes("marriage") && key.includes("bocw")) return "bocw-marriage";
  if (key.includes("house") && key.includes("bocw")) return "bocw-housing";
  if (key.includes("pension") && key.includes("disability")) return "pension-disability";
  if (key.includes("old age pension") || key.includes("sandhya") || key.includes("sandya")) return "pension-old-age";
  if (key.includes("widow pension") || key.includes("pension widow")) return "pension-widow";
  if (key.includes("ration card")) return "ration-card";
  if (key.includes("aadhaar")) return "aadhaar";
  if (key.includes("ayushman") || key.includes("abark") || key.includes("pmjay")) return "ayushman-bharat";
  if (key.includes("hakku")) return "housing-hakkupatra";
  if (key.includes("sukanya")) return "sukanya";
  if (key.includes("matru vandana") || key.includes("pmmvy")) return "pm-matru-vandana";
  if (key.includes("pre-matric") || key.includes("pre matric")) return "scholarship-pre-matric";
  if (key.includes("post-matric") || key.includes("post matric")) return "scholarship-post-matric";
  return null; // not a scheme we track
}

// ── main ──────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const token = await loginJanadhikara();
const items = await fetchSchemeReport(token);

// Build slum_id → assessmentId map from DB
const { rows: assessmentRows } = await pool.query(`
  SELECT id, (("enumeratorNotes")::jsonb->>'slum_id')::int AS slum_id
  FROM "SettlementAssessment"
  WHERE "enumeratorNotes" IS NOT NULL
    AND "enumeratorNotes" != ''
    AND ("enumeratorNotes")::jsonb->>'slum_id' IS NOT NULL
`);
const slumToAssessment = new Map(assessmentRows.map((r) => [r.slum_id, r.id]));
console.log(`✓ ${slumToAssessment.size} assessment mappings loaded`);

// Aggregate janadhikara data: (slum_id, scheme_name) → {eligible, enrolled}
const agg = new Map(); // key: `${slum_id}::${schemeId}`
let skippedSchemes = new Set();
let matchedSchemes = new Set();

for (const row of items) {
  const schemeId = mapScheme(row.Scheme_Name);
  if (!schemeId) {
    skippedSchemes.add(row.Scheme_Name);
    continue;
  }
  matchedSchemes.add(row.Scheme_Name);

  const assessmentId = slumToAssessment.get(row.slum_id);
  if (!assessmentId) continue; // slum not in our system

  const key = `${assessmentId}::${schemeId}`;
  const existing = agg.get(key) ?? { assessmentId, schemeId, eligible: 0, enrolled: 0 };
  existing.eligible += 1;
  if ((row.Approved ?? 0) > 0 || (row.Benefit ?? 0) > 0) {
    existing.enrolled += 1;
  }
  agg.set(key, existing);
}

console.log(`\nSchemes matched: ${matchedSchemes.size}`);
console.log(`Schemes skipped (not in our system): ${skippedSchemes.size}`);
console.log(`Unique (assessment × scheme) pairs to insert: ${agg.size}`);

if (agg.size === 0) {
  console.log("Nothing to insert — check slum_id and scheme mappings.");
  await pool.end();
  process.exit(0);
}

// Upsert EntitlementBaseline rows
const pairs = Array.from(agg.values());
let inserted = 0;
let updated = 0;

for (const { assessmentId, schemeId, eligible, enrolled } of pairs) {
  const existing = await pool.query(
    `SELECT id FROM "EntitlementBaseline" WHERE "assessmentId" = $1 AND "schemeId" = $2`,
    [assessmentId, schemeId]
  );
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE "EntitlementBaseline" SET "eligibleHouseholds" = $1, "enrolledHouseholds" = $2 WHERE "assessmentId" = $3 AND "schemeId" = $4`,
      [eligible, enrolled, assessmentId, schemeId]
    );
    updated++;
  } else {
    // Generate a cuid-style id
    const id = `jd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO "EntitlementBaseline" (id, "assessmentId", "schemeId", "eligibleHouseholds", "enrolledHouseholds") VALUES ($1, $2, $3, $4, $5)`,
      [id, assessmentId, schemeId, eligible, enrolled]
    );
    inserted++;
  }
}

console.log(`\n✓ Done! Inserted: ${inserted}, Updated: ${updated}`);

// Summary
const summary = await pool.query(
  `SELECT s.name, COUNT(*) as assessments, SUM(b."eligibleHouseholds") as eligible, SUM(b."enrolledHouseholds") as enrolled
   FROM "EntitlementBaseline" b
   JOIN "EntitlementScheme" s ON s.id = b."schemeId"
   GROUP BY s.name ORDER BY eligible DESC LIMIT 15`
);
console.log("\nTop schemes by eligible households:");
summary.rows.forEach((r) => {
  const pct = r.eligible > 0 ? Math.round((r.enrolled / r.eligible) * 100) : 0;
  console.log(`  ${r.name}: ${r.enrolled}/${r.eligible} enrolled (${pct}%) across ${r.assessments} settlements`);
});

await pool.end();
