// Idempotent patch: add capacity-driven economics to the RO water finance model.
//   A — capacity-capped revenue: served = min(demand, plant throughput ceiling).
//       Under-size the plant/hours and revenue/OSS/break-even now fall.
//   B — capex scales with capacity: RO plant & tanks derived from plant_lph /
//       tank_litres via per-unit rates (were flat inputs).
//   C — opex scales with capacity: membrane cost ∝ plant_lph; AMC ∝ capex_total.
//
// Near-neutral at default values (the per-unit rates reproduce the old flat
// numbers at plant_lph=1000 / tank=2000; capacity only binds when demand exceeds
// throughput). Does NOT touch instances. Safe to re-run.
//
//   npx tsx scripts/patch-model-ro-capacity.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const SCALAR = { kind: "scalar" };
const VEC_M = { kind: "vector", horizon: "monthly" };
const VEC_Y = { kind: "vector", horizon: "annual" };

// New nodes to upsert (create if missing, else leave existing formula/default alone
// so re-runs are non-destructive to admin edits).
const NEW_NODES: Array<{
  group: string; key: string; label: string; kind: "input" | "formula";
  dataType: string; formula?: string; defaultJson?: number; unit?: string;
  notes?: string; shape?: object; surface?: string; ui?: object; order: number;
}> = [
  // ── B/C per-unit rate inputs ─────────────────────────────────────────────
  { group: "capex_in", key: "capex_ro_plant_per_lph", label: "RO plant cost per L/hour", kind: "input",
    dataType: "currency", defaultJson: 600, unit: "INR/LPH", surface: "finance",
    notes: "RO skid+membranes+UV per litre/hour of capacity. ×1000 LPH = ₹6L base.", order: 300 },
  { group: "capex_in", key: "capex_tanks_per_litre", label: "Storage tank cost per litre", kind: "input",
    dataType: "currency", defaultJson: 40, unit: "INR/L", surface: "finance",
    notes: "Raw+product tank cost per litre of product-tank size.", order: 301 },
  { group: "opex_in", key: "membrane_cost_per_lph_year", label: "Membrane replacement per L/hour / year", kind: "input",
    dataType: "currency", defaultJson: 30, unit: "INR/LPH/yr",
    notes: "Membrane set scales with plant capacity. ×1000 LPH = ₹30k/yr base.", order: 302 },
  { group: "opex_in", key: "amc_pct_annual", label: "AMC / maintenance (% of capex per year)", kind: "input",
    dataType: "percent", defaultJson: 0.0109, unit: "%",
    notes: "Annual maintenance reserve as a share of total capex (scales with plant size).", order: 303 },

  // ── A capacity + served nodes ────────────────────────────────────────────
  { group: "plant", key: "capacity_litres_per_month", label: "Plant throughput ceiling / month", kind: "formula",
    dataType: "number", formula: "plant_lph * operating_hours_per_day * days_per_month", unit: "L/mo",
    notes: "Most the plant can physically produce in a month.", order: 304 },
  { group: "pnl", key: "capacity_litres_per_year", label: "Plant throughput ceiling / year", kind: "formula",
    dataType: "number", formula: "plant_lph * operating_hours_per_day * 365", unit: "L/yr", order: 305 },
  { group: "revenue", key: "served_litres_per_month", label: "Litres served (capacity-capped)", kind: "formula",
    dataType: "number", shape: VEC_M,
    formula: "IF(litres_per_month < capacity_litres_per_month, litres_per_month, capacity_litres_per_month)",
    unit: "L/mo", notes: "Demand, capped at what the plant can produce.", order: 306 },
  { group: "pnl", key: "served_litres_annual", label: "Litres served / year (capped)", kind: "formula",
    dataType: "number", shape: VEC_Y,
    formula: "IF(litres_annual < capacity_litres_per_year, litres_annual, capacity_litres_per_year)",
    unit: "L/yr", order: 307 },
  { group: "opex", key: "served_steady_litres_per_month", label: "Steady litres served (capped)", kind: "formula",
    dataType: "number",
    formula: "IF(steady_litres_per_month < capacity_litres_per_month, steady_litres_per_month, capacity_litres_per_month)",
    unit: "L/mo", order: 308 },
  { group: "opex", key: "capacity_utilisation_steady", label: "Demand met at steady state", kind: "formula",
    dataType: "percent",
    formula: "IFERROR(served_steady_litres_per_month / steady_litres_per_month, 0)", unit: "%",
    notes: "Share of steady-state demand the plant can actually serve (100% = enough capacity).", order: 309 },
];

// Formula/kind rewrites on existing nodes.
const REWRITES: Record<string, { formula: string; kind?: "formula" }> = {
  // B — capex derived from capacity
  capex_ro_plant: { formula: "plant_lph * capex_ro_plant_per_lph", kind: "formula" },
  capex_tanks: { formula: "tank_litres * capex_tanks_per_litre", kind: "formula" },
  // C — opex scales with capacity
  membrane_annual_cost: { formula: "plant_lph * membrane_cost_per_lph_year", kind: "formula" },
  amc_monthly: { formula: "capex_total * amc_pct_annual / 12", kind: "formula" },
  // A — revenue & volume-opex repointed from demand → served
  revenue_monthly: { formula: "served_litres_per_month * effective_price_per_litre" },
  opex_var_monthly: {
    formula:
      "served_litres_per_month / 1000 * electricity_kwh_per_1000l * electricity_rate" +
      " + served_litres_per_month / ro_recovery_rate / 1000 * water_source_cost_per_1000l" +
      " + IF(served_steady_litres_per_month > 0, served_litres_per_month * membrane_annual_cost / 12 / served_steady_litres_per_month, 0)",
  },
  revenue_annual: { formula: "served_litres_annual * price_annual" },
  opex_annual_electricity: { formula: "served_litres_annual / 1000 * electricity_kwh_per_1000l * electricity_rate * (1 + cost_inflation) ^ T" },
  opex_annual_source_water: { formula: "served_litres_annual / ro_recovery_rate / 1000 * water_source_cost_per_1000l * (1 + cost_inflation) ^ T" },
  opex_steady_electricity: { formula: "served_steady_litres_per_month / 1000 * electricity_kwh_per_1000l * electricity_rate" },
  opex_steady_source_water: { formula: "served_steady_litres_per_month / ro_recovery_rate / 1000 * water_source_cost_per_1000l" },
  opex_per_litre: { formula: "opex_monthly_steady / served_steady_litres_per_month" },
  capex_per_litre_5yr: { formula: "capex_total / (5 * served_steady_litres_per_month * 12)" },
};

async function main() {
  const t = await prisma.modelTemplate.findFirst({
    where: { key: "ro_water" }, include: { groups: true, nodes: true },
  });
  if (!t) throw new Error("ro_water template not found");
  const gid = Object.fromEntries(t.groups.map(g => [g.key, g.id]));
  const existing = new Set(t.nodes.map(n => n.key));

  let created = 0, updated = 0;
  for (const n of NEW_NODES) {
    if (existing.has(n.key)) { console.log(`  · exists, skip create: ${n.key}`); continue; }
    await prisma.modelNode.create({
      data: {
        templateId: t.id, groupId: gid[n.group] ?? null, key: n.key, label: n.label,
        kind: n.kind, dataType: n.dataType, formula: n.formula ?? null,
        defaultJson: n.defaultJson ?? undefined, unit: n.unit ?? null, notes: n.notes ?? null,
        shape: n.shape ?? SCALAR, surface: n.surface ?? "both", uiJson: n.ui ?? undefined, order: n.order,
      },
    });
    created++; console.log(`  + created ${n.key}`);
  }
  // KPI so Leadership can see the capacity bind.
  const outKey = "kpi_demand_met";
  const haveOut = await prisma.modelOutput.findFirst({ where: { templateId: t.id, key: outKey } });
  if (!haveOut) {
    await prisma.modelOutput.create({
      data: { templateId: t.id, key: outKey, label: "Demand met", kind: "kpi", order: 8,
        config: { nodeKey: "capacity_utilisation_steady", format: "percent" } },
    });
    console.log(`  + created output ${outKey}`);
  } else console.log(`  · output exists: ${outKey}`);

  for (const [key, rw] of Object.entries(REWRITES)) {
    const node = t.nodes.find(x => x.key === key);
    if (!node) { console.log(`  ! rewrite target missing: ${key}`); continue; }
    await prisma.modelNode.update({
      where: { id: node.id },
      data: { formula: rw.formula, ...(rw.kind ? { kind: rw.kind, defaultJson: Prisma.DbNull } : {}) },
    });
    updated++; console.log(`  ~ rewrote ${key}${rw.kind ? " (input→formula)" : ""}`);
  }
  console.log(`\nDone: ${created} created, ${updated} rewritten.`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
