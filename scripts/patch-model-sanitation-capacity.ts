// Idempotent patch: capacity-driven economics for the SANITATION COMPLEX finance
// model (mirrors scripts/patch-model-ro-capacity.ts).
//   A — capacity-capped revenue: each service's revenue × served-fraction
//       = min(1, capacity/demand). capacity = units × throughput × hours.
//   B — capex scales: washing machines / RO / STP / biodigester derived from
//       their capacity units via per-unit rates (were flat inputs).
//   C — opex scales: usage-opex (consumables, water, electricity) runs off
//       served (capped) throughput; AMC ∝ capex_total.
// Near-neutral at defaults (per-unit rates reproduce old flat capex/amc; fractions
// = 1 while demand < capacity). Never touches instances. Safe to re-run.
//   npx tsx scripts/patch-model-sanitation-capacity.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const SCALAR = { kind: "scalar" };
const VEC_M = { kind: "vector", horizon: "monthly" };
const VEC_Y = { kind: "vector", horizon: "annual" };

const NEW_NODES: Array<any> = [
  // ── B/C per-unit rate inputs ─────────────────────────────────────────────
  { group: "capex_in", key: "capex_per_washing_machine", label: "Capex per washing machine", kind: "input", dataType: "currency", defaultJson: 48000, unit: "INR/machine", surface: "finance", order: 400 },
  { group: "capex_in", key: "capex_per_ro_lph", label: "RO plant capex per L/hour", kind: "input", dataType: "currency", defaultJson: 650, unit: "INR/LPH", surface: "finance", order: 401 },
  { group: "capex_in", key: "capex_per_stp_kld", label: "STP capex per KL/day", kind: "input", dataType: "currency", defaultJson: 48214.29, unit: "INR/KLD", surface: "finance", order: 402 },
  { group: "capex_in", key: "capex_per_wc_seat_bio", label: "Biodigester capex per WC seat", kind: "input", dataType: "currency", defaultJson: 11153.85, unit: "INR/seat", surface: "finance", order: 403 },
  { group: "opex_in", key: "amc_pct_annual", label: "AMC / maintenance (% of capex per year)", kind: "input", dataType: "percent", defaultJson: 0.0025, unit: "%", notes: "Annual maintenance reserve as a share of total capex (scales with facility size).", order: 404 },

  // ── A capacity ceilings (uses/loads/litres per day) ──────────────────────
  { group: "capacity", key: "cap_toilet_uses_day", label: "Toilet capacity / day", kind: "formula", dataType: "number", formula: "wc_seats * seat_throughput * facility_open_hours", unit: "uses/day", order: 405 },
  { group: "capacity", key: "cap_bath_uses_day", label: "Bath capacity / day", kind: "formula", dataType: "number", formula: "bath_cubicles * bath_throughput * facility_open_hours", unit: "baths/day", order: 406 },
  { group: "capacity", key: "cap_laundry_loads_day", label: "Laundry capacity / day", kind: "formula", dataType: "number", formula: "washing_machines * machine_throughput * facility_open_hours", unit: "loads/day", order: 407 },
  { group: "capacity", key: "cap_ro_litres_day", label: "RO capacity / day", kind: "formula", dataType: "number", formula: "ro_lph * ro_operating_hours", unit: "L/day", order: 408 },

  // ── A served steady daily (capped) — feed opex/water ─────────────────────
  { group: "opex", key: "served_toilet_uses_per_day_steady", label: "Toilet uses/day served (capped)", kind: "formula", dataType: "number", formula: "IF(toilet_uses_per_day_steady < cap_toilet_uses_day, toilet_uses_per_day_steady, cap_toilet_uses_day)", unit: "uses/day", order: 409 },
  { group: "opex", key: "served_bath_uses_per_day_steady", label: "Baths/day served (capped)", kind: "formula", dataType: "number", formula: "IF(bath_uses_per_day_steady < cap_bath_uses_day, bath_uses_per_day_steady, cap_bath_uses_day)", unit: "baths/day", order: 410 },
  { group: "opex", key: "served_laundry_loads_per_day_steady", label: "Loads/day served (capped)", kind: "formula", dataType: "number", formula: "IF(laundry_loads_per_day_steady < cap_laundry_loads_day, laundry_loads_per_day_steady, cap_laundry_loads_day)", unit: "loads/day", order: 411 },
  { group: "opex", key: "served_ro_litres_per_day_steady", label: "RO litres/day served (capped)", kind: "formula", dataType: "number", formula: "IF(ro_litres_per_day_steady < cap_ro_litres_day, ro_litres_per_day_steady, cap_ro_litres_day)", unit: "L/day", order: 412 },
  { group: "opex", key: "capacity_utilisation_steady", label: "Capacity headroom (tightest service)", kind: "formula", dataType: "percent",
    formula: "MIN(IFERROR(served_toilet_uses_per_day_steady / toilet_uses_per_day_steady, 1), IFERROR(served_bath_uses_per_day_steady / bath_uses_per_day_steady, 1), IFERROR(served_laundry_loads_per_day_steady / laundry_loads_per_day_steady, 1), IFERROR(served_ro_litres_per_day_steady / ro_litres_per_day_steady, 1))",
    unit: "%", notes: "Share of steady demand the tightest-constrained service can serve (100% = enough capacity everywhere).", order: 413 },

  // ── A served fractions — monthly (revenue multipliers) ───────────────────
  { group: "revenue", key: "served_frac_toilet_monthly", label: "Toilet served fraction (monthly)", kind: "formula", dataType: "percent", shape: VEC_M, formula: "IF(active_persons_monthly * toilet_uses_per_person_per_day <= cap_toilet_uses_day, 1, cap_toilet_uses_day / (active_persons_monthly * toilet_uses_per_person_per_day))", unit: "%", order: 414 },
  { group: "revenue", key: "served_frac_bath_monthly", label: "Bath served fraction (monthly)", kind: "formula", dataType: "percent", shape: VEC_M, formula: "IF(active_persons_monthly * bath_share <= cap_bath_uses_day, 1, cap_bath_uses_day / (active_persons_monthly * bath_share))", unit: "%", order: 415 },
  { group: "revenue", key: "served_frac_laundry_monthly", label: "Laundry served fraction (monthly)", kind: "formula", dataType: "percent", shape: VEC_M, formula: "IF(active_hh_monthly * laundry_loads_per_active_hh_per_week / 7 <= cap_laundry_loads_day, 1, cap_laundry_loads_day / (active_hh_monthly * laundry_loads_per_active_hh_per_week / 7))", unit: "%", order: 416 },
  { group: "revenue", key: "served_frac_ro_monthly", label: "RO served fraction (monthly)", kind: "formula", dataType: "percent", shape: VEC_M, formula: "IF(active_hh_monthly * ro_litres_per_active_hh_per_day <= cap_ro_litres_day, 1, cap_ro_litres_day / (active_hh_monthly * ro_litres_per_active_hh_per_day))", unit: "%", order: 417 },

  // ── A served fractions — annual ──────────────────────────────────────────
  { group: "pnl", key: "served_frac_toilet_annual", label: "Toilet served fraction (annual)", kind: "formula", dataType: "percent", shape: VEC_Y, formula: "IF(active_persons_annual * toilet_uses_per_person_per_day <= cap_toilet_uses_day, 1, cap_toilet_uses_day / (active_persons_annual * toilet_uses_per_person_per_day))", unit: "%", order: 418 },
  { group: "pnl", key: "served_frac_bath_annual", label: "Bath served fraction (annual)", kind: "formula", dataType: "percent", shape: VEC_Y, formula: "IF(active_persons_annual * bath_share <= cap_bath_uses_day, 1, cap_bath_uses_day / (active_persons_annual * bath_share))", unit: "%", order: 419 },
  { group: "pnl", key: "served_frac_laundry_annual", label: "Laundry served fraction (annual)", kind: "formula", dataType: "percent", shape: VEC_Y, formula: "IF(active_hh_annual * laundry_loads_per_active_hh_per_week / 7 <= cap_laundry_loads_day, 1, cap_laundry_loads_day / (active_hh_annual * laundry_loads_per_active_hh_per_week / 7))", unit: "%", order: 420 },
  { group: "pnl", key: "served_frac_ro_annual", label: "RO served fraction (annual)", kind: "formula", dataType: "percent", shape: VEC_Y, formula: "IF(active_hh_annual * ro_litres_per_active_hh_per_day <= cap_ro_litres_day, 1, cap_ro_litres_day / (active_hh_annual * ro_litres_per_active_hh_per_day))", unit: "%", order: 421 },
];

const REWRITES: Record<string, { formula: string; kind?: "formula" }> = {
  // B — capex derived from capacity
  capex_washing_machines: { formula: "washing_machines * capex_per_washing_machine", kind: "formula" },
  capex_ro: { formula: "ro_lph * capex_per_ro_lph", kind: "formula" },
  capex_stp: { formula: "stp_kld * capex_per_stp_kld", kind: "formula" },
  capex_biodigester: { formula: "wc_seats * capex_per_wc_seat_bio", kind: "formula" },
  // C — AMC scales with capex
  amc_monthly: { formula: "capex_total * amc_pct_annual / 12", kind: "formula" },
  // laundry ceiling on the sim's throughput basis (machine_throughput × hours),
  // consistent with toilet/bath — re-applied so a prior run's value is corrected.
  cap_laundry_loads_day: { formula: "washing_machines * machine_throughput * facility_open_hours" },
  // A — revenue × served fraction (monthly)
  rev_toilet_monthly: { formula: "active_persons_monthly * toilet_uses_per_person_per_day * 28 * price_toilet * (1 - free_use_quota) * (1 - pass_holder_share) * pilot_pay_factor * served_frac_toilet_monthly" },
  rev_bath_monthly: { formula: "active_persons_monthly * bath_share * 28 * price_bath * (1 - free_use_quota) * (1 - pass_holder_share) * pilot_pay_factor * served_frac_bath_monthly" },
  rev_laundry_monthly: { formula: "active_hh_monthly * (laundry_loads_per_active_hh_per_week / 7) * 28 * price_laundry * (1 - pass_holder_share) * pilot_pay_factor * served_frac_laundry_monthly" },
  rev_ro_monthly: { formula: "active_hh_monthly * ro_litres_per_active_hh_per_day * 28 * price_ro_per_litre * pilot_pay_factor * served_frac_ro_monthly" },
  // A — revenue × served fraction (annual; Y1 sums the already-capped monthly)
  rev_toilet_annual: { formula: "IF(T == 0, SUM(rev_toilet_monthly, 0, 12), active_persons_annual * toilet_uses_per_person_per_day * 365 * price_toilet * (1 - free_use_quota) * (1 - pass_holder_share) * (1 + price_increase) ^ T * served_frac_toilet_annual)" },
  rev_bath_annual: { formula: "IF(T == 0, SUM(rev_bath_monthly, 0, 12), active_persons_annual * bath_share * 365 * price_bath * (1 - free_use_quota) * (1 - pass_holder_share) * (1 + price_increase) ^ T * served_frac_bath_annual)" },
  rev_laundry_annual: { formula: "IF(T == 0, SUM(rev_laundry_monthly, 0, 12), active_hh_annual * (laundry_loads_per_active_hh_per_week / 7) * 365 * price_laundry * (1 - pass_holder_share) * (1 + price_increase) ^ T * served_frac_laundry_annual)" },
  rev_ro_annual: { formula: "IF(T == 0, SUM(rev_ro_monthly, 0, 12), active_hh_annual * ro_litres_per_active_hh_per_day * 365 * price_ro_per_litre * (1 + price_increase) ^ T * served_frac_ro_annual)" },
  // A/C — opex + water balance run off served (capped) throughput
  bath_water_l_day: { formula: "served_bath_uses_per_day_steady * 25" },
  laundry_water_l_day: { formula: "served_laundry_loads_per_day_steady * 55" },
  handwash_water_l_day: { formula: "served_toilet_uses_per_day_steady * 1.5" },
  ro_feed_l_day: { formula: "served_ro_litres_per_day_steady / ro_recovery_rate" },
  ro_reject_l_day: { formula: "ro_feed_l_day - served_ro_litres_per_day_steady" },
  recycle_demand_l_day: { formula: "served_toilet_uses_per_day_steady * 5 + 150 + wc_seats * 8 + bath_cubicles * 12 + washing_machines * 5" },
  electricity_ro_kwh_per_day: { formula: "served_ro_litres_per_day_steady * kwh_per_ro_litre" },
  electricity_laundry_kwh_per_day: { formula: "served_laundry_loads_per_day_steady * kwh_per_laundry_load" },
  electricity_bath_heating_kwh_per_day: { formula: "served_bath_uses_per_day_steady * kwh_per_bath_heating" },
  cleaning_consumables_monthly: { formula: "(served_toilet_uses_per_day_steady + served_bath_uses_per_day_steady) * cleaning_inr_per_visit * 30" },
  laundry_detergent_monthly: { formula: "served_laundry_loads_per_day_steady * detergent_inr_per_load * 30" },
  ro_consumables_monthly: { formula: "served_ro_litres_per_day_steady / 1000 * 30 * ro_consumables_inr_per_kl" },
  desludging_monthly_amortised: { formula: "served_toilet_uses_per_day_steady / 1000 * 30 * desludging_inr_per_1000_uses" },
};

const OUTPUTS = [
  { key: "kpi_demand_met", label: "Demand met", kind: "kpi", order: 8, config: { nodeKey: "capacity_utilisation_steady", format: "percent" } },
];

async function main() {
  const t = await prisma.modelTemplate.findFirst({ where: { key: "sanitation_complex" }, include: { groups: true, nodes: true } });
  if (!t) throw new Error("sanitation_complex template not found");
  const gid = Object.fromEntries(t.groups.map(g => [g.key, g.id]));
  const existing = new Set(t.nodes.map(n => n.key));

  let created = 0, updated = 0;
  for (const n of NEW_NODES) {
    if (existing.has(n.key)) { console.log(`  · skip create: ${n.key}`); continue; }
    if (!gid[n.group]) throw new Error(`group not found: ${n.group}`);
    await prisma.modelNode.create({ data: {
      templateId: t.id, groupId: gid[n.group], key: n.key, label: n.label, kind: n.kind,
      dataType: n.dataType, formula: n.formula ?? null, defaultJson: n.defaultJson ?? undefined,
      unit: n.unit ?? null, notes: n.notes ?? null, shape: n.shape ?? SCALAR,
      surface: n.surface ?? "both", uiJson: n.ui ?? undefined, order: n.order,
    } });
    created++; console.log(`  + ${n.key}`);
  }
  for (const o of OUTPUTS) {
    const have = await prisma.modelOutput.findFirst({ where: { templateId: t.id, key: o.key } });
    if (have) { console.log(`  · output exists: ${o.key}`); continue; }
    await prisma.modelOutput.create({ data: { templateId: t.id, key: o.key, label: o.label, kind: o.kind, order: o.order, config: o.config } });
    console.log(`  + output ${o.key}`);
  }
  for (const [key, rw] of Object.entries(REWRITES)) {
    const node = t.nodes.find(x => x.key === key);
    if (!node) { console.log(`  ! rewrite target missing: ${key}`); continue; }
    await prisma.modelNode.update({ where: { id: node.id }, data: { formula: rw.formula, ...(rw.kind ? { kind: rw.kind, defaultJson: Prisma.DbNull } : {}) } });
    updated++; console.log(`  ~ ${key}${rw.kind ? " (input→formula)" : ""}`);
  }
  console.log(`\nDone: ${created} created, ${updated} rewritten.`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
