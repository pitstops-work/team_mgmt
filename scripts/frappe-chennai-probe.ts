/**
 * Probe Frappe Chennai for any doctype that exposes individual age data.
 * Tries common doctype names; for each successful one, prints a sample row
 * and the available fields.
 */

const BASE = (process.env.FRAPPE_CHENNAI_URL ?? "https://chennai.dignifiedlife.in").trim();
const KEY = (process.env.FRAPPE_CHENNAI_KEY ?? "").trim();
const SECRET = (process.env.FRAPPE_CHENNAI_SECRET ?? "").trim();

if (!KEY || !SECRET) {
  console.error("FRAPPE_CHENNAI_KEY / FRAPPE_CHENNAI_SECRET not set");
  process.exit(1);
}

async function fetchFrappe(path: string): Promise<unknown> {
  const r = await fetch(`${BASE}/api${path}`, {
    headers: { Authorization: `token ${KEY}:${SECRET}`, Connection: "close" },
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { _rawText: text.slice(0, 500), _status: r.status }; }
}

async function main() {
  // 1. List all DocType names available to this API user.
  console.log("=== Listing all doctypes (first 200) ===");
  const dts = await fetchFrappe("/resource/DocType?limit=200&fields=%5B%22name%22%5D");
  const dtNames = ((dts as { data?: { name: string }[] }).data ?? []).map((d) => d.name);
  console.log(`Got ${dtNames.length} doctypes.`);
  for (const n of dtNames) console.log(`  • ${n}`);

  // 2. Try a few likely candidates and dump first row + field keys.
  const candidates = [
    "Household Member",
    "Household Member-WRP",
    "Member",
    "Person",
    "Person Profile",
    "Family Member",
    "Beneficiary",
    "Resident",
    "Household Profile-WRP",
  ];
  for (const dt of candidates) {
    console.log(`\n=== ${dt} ===`);
    const enc = encodeURIComponent(dt);
    const sample = await fetchFrappe(`/resource/${enc}?limit=1&fields=%5B%22*%22%5D`);
    const rows = (sample as { data?: Record<string, unknown>[] }).data;
    if (!rows || rows.length === 0) {
      console.log(`  (no rows or unavailable)`);
      console.log(`  raw:`, JSON.stringify(sample).slice(0, 300));
      continue;
    }
    const r = rows[0];
    const keys = Object.keys(r);
    const ageish = keys.filter((k) => /age|dob|birth|year|elderly|senior|adult/i.test(k));
    console.log(`  ${keys.length} fields; age-related: ${ageish.join(", ") || "(none)"}`);
    console.log(`  sample row keys:`, keys.slice(0, 30).join(", "));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
