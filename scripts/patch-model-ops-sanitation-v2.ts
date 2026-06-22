// V2 patch: auto-scale variable opex from capacity × usage × per-unit rates,
// add explicit staff-count knobs (6 roles), parameterise laundry demand, and
// allocate monthly-pass revenue into per-service margin (telemetry-only).
//
// Idempotent — safe to re-run. Never drops the template (which would cascade-
// delete its instances). The seed file carries the same data for fresh seeds.
//
// Run:  npx tsx scripts/patch-model-ops-sanitation-v2.ts

import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEMPLATE_KEY = "sanitation_complex";

async function main() {
  const tpl = await prisma.modelTemplate.findUnique({
    where: { key: TEMPLATE_KEY },
    include: { groups: true, nodes: { select: { key: true, kind: true, groupId: true } } },
  });
  if (!tpl) throw new Error(`Template ${TEMPLATE_KEY} not found — run the seed first.`);

  const groupId = (key: string) => {
    const g = tpl.groups.find(x => x.key === key);
    if (!g) throw new Error(`group '${key}' missing`);
    return g.id;
  };
  const opexInId = groupId("opex_in");
  const opexId = groupId("opex");
  const usageId = groupId("usage");

  // ── 1. New inputs (upsert by key) ──────────────────────────────────────────
  type NewIn = {
    key: string; label: string; groupId: string; dataType: string; defaultJson: number;
    unit: string; notes?: string; ui?: { min: number; max: number; step: number };
    surface?: string; order: number;
  };
  const newInputs: NewIn[] = [
    // Laundry demand parameter (usage group)
    { key: "laundry_loads_per_active_hh_per_week", label: "Laundry loads per active HH/week", groupId: usageId, dataType: "number", defaultJson: 2, unit: "loads/HH/wk", ui: { min: 0.5, max: 5, step: 0.5 }, order: 305 },

    // Staff headcount (opex_in)
    { key: "num_caretakers", label: "Caretakers (headcount)", groupId: opexInId, dataType: "int", defaultJson: 3, unit: "people", notes: "Typically one per shift × 3 shifts", ui: { min: 1, max: 9, step: 1 }, order: 700 },
    { key: "num_plant_operators", label: "Plant operators (headcount)", groupId: opexInId, dataType: "int", defaultJson: 1, unit: "people", notes: "RO + STP technician", ui: { min: 0, max: 4, step: 1 }, order: 702 },
    { key: "num_laundry_supervisors", label: "Laundry supervisors (headcount)", groupId: opexInId, dataType: "int", defaultJson: 1, unit: "people", ui: { min: 0, max: 3, step: 1 }, order: 704 },
    { key: "num_security_guards", label: "Security guards (headcount)", groupId: opexInId, dataType: "int", defaultJson: 2, unit: "people", notes: "Day + night cover", ui: { min: 0, max: 6, step: 1 }, order: 706 },
    { key: "salary_security_guard", label: "Security guard salary", groupId: opexInId, dataType: "currency", defaultJson: 10000, unit: "INR/person/mo", order: 707 },
    { key: "num_admin_cashiers", label: "Admin / cashier (headcount)", groupId: opexInId, dataType: "int", defaultJson: 1, unit: "people", notes: "Pass sales, daily reconciliation, MIS", ui: { min: 0, max: 3, step: 1 }, order: 708 },
    { key: "salary_admin_cashier", label: "Admin / cashier salary", groupId: opexInId, dataType: "currency", defaultJson: 12000, unit: "INR/person/mo", order: 709 },
    { key: "num_cbo_reps", label: "CBO management (headcount)", groupId: opexInId, dataType: "int", defaultJson: 1, unit: "people", notes: "Y2+ only", ui: { min: 0, max: 3, step: 1 }, order: 710 },

    // Per-unit variable-opex rates
    { key: "kwh_per_ro_litre", label: "RO electricity intensity", groupId: opexInId, dataType: "number", defaultJson: 0.004, unit: "kWh/L product", notes: "Pump + booster per L of product", ui: { min: 0.001, max: 0.012, step: 0.0005 }, order: 720 },
    { key: "kwh_per_laundry_load", label: "Electricity per laundry load", groupId: opexInId, dataType: "number", defaultJson: 0.7, unit: "kWh/load", ui: { min: 0.3, max: 2, step: 0.1 }, order: 721 },
    { key: "kwh_lighting_per_open_hour", label: "Lighting + small loads", groupId: opexInId, dataType: "number", defaultJson: 1.5, unit: "kWh/open-hour", notes: "Lights, fans, controls", ui: { min: 0.5, max: 6, step: 0.25 }, order: 722 },
    { key: "electricity_tariff", label: "Electricity tariff", groupId: opexInId, dataType: "currency", defaultJson: 9, unit: "INR/kWh", notes: "BESCOM commercial slab average", ui: { min: 5, max: 18, step: 0.5 }, order: 723 },
    { key: "solar_offset_kwh_per_day", label: "Solar offset (avg)", groupId: opexInId, dataType: "number", defaultJson: 22, unit: "kWh/day", notes: "5 kWp ≈ 22 kWh/day net", ui: { min: 0, max: 80, step: 2 }, order: 724 },
    { key: "bwssb_inr_per_kl", label: "BWSSB water tariff", groupId: opexInId, dataType: "currency", defaultJson: 60, unit: "INR/KL", notes: "Commercial slab average", ui: { min: 20, max: 150, step: 5 }, order: 725 },
    { key: "cleaning_inr_per_visit", label: "Cleaning consumable per visit", groupId: opexInId, dataType: "currency", defaultJson: 0.05, unit: "INR/visit", notes: "Toilet + bath visits", ui: { min: 0.01, max: 0.4, step: 0.01 }, order: 726 },
    { key: "detergent_inr_per_load", label: "Detergent + finisher per load", groupId: opexInId, dataType: "currency", defaultJson: 1.4, unit: "INR/load", ui: { min: 0.5, max: 8, step: 0.1 }, order: 727 },
    { key: "ro_consumables_inr_per_kl", label: "RO consumables per KL product", groupId: opexInId, dataType: "currency", defaultJson: 25, unit: "INR/KL", notes: "Membranes, cartridges, antiscalant", ui: { min: 5, max: 80, step: 1 }, order: 728 },
    { key: "stp_consumables_inr_per_kl_treated", label: "STP consumables per KL treated", groupId: opexInId, dataType: "currency", defaultJson: 7, unit: "INR/KL", notes: "Media top-up, blower energy chemicals", ui: { min: 2, max: 25, step: 0.5 }, order: 729 },
    { key: "desludging_inr_per_1000_uses", label: "Desludging per 1000 toilet uses", groupId: opexInId, dataType: "currency", defaultJson: 10, unit: "INR/1000 uses", notes: "Septic pump-out amortised", ui: { min: 2, max: 50, step: 1 }, order: 730 },
  ];

  const existingByKey = new Map(tpl.nodes.map(n => [n.key, n] as const));
  for (const n of newInputs) {
    if (existingByKey.has(n.key)) {
      // Idempotent: keep existing override-friendliness, but make sure default
      // + ui + group are up to date.
      await prisma.modelNode.updateMany({
        where: { templateId: tpl.id, key: n.key },
        data: {
          groupId: n.groupId, label: n.label, kind: "input", dataType: n.dataType,
          shape: { kind: "scalar" } as never, defaultJson: n.defaultJson as never,
          unit: n.unit, notes: n.notes ?? null,
          surface: n.surface ?? "both", tier: "basic",
          uiJson: (n.ui ?? null) as never, order: n.order,
        },
      });
    } else {
      await prisma.modelNode.create({
        data: {
          templateId: tpl.id, groupId: n.groupId, key: n.key, label: n.label, kind: "input",
          dataType: n.dataType, shape: { kind: "scalar" } as never,
          defaultJson: n.defaultJson as never, unit: n.unit, notes: n.notes ?? null,
          surface: n.surface ?? "both", tier: "basic",
          uiJson: (n.ui ?? null) as never, order: n.order,
        },
      });
    }
  }

  // ── 2. Convert existing flat opex inputs → formula nodes ───────────────────
  // electricity/water/consumables/desludging now derive from capacity × usage.
  // Original input values become dead data (Prisma keeps the row's defaultJson
  // but the engine ignores it for formula nodes).
  type FormulaPatch = { key: string; label?: string; groupId: string; formula: string; unit: string; notes?: string; order?: number };
  const formulaPatches: FormulaPatch[] = [
    // Staff totals
    { key: "opex_caretakers", label: "Caretakers (total)", groupId: opexId, formula: "num_caretakers * salary_caretaker_per_shift", unit: "INR/mo", order: 800 },
    { key: "opex_plant_operators_total", label: "Plant operators (total)", groupId: opexId, formula: "num_plant_operators * salary_plant_operator", unit: "INR/mo", order: 801 },
    { key: "opex_laundry_supervisors_total", label: "Laundry supervisors (total)", groupId: opexId, formula: "num_laundry_supervisors * salary_laundry_supervisor", unit: "INR/mo", order: 802 },
    { key: "opex_security_total", label: "Security guards (total)", groupId: opexId, formula: "num_security_guards * salary_security_guard", unit: "INR/mo", order: 803 },
    { key: "opex_admin_cashier_total", label: "Admin / cashier (total)", groupId: opexId, formula: "num_admin_cashiers * salary_admin_cashier", unit: "INR/mo", order: 804 },
    { key: "opex_cbo_total", label: "CBO honorarium (total, Y2+)", groupId: opexId, formula: "num_cbo_reps * salary_cbo_honorarium", unit: "INR/mo", order: 805 },
    { key: "opex_staff_steady", label: "Staff opex (steady, incl. CBO)", groupId: opexId, formula: "opex_caretakers + opex_plant_operators_total + opex_laundry_supervisors_total + opex_security_total + opex_admin_cashier_total + opex_cbo_total", unit: "INR/mo", order: 806 },
    { key: "opex_staff_pre_cbo", label: "Staff opex (pre-CBO, Y1)", groupId: opexId, formula: "opex_caretakers + opex_plant_operators_total + opex_laundry_supervisors_total + opex_security_total + opex_admin_cashier_total", unit: "INR/mo", order: 807 },

    // Steady-state activity
    { key: "active_hh_steady", label: "Active HH (steady)", groupId: opexId, formula: "hh_count * adoption_y3", unit: "HH", order: 810 },
    { key: "active_persons_steady", label: "Active persons (steady)", groupId: opexId, formula: "active_hh_steady * persons_per_hh", unit: "persons", order: 811 },
    { key: "toilet_uses_per_day_steady", label: "Toilet uses/day (steady)", groupId: opexId, formula: "active_persons_steady * toilet_uses_per_person_per_day", unit: "uses/day", order: 812 },
    { key: "bath_uses_per_day_steady", label: "Baths/day (steady)", groupId: opexId, formula: "active_persons_steady * bath_share", unit: "baths/day", order: 813 },
    { key: "laundry_loads_per_day_steady", label: "Loads/day (steady)", groupId: opexId, formula: "active_hh_steady * laundry_loads_per_active_hh_per_week / 7", unit: "loads/day", order: 814 },
    { key: "ro_litres_per_day_steady", label: "RO litres/day (steady)", groupId: opexId, formula: "active_hh_steady * ro_litres_per_active_hh_per_day", unit: "L/day", order: 815 },

    // Water balance at steady state
    { key: "bath_water_l_day", label: "Bath water (L/day)", groupId: opexId, formula: "bath_uses_per_day_steady * 25", unit: "L/day", notes: "25 L/bath engineering norm", order: 820 },
    { key: "laundry_water_l_day", label: "Laundry water (L/day)", groupId: opexId, formula: "laundry_loads_per_day_steady * 55", unit: "L/day", notes: "55 L/load", order: 821 },
    { key: "handwash_water_l_day", label: "Handwash water (L/day)", groupId: opexId, formula: "toilet_uses_per_day_steady * 1.5", unit: "L/day", notes: "1.5 L/visit", order: 822 },
    { key: "ro_feed_l_day", label: "RO feed water (L/day)", groupId: opexId, formula: "ro_litres_per_day_steady / ro_recovery_rate", unit: "L/day", order: 823 },
    { key: "ro_reject_l_day", label: "RO reject (L/day)", groupId: opexId, formula: "ro_feed_l_day - ro_litres_per_day_steady", unit: "L/day", order: 824 },
    { key: "greywater_l_day", label: "Greywater (L/day)", groupId: opexId, formula: "bath_water_l_day + laundry_water_l_day + handwash_water_l_day + ro_reject_l_day", unit: "L/day", order: 825 },
    { key: "recycle_demand_l_day", label: "Recycle demand (L/day)", groupId: opexId, formula: "toilet_uses_per_day_steady * 5 + 500", unit: "L/day", notes: "5 L flush + 500 L cleaning", order: 826 },
    { key: "recycled_used_l_day", label: "Recycled used (L/day)", groupId: opexId, formula: "MIN(MIN(greywater_l_day, stp_kld * 1000), recycle_demand_l_day)", unit: "L/day", order: 827 },
    { key: "fresh_water_l_day_steady", label: "Fresh BWSSB water (L/day, steady)", groupId: opexId, formula: "bath_water_l_day + laundry_water_l_day + handwash_water_l_day + ro_feed_l_day + MAX(0, recycle_demand_l_day - recycled_used_l_day)", unit: "L/day", order: 828 },
    { key: "stp_kl_treated_per_day", label: "STP throughput (KL/day)", groupId: opexId, formula: "MIN(greywater_l_day, stp_kld * 1000) / 1000", unit: "KL/day", order: 829 },

    // Electricity
    { key: "electricity_ro_kwh_per_day", label: "RO electricity (kWh/day)", groupId: opexId, formula: "ro_litres_per_day_steady * kwh_per_ro_litre", unit: "kWh/day", order: 830 },
    { key: "electricity_laundry_kwh_per_day", label: "Laundry electricity (kWh/day)", groupId: opexId, formula: "laundry_loads_per_day_steady * kwh_per_laundry_load", unit: "kWh/day", order: 831 },
    { key: "electricity_lighting_kwh_per_day", label: "Lighting + small loads (kWh/day)", groupId: opexId, formula: "facility_open_hours * kwh_lighting_per_open_hour", unit: "kWh/day", order: 832 },
    { key: "electricity_kwh_net_per_day", label: "Net grid electricity (kWh/day)", groupId: opexId, formula: "MAX(0, electricity_ro_kwh_per_day + electricity_laundry_kwh_per_day + electricity_lighting_kwh_per_day - solar_offset_kwh_per_day)", unit: "kWh/day", notes: "Solar offsets day-time load first", order: 833 },

    // Variable monthly opex (replacing flat inputs of the same key)
    { key: "electricity_monthly", label: "Electricity (net of solar)", groupId: opexId, formula: "electricity_kwh_net_per_day * 30 * electricity_tariff", unit: "INR/mo", order: 840 },
    { key: "water_bwssb_monthly", label: "Water (BWSSB net of greywater)", groupId: opexId, formula: "fresh_water_l_day_steady / 1000 * 30 * bwssb_inr_per_kl", unit: "INR/mo", order: 841 },
    { key: "cleaning_consumables_monthly", label: "Cleaning consumables", groupId: opexId, formula: "(toilet_uses_per_day_steady + bath_uses_per_day_steady) * cleaning_inr_per_visit * 30", unit: "INR/mo", order: 842 },
    { key: "laundry_detergent_monthly", label: "Laundry detergent (bulk)", groupId: opexId, formula: "laundry_loads_per_day_steady * detergent_inr_per_load * 30", unit: "INR/mo", order: 843 },
    { key: "ro_consumables_monthly", label: "RO consumables", groupId: opexId, formula: "ro_litres_per_day_steady / 1000 * 30 * ro_consumables_inr_per_kl", unit: "INR/mo", order: 844 },
    { key: "stp_consumables_monthly", label: "STP consumables", groupId: opexId, formula: "stp_kl_treated_per_day * 30 * stp_consumables_inr_per_kl_treated", unit: "INR/mo", order: 845 },
    { key: "desludging_monthly_amortised", label: "Septic desludging (amortised)", groupId: opexId, formula: "toilet_uses_per_day_steady / 1000 * 30 * desludging_inr_per_1000_uses", unit: "INR/mo", order: 846 },

    // Aggregates — rewrite to use new staff totals + variable opex
    { key: "opex_monthly_steady", label: "TOTAL monthly opex (steady)", groupId: opexId,
      formula: "opex_staff_steady + electricity_monthly + water_bwssb_monthly + cleaning_consumables_monthly + laundry_detergent_monthly + ro_consumables_monthly + stp_consumables_monthly + desludging_monthly_amortised + amc_monthly + tech_monthly + opex_lab_monthly",
      unit: "INR/mo", order: 850 },

    // Per-service direct split + security allocation
    { key: "opex_toilet_monthly", label: "Toilet — direct opex (monthly)", groupId: opexId,
      formula: "opex_caretakers * 0.4 + opex_security_total * 0.25 + cleaning_consumables_monthly * 0.55 + desludging_monthly_amortised + water_bwssb_monthly * 0.3", unit: "INR/mo", order: 860 },
    { key: "opex_bath_monthly", label: "Bath — direct opex (monthly)", groupId: opexId,
      formula: "opex_caretakers * 0.25 + opex_security_total * 0.25 + cleaning_consumables_monthly * 0.25 + water_bwssb_monthly * 0.45", unit: "INR/mo", order: 861 },
    { key: "opex_laundry_monthly", label: "Laundry — direct opex (monthly)", groupId: opexId,
      formula: "opex_laundry_supervisors_total + opex_security_total * 0.25 + laundry_detergent_monthly + electricity_monthly * 0.25 + water_bwssb_monthly * 0.15", unit: "INR/mo", order: 862 },
    { key: "opex_ro_monthly", label: "RO water — direct opex (monthly)", groupId: opexId,
      formula: "opex_plant_operators_total * 0.5 + opex_security_total * 0.25 + ro_consumables_monthly + electricity_monthly * 0.3", unit: "INR/mo", order: 863 },
  ];

  for (const f of formulaPatches) {
    const exists = existingByKey.has(f.key);
    if (exists) {
      await prisma.modelNode.updateMany({
        where: { templateId: tpl.id, key: f.key },
        data: {
          kind: "formula", dataType: "currency",
          shape: { kind: "scalar" } as never,
          groupId: f.groupId, label: f.label ?? undefined,
          formula: f.formula, unit: f.unit, notes: f.notes ?? null,
          // Clear stale defaultJson so the row is unambiguously a formula
          defaultJson: undefined,
          ...(f.order !== undefined ? { order: f.order } : {}),
        },
      });
    } else {
      await prisma.modelNode.create({
        data: {
          templateId: tpl.id, groupId: f.groupId, key: f.key,
          label: f.label ?? f.key, kind: "formula", dataType: "currency",
          shape: { kind: "scalar" } as never, formula: f.formula,
          unit: f.unit, notes: f.notes ?? null,
          surface: "both", tier: "basic", order: f.order ?? 999,
        },
      });
    }
  }

  // ── 3. Vector formulas — opex_monthly_actual, rev_laundry_*, annual rollups
  // These keep their existing kind=formula / shape=vector, only the formula
  // changes. The patch routes through updateMany so we don't touch shape.
  const vectorPatches: Array<{ key: string; formula: string }> = [
    { key: "rev_laundry_monthly",
      formula: "active_hh_monthly * (laundry_loads_per_active_hh_per_week / 7) * 28 * price_laundry * (1 - pass_holder_share) * pilot_pay_factor" },
    { key: "rev_laundry_annual",
      formula: "IF(T == 0, SUM(rev_laundry_monthly, 0, 12), active_hh_annual * (laundry_loads_per_active_hh_per_week / 7) * 365 * price_laundry * (1 - pass_holder_share) * (1 + price_increase) ^ T)" },
    { key: "opex_monthly_actual",
      formula:
        "IF(T < 2, 0, " +
        "opex_staff_pre_cbo + electricity_monthly + water_bwssb_monthly + cleaning_consumables_monthly + laundry_detergent_monthly + ro_consumables_monthly + stp_consumables_monthly + desludging_monthly_amortised + amc_monthly + tech_monthly" +
        " + IF(T >= 12, opex_cbo_total, 0)" +
        " + IF(T == 2, lab_quarterly, IF((T - 2) % 3 == 0, lab_quarterly, 0)))" },
    { key: "opex_annual_staff",
      formula: "opex_staff_pre_cbo * 12 * (1 + cost_inflation) ^ T * IF(T == 0, 10 / 12, 1)" },
    { key: "opex_annual_cbo",
      formula: "IF(T == 0, 0, opex_cbo_total * 12 * (1 + cost_inflation) ^ T)" },
  ];
  for (const v of vectorPatches) {
    await prisma.modelNode.updateMany({
      where: { templateId: tpl.id, key: v.key },
      data: { formula: v.formula },
    });
  }

  // ── 4. Update daysim_ops output config to expose laundryLoadsPerHHPerWeek ──
  const daySim = await prisma.modelOutput.findFirst({ where: { templateId: tpl.id, key: "daysim_ops" } });
  if (daySim) {
    const cfg = (daySim.config as Record<string, unknown>) ?? {};
    const nodes = ((cfg.nodes as Record<string, string>) ?? {});
    nodes.laundryLoadsPerHHPerWeek = "laundry_loads_per_active_hh_per_week";
    await prisma.modelOutput.update({
      where: { id: daySim.id },
      data: { config: { ...cfg, nodes } as never },
    });
  }

  // ── 5. Update budget_export_year1: swap bare salary refs for staff totals,
  // add security + admin/cashier lines so the exported budget reflects real
  // headcount × salary.
  const bx = await prisma.modelOutput.findFirst({ where: { templateId: tpl.id, key: "budget_export_year1" } });
  if (bx) {
    const cfg = (bx.config as Record<string, unknown>) ?? {};
    const opex = (cfg.opexLines as Array<{ nodeKey: string; description: string; costCategory: string; months: number }>) ?? [];
    const repl = new Map([
      ["salary_plant_operator", { nodeKey: "opex_plant_operators_total", description: "Plant operators" }],
      ["salary_laundry_supervisor", { nodeKey: "opex_laundry_supervisors_total", description: "Laundry supervisors" }],
    ]);
    const patched = opex.map(l => {
      const r = repl.get(l.nodeKey);
      return r ? { ...l, ...r } : l;
    });
    // Insert security + admin/cashier lines after the laundry-supervisor line
    // (or append if not found). Idempotent — only insert if not already there.
    const has = (k: string) => patched.some(l => l.nodeKey === k);
    if (!has("opex_security_total")) {
      const idx = patched.findIndex(l => l.nodeKey === "opex_laundry_supervisors_total");
      const ins = idx >= 0 ? idx + 1 : patched.length;
      patched.splice(ins, 0,
        { nodeKey: "opex_security_total", description: "Security guards", costCategory: "Salary", months: 10 },
        { nodeKey: "opex_admin_cashier_total", description: "Admin / cashier", costCategory: "Salary", months: 10 },
      );
    }
    // Replace the "Caretakers (3 shifts)" caption — name is misleading now
    for (const l of patched) {
      if (l.nodeKey === "opex_caretakers" && l.description?.startsWith("Caretakers")) l.description = "Caretakers";
    }
    await prisma.modelOutput.update({
      where: { id: bx.id },
      data: { config: { ...cfg, opexLines: patched } as never },
    });
  }

  console.log(`✔ Patched ${TEMPLATE_KEY} v2:`);
  console.log(`  • ${newInputs.length} new inputs (laundry param + 6 staff heads + salaries + 11 per-unit rates)`);
  console.log(`  • ${formulaPatches.length} formula nodes upserted (variable opex auto-scales)`);
  console.log(`  • ${vectorPatches.length} vector formulas updated`);
  console.log(`  • daysim_ops config + budget_export_year1 updated`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
