/**
 * Scrape Janadhikara settlement survey data from the Reports API.
 *
 * Usage:
 *   node scripts/scrape-janadhikara.mjs <TOKEN>
 *
 * Get a fresh token:
 *   1. Log in to https://janadhikara.org
 *   2. Open DevTools → Network → filter XHR
 *   3. Reload or navigate to the Reports page
 *   4. Find any request to /backend/api/Reports
 *   5. Copy the "token" query parameter value
 *
 * Output:
 *   scripts/out/janadhikara-settlements.json   — raw records
 *   scripts/out/janadhikara-settlements.csv    — spreadsheet-ready
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Usage: node scripts/scrape-janadhikara.mjs <TOKEN>");
  console.error("Example: node scripts/scrape-janadhikara.mjs eyJ0eXAiOiJKV1Qi...");
  process.exit(1);
}

const BASE = "https://janadhikara.org/backend/api";

const HEADERS = {
  "accept": "application/json, text/plain, */*",
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
  "referer": "https://janadhikara.org/",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
};

async function fetchReports(params = {}) {
  const url = new URL(`${BASE}/Reports`);
  url.searchParams.set("token", TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    if (res.status === 401) {
      console.error("Token expired. Get a fresh token from DevTools and try again.");
      process.exit(1);
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const data = await res.json();
  return data.items ?? data ?? [];
}

function toCSV(records) {
  if (!records.length) return "";

  const FIELDS = [
    "slum_id", "slum_name", "ward_name", "zone_name", "partner_name",
    "total_hh_survey", "hhs_completed",
    "male", "female", "adult", "children", "elder",
    "pms", "pwd", "death_reported",
  ];

  const header = FIELDS.join(",");
  const rows = records.map(r =>
    FIELDS.map(f => {
      const v = r[f] ?? "";
      // Quote strings containing commas or quotes
      return typeof v === "string" && (v.includes(",") || v.includes('"'))
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(",")
  );
  return [header, ...rows].join("\n");
}

async function main() {
  console.log("Fetching all settlements...");

  const all = await fetchReports();
  console.log(`Got ${all.length} records`);

  // Summary by partner
  const byPartner = {};
  for (const r of all) {
    const p = r.partner_name ?? "Unknown";
    byPartner[p] = (byPartner[p] ?? 0) + 1;
  }
  console.log("\nBreakdown by partner:");
  for (const [partner, count] of Object.entries(byPartner).sort()) {
    console.log(`  ${partner.padEnd(20)} ${count}`);
  }

  // Summary by zone
  const byZone = {};
  for (const r of all) {
    const z = r.zone_name ?? "Unknown";
    byZone[z] = (byZone[z] ?? 0) + 1;
  }
  console.log("\nBreakdown by zone:");
  for (const [zone, count] of Object.entries(byZone).sort()) {
    console.log(`  ${zone.padEnd(20)} ${count}`);
  }

  // Totals
  const totals = all.reduce((acc, r) => ({
    total_hh_survey: acc.total_hh_survey + (r.total_hh_survey ?? 0),
    hhs_completed:   acc.hhs_completed   + (r.hhs_completed   ?? 0),
    male:            acc.male            + (r.male            ?? 0),
    female:          acc.female          + (r.female          ?? 0),
    adult:           acc.adult           + (r.adult           ?? 0),
    children:        acc.children        + (r.children        ?? 0),
    elder:           acc.elder           + (r.elder           ?? 0),
    pms:             acc.pms             + (r.pms             ?? 0),
    pwd:             acc.pwd             + (r.pwd             ?? 0),
    death_reported:  acc.death_reported  + (r.death_reported  ?? 0),
  }), { total_hh_survey:0, hhs_completed:0, male:0, female:0, adult:0, children:0, elder:0, pms:0, pwd:0, death_reported:0 });

  console.log("\nCity-wide totals:");
  console.log(`  Settlements surveyed: ${all.length}`);
  console.log(`  Total HH surveyed:    ${totals.total_hh_survey}`);
  console.log(`  HH surveys completed: ${totals.hhs_completed}`);
  console.log(`  Total population:     ${totals.male + totals.female}`);
  console.log(`    Male:               ${totals.male}`);
  console.log(`    Female:             ${totals.female}`);
  console.log(`    Adults:             ${totals.adult}`);
  console.log(`    Children:           ${totals.children}`);
  console.log(`    Elderly:            ${totals.elder}`);
  console.log(`    PMS:                ${totals.pms}`);
  console.log(`    PWD:                ${totals.pwd}`);
  console.log(`  Deaths reported:      ${totals.death_reported}`);

  // Write output
  mkdirSync(OUT_DIR, { recursive: true });

  const jsonPath = join(OUT_DIR, "janadhikara-settlements.json");
  const csvPath  = join(OUT_DIR, "janadhikara-settlements.csv");

  writeFileSync(jsonPath, JSON.stringify(all, null, 2));
  writeFileSync(csvPath,  toCSV(all));

  console.log(`\nSaved:`);
  console.log(`  JSON → ${jsonPath}`);
  console.log(`  CSV  → ${csvPath}`);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
