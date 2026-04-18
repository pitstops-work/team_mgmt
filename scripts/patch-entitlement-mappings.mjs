/**
 * Patch entitlement baselines for settlements that were manually added
 * (no enumeratorNotes slum_id) but have confirmed Janadhikara matches.
 *
 * Run: node scripts/patch-entitlement-mappings.mjs
 */

import { createRequire } from "module";
import crypto from "crypto";
const require = createRequire(import.meta.url);
const { Pool } = require("pg");

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

async function loginJanadhikara() {
  const email = process.env.JANADHIKARA_EMAIL ?? "philanthropy.apps@azimpremjifoundation.org";
  const plain = process.env.JANADHIKARA_PASSWORD ?? "123456";
  const now = new Date().toISOString().replace("T", " ").split(".")[0];
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  const salt = sha256(now + rand);
  const password = sha256(sha256(plain) + salt);
  const body = new URLSearchParams({ email, password, salt });
  const res = await fetch("https://janadhikara.org/backend/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Origin": "https://janadhikara.org", "Referer": "https://janadhikara.org/" },
    body: body.toString(),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Login failed: " + JSON.stringify(data));
  console.log("✓ Logged in");
  return data.token;
}

async function fetchSchemeReport(token) {
  console.log("Fetching scheme_report...");
  const res = await fetch(`https://janadhikara.org/backend/api/scheme_report?token=${token}&partner_id=1`);
  const data = await res.json();
  const items = data.items ?? [];
  console.log(`✓ Got ${items.length} rows`);
  return items;
}

// Same scheme map as main seed script
function mapScheme(schemeName) {
  const key = schemeName.toLowerCase().trim();
  const exact = {
    "ration card": "ration-card", "ration card update": "ration-card",
    "aadhaar card": "aadhaar", "aadhaar card update": "aadhaar",
    "bocw labour card": "bocw-card", "bocw labour card renewal": "bocw-card",
    "bocw accident benefits": "bocw-accident-benefit",
    "bocw shrama samarthya toolkit": "bocw-tools",
    "bocw thayi magu sahaya hastha": "bocw-maternity", "bocw maternity benefit": "bocw-maternity",
    "bocw medical assistance(karmika arogya bhagya)": "bocw-medical",
    "bocw assistance for major ailments (karmika chikitsa bhagya)": "bocw-medical",
    "bocw education assistance": "bocw-education", "bocw kalike bhagya educational assistance": "bocw-education", "bocw education kit": "bocw-education",
    "bocw marriage assistance": "bocw-marriage",
    "bocw house assitance(karmika ghruha bhagya)": "bocw-housing",
    "bocw assistance to meet the funeral expenses and ex gratia": "bocw-funeral",
    "bocw pension disability": "bocw-pension",
    "pension sandya suraksha": "pension-old-age", "pension indira gandhi old age": "pension-old-age", "pension elderly": "pension-old-age",
    "pension widow": "pension-widow", "pension mythree": "pension-widow",
    "pension manaswini": "pension-disability", "pension disability": "pension-disability",
    "hakku pathra": "housing-hakkupatra", "hakkupatra": "housing-hakkupatra",
    "rajiv gandhi vasati yojane": "housing-pmay",
    "absolute sale deed": "housing-sale-deed",
    "ayushman barath arogya karnataka health card abark": "ayushman-bharat",
    "ayushman bharat health account abha": "ayushman-bharat",
    "scholarship ssp pre-matriculation 2025": "scholarship-pre-matric",
    "scholarship ssp pre matriculation 2023": "scholarship-pre-matric", "scholarship ssp pre matriculation 2024": "scholarship-pre-matric",
    "scholarship ssp post-matriculation 2025": "scholarship-post-matric",
    "scholarship ssp post-matriculation 2023": "scholarship-post-matric", "scholarship ssp post-matriculation 2024": "scholarship-post-matric",
    "fee reimbursement": "scholarship-post-matric",
    "azim premji scholarship": "scholarship-minority", "prize money scholarship": "scholarship-minority", "sponsorship scheme": "scholarship-minority",
    "pradhan mantri matru vandana yojana (pmmvy)": "pm-matru-vandana",
    "sukanya samriddhi yojana (ssy)": "sukanya",
  };
  if (key in exact) return exact[key];
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
  return null;
}

// ── confirmed mappings ────────────────────────────────────────────────────
// assessmentId → slum_id(s) to aggregate
const MAPPINGS = [
  // Single slum_id matches
  { assessmentId: "cmo0e5aaq0004rivcx8fazzkf", slumIds: [144],         label: "Ambedkar Nagar (Ullalu)" },
  { assessmentId: "cmo0e5ala0006rivcnt8hl5qp", slumIds: [187],         label: "Ambedkar Nagar (Yeshwantpur)" },
  { assessmentId: "cmo0e575l0001rivcapvwhfyo", slumIds: [33],           label: "AK Colony (JJR Nagar)" },
  // Ahammed Nagar — 4 slum_ids combined into one assessment
  { assessmentId: "cmo0e5d08000irivc0v48buwl", slumIds: [95, 341, 342, 343], label: "Ahammed Nagar (CRC proposed)" },
];

// Other high-confidence matches found earlier — need assessment IDs
// Will resolve these by settlement name lookup below
const NAME_MAPPINGS = [
  { settlement: "7th & 8th Mn Rd Padarayanapura", slumIds: [22] },
  { settlement: "Ambedkar nagar II",               slumIds: [359] },
  { settlement: "Mariyannapalya",                  slumIds: [208] },
  { settlement: "New Colony II (Venkatappa layout)", slumIds: [369] },
  { settlement: "RNS collage compound - Floating population", slumIds: [282] },
  { settlement: "Vinayaka Nagar",                  slumIds: [27] },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Resolve name-based mappings to assessment IDs
for (const m of NAME_MAPPINGS) {
  const { rows } = await pool.query(`
    SELECT sa.id FROM "SettlementAssessment" sa
    JOIN "Settlement" s ON s.id = sa."settlementId"
    JOIN "Cluster" cl ON cl.id = s."clusterId"
    JOIN "Zone" z ON z.id = cl."zoneId"
    JOIN "City" c ON c.id = z."cityId"
    LEFT JOIN "EntitlementBaseline" b ON b."assessmentId" = sa.id
    WHERE c.name = 'Bangalore' AND s.name = $1
    GROUP BY sa.id HAVING COUNT(b.id) = 0
  `, [m.settlement]);
  if (rows.length === 1) {
    MAPPINGS.push({ assessmentId: rows[0].id, slumIds: m.slumIds, label: m.settlement });
  } else if (rows.length === 0) {
    console.log(`⚠ No unmatched assessment for: ${m.settlement}`);
  } else {
    console.log(`⚠ Multiple unmatched assessments for: ${m.settlement} (${rows.length}) — skipping`);
  }
}

console.log(`\nProcessing ${MAPPINGS.length} mappings...`);

const token = await loginJanadhikara();
const items = await fetchSchemeReport(token);

let inserted = 0, updated = 0;

for (const { assessmentId, slumIds, label } of MAPPINGS) {
  // Aggregate rows across all slumIds for this assessment
  const relevant = items.filter(r => slumIds.includes(r.slum_id));

  // Group by scheme
  const byScheme = new Map();
  for (const row of relevant) {
    const schemeId = mapScheme(row.Scheme_Name);
    if (!schemeId) continue;
    const entry = byScheme.get(schemeId) ?? { eligible: 0, enrolled: 0 };
    entry.eligible += 1;
    if ((row.Approved ?? 0) > 0 || (row.Benefit ?? 0) > 0) entry.enrolled += 1;
    byScheme.set(schemeId, entry);
  }

  let schemeCount = 0;
  for (const [schemeId, { eligible, enrolled }] of byScheme) {
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
      const id = `jd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await pool.query(
        `INSERT INTO "EntitlementBaseline" (id, "assessmentId", "schemeId", "eligibleHouseholds", "enrolledHouseholds") VALUES ($1, $2, $3, $4, $5)`,
        [id, assessmentId, schemeId, eligible, enrolled]
      );
      inserted++;
    }
    schemeCount++;
  }
  console.log(`  ✓ ${label}: ${schemeCount} schemes (slum_ids: ${slumIds.join(', ')})`);
}

console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}`);

// Updated coverage
const { rows: coverage } = await pool.query(`
  SELECT c.name as city,
    COUNT(DISTINCT sa.id) as assessed,
    COUNT(DISTINCT CASE WHEN b.id IS NOT NULL THEN sa.id END) as with_entitlements
  FROM "SettlementAssessment" sa
  JOIN "Settlement" s ON s.id = sa."settlementId"
  JOIN "Cluster" cl ON cl.id = s."clusterId"
  JOIN "Zone" z ON z.id = cl."zoneId"
  JOIN "City" c ON c.id = z."cityId"
  LEFT JOIN "EntitlementBaseline" b ON b."assessmentId" = sa.id
  WHERE c.name = 'Bangalore'
  GROUP BY c.id, c.name
`);
coverage.forEach(r => {
  const missing = r.assessed - r.with_entitlements;
  console.log(`\nBangalore: ${r.with_entitlements}/${r.assessed} assessments have entitlement data (${missing} still missing)`);
});

await pool.end();
