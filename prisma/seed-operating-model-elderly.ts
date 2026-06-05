// Elderly Programme — Resourcing & Unit-Cost Calculator (operating model).
// Translated from /Users/vishnuharikumar/Downloads/evrat/Janadhikara_Resourcing_Calculator.xlsx
// (7 sheets: README, Dashboard, Lists, Inputs, Workload, Cost_Model, Scenarios).
//
// 3-year P&L per centre with inflation baked into the annual horizon:
//   • Salaries  → 10% YoY
//   • CAPEX     → full in Y1, 20% replenishment in Y2/Y3
//   • Travel / Programme / Additions → 5% YoY
//
// Three pre-seeded scenario siblings (Honour cadences / Soften / Hybrid+vols)
// share parentInstanceId so /models/[id]/compare renders them side-by-side.
//
// Run:  npx tsx prisma/seed-operating-model-elderly.ts

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEMPLATE_KEY = "elderly_resourcing";

async function main() {
  await prisma.modelTemplate.deleteMany({ where: { key: TEMPLATE_KEY } });

  const template = await prisma.modelTemplate.create({
    data: {
      key: TEMPLATE_KEY,
      name: "Elderly Programme — Resourcing & Unit Cost",
      description:
        "Per-centre 3-year P&L for the Janadhikara Elderly Programme. Sizes CO workload from " +
        "tier distribution × EVRAT cadences, rolls salaries / CAPEX / travel / programme lines " +
        "and 13 recommended additions into an annual grant-budget total, and reports unit cost " +
        "per catchment elder. Three scenario siblings (Honour / Soften / Hybrid+volunteers) " +
        "share a parent so /compare shows them side-by-side.",
      horizons: [{ key: "annual", length: 3 }],
      sortOrder: 40,
    },
  });

  const groupDefs = [
    ["context",        "Programme Context"],
    ["tier_dist",      "Tier Distribution (% of catchment)"],
    ["cadence",        "Visit Cadences & Time per Visit"],
    ["co_productivity","CO Productivity"],
    ["salaries",       "Salaries"],
    ["capex_in",       "CAPEX"],
    ["travel_in",      "Travel"],
    ["prog_current",   "Programme Expenses — Current Lines"],
    ["prog_additions", "Programme Expenses — Recommended Additions (toggleable)"],
    ["volunteer",      "Volunteer Programme (for Hybrid scenario)"],
    ["tier_counts",    "Tier Counts (derived)"],
    ["workload",       "Workload (derived)"],
    ["co_req",         "CO Requirement (derived)"],
    ["subtotals",      "Annual Subtotals (derived, 3-yr vector)"],
    ["totals",         "Programme Totals (derived)"],
    ["allocation",     "Per-Tier Cost Allocation (derived, Year 1)"],
  ] as const;

  const groups: Record<string, string> = {};
  for (let i = 0; i < groupDefs.length; i++) {
    const [key, label] = groupDefs[i];
    const g = await prisma.modelGroup.create({ data: { templateId: template.id, key, label, order: i } });
    groups[key] = g.id;
  }

  type NodeIn = {
    key: string; label: string; kind: "input" | "formula" | "constant";
    dataType: "number" | "percent" | "currency" | "int" | "boolean" | "enum";
    shape?: { kind: "scalar" } | { kind: "vector"; horizon: string };
    defaultJson?: number | number[] | string | boolean;
    formula?: string;
    unit?: string;
    notes?: string;
    enumValues?: string[];
    group: string;
  };

  const nodes: NodeIn[] = [
    // ── 1. Programme context ────────────────────────────────────────────────
    { group: "context", key: "city",           label: "City",                          kind: "input", dataType: "enum",     defaultJson: "Bangalore", enumValues: ["Bangalore", "Chennai", "Both (same defaults)"], notes: "Marker only — defaults are not city-branched in v1." },
    { group: "context", key: "catchment",      label: "Catchment elders per centre",   kind: "input", dataType: "int",      defaultJson: 500, unit: "elders" },
    { group: "context", key: "cos_budgeted",   label: "COs currently budgeted",        kind: "input", dataType: "int",      defaultJson: 1,   unit: "COs",   notes: "Sanity check against derived CO requirement." },

    // ── 2. Tier distribution ────────────────────────────────────────────────
    { group: "tier_dist", key: "pct_profound", label: "Profound Need %",   kind: "input", dataType: "percent", defaultJson: 0.15, unit: "%", notes: "Bedridden, end-of-life, critical-flag overrides." },
    { group: "tier_dist", key: "pct_high",     label: "High Need %",       kind: "input", dataType: "percent", defaultJson: 0.20, unit: "%" },
    { group: "tier_dist", key: "pct_moderate", label: "Moderate Need %",   kind: "input", dataType: "percent", defaultJson: 0.30, unit: "%" },
    { group: "tier_dist", key: "pct_low",      label: "Low Need %",        kind: "input", dataType: "percent", defaultJson: 0.20, unit: "%" },
    { group: "tier_dist", key: "pct_stable",   label: "Stable %",          kind: "input", dataType: "percent", defaultJson: 0.15, unit: "%", notes: "Functioning well; potential peer mentors." },

    // ── 3. Visit cadences ───────────────────────────────────────────────────
    { group: "cadence", key: "vw_profound", label: "Profound — visits/wk per elder", kind: "input", dataType: "number", defaultJson: 2.5,   unit: "visits/wk", notes: "EVRAT Sec 17: 2–3 per week." },
    { group: "cadence", key: "vw_high",     label: "High — visits/wk per elder",     kind: "input", dataType: "number", defaultJson: 0.5,   unit: "visits/wk", notes: "Fortnightly = 0.5/wk." },
    { group: "cadence", key: "vw_moderate", label: "Moderate — visits/wk per elder", kind: "input", dataType: "number", defaultJson: 0.25,  unit: "visits/wk", notes: "Monthly = 0.25/wk." },
    { group: "cadence", key: "vw_low",      label: "Low — visits/wk per elder",      kind: "input", dataType: "number", defaultJson: 0.077, unit: "visits/wk", notes: "Quarterly ≈ 0.077/wk." },
    { group: "cadence", key: "vw_stable",   label: "Stable — visits/wk per elder",   kind: "input", dataType: "number", defaultJson: 0.058, unit: "visits/wk", notes: "3-monthly ≈ 0.058/wk." },
    { group: "cadence", key: "mn_profound", label: "Profound — min/visit",           kind: "input", dataType: "int",    defaultJson: 50,    unit: "min/visit" },
    { group: "cadence", key: "mn_high",     label: "High — min/visit",               kind: "input", dataType: "int",    defaultJson: 50,    unit: "min/visit" },
    { group: "cadence", key: "mn_moderate", label: "Moderate — min/visit",           kind: "input", dataType: "int",    defaultJson: 45,    unit: "min/visit" },
    { group: "cadence", key: "mn_low",      label: "Low — min/visit",                kind: "input", dataType: "int",    defaultJson: 35,    unit: "min/visit" },
    { group: "cadence", key: "mn_stable",   label: "Stable — min/visit",             kind: "input", dataType: "int",    defaultJson: 30,    unit: "min/visit" },

    // ── 4. CO productivity ──────────────────────────────────────────────────
    { group: "co_productivity", key: "co_hours_pw",    label: "Productive hours per CO per week", kind: "input", dataType: "number",  defaultJson: 30,   unit: "hrs/wk",  notes: "After leave, training, meetings, inter-site travel." },
    { group: "co_productivity", key: "co_admin_pct",   label: "Documentation/admin overhead",     kind: "input", dataType: "percent", defaultJson: 0.20, unit: "%",       notes: "Added to direct visit time." },
    { group: "co_productivity", key: "co_weeks_per_yr",label: "Working weeks per year",           kind: "input", dataType: "int",     defaultJson: 48,   unit: "weeks/yr",notes: "52 minus leave + holidays. Indicative; not used in steady-state math." },

    // ── 5. Salaries ─────────────────────────────────────────────────────────
    { group: "salaries", key: "sal_incharge_pm",    label: "Elderly Resource Centre In-charge — salary", kind: "input", dataType: "currency", defaultJson: 22000, unit: "₹/mo" },
    { group: "salaries", key: "sal_incharge_n",     label: "  — number of staff",                       kind: "input", dataType: "int",      defaultJson: 1,     unit: "staff" },
    { group: "salaries", key: "sal_co_pm",          label: "Community Organiser (Elderly) — salary",    kind: "input", dataType: "currency", defaultJson: 21000, unit: "₹/mo" },
    { group: "salaries", key: "sal_co_n",           label: "  — number of staff",                       kind: "input", dataType: "int",      defaultJson: 1,     unit: "staff" },
    { group: "salaries", key: "sal_kitchen_pm",     label: "Community Kitchen In-charge — salary",      kind: "input", dataType: "currency", defaultJson: 25000, unit: "₹/mo" },
    { group: "salaries", key: "sal_kitchen_n",      label: "  — number of staff",                       kind: "input", dataType: "int",      defaultJson: 1,     unit: "staff" },

    // ── 6. CAPEX ────────────────────────────────────────────────────────────
    { group: "capex_in", key: "centre_setup_unit", label: "Centre setup unit cost", kind: "input", dataType: "currency", defaultJson: 20000, unit: "₹/centre", notes: "Beds, utensils, linen." },
    { group: "capex_in", key: "centre_setup_qty",  label: "Centres",                kind: "input", dataType: "int",      defaultJson: 1,     unit: "centres" },

    // ── 7. Travel ───────────────────────────────────────────────────────────
    { group: "travel_in", key: "kitchen_travel_pm",     label: "Kitchen In-charge local travel", kind: "input", dataType: "currency", defaultJson: 3000, unit: "₹/mo" },
    { group: "travel_in", key: "kitchen_travel_months", label: "Months",                          kind: "input", dataType: "int",      defaultJson: 12,   unit: "months" },

    // ── 8. Programme current lines (9, from Pitstops budget registry) ───────
    { group: "prog_current", key: "pc_nutrition_unit",   label: "Day care nutrition — unit",       kind: "input", dataType: "currency", defaultJson: 2250,  unit: "₹/unit", notes: "Per elder-month × 12 × ~50 avg attendees." },
    { group: "prog_current", key: "pc_nutrition_qty",    label: "Day care nutrition — units",      kind: "input", dataType: "int",      defaultJson: 600,   unit: "units" },
    { group: "prog_current", key: "pc_refreshments_unit",label: "Monthly meeting refreshments — unit", kind: "input", dataType: "currency", defaultJson: 36000, unit: "₹/centre/yr" },
    { group: "prog_current", key: "pc_refreshments_qty", label: "Monthly meeting refreshments — units", kind: "input", dataType: "int",      defaultJson: 1,     unit: "centres" },
    { group: "prog_current", key: "pc_annual_day_unit",  label: "Senior Citizen Day — unit",       kind: "input", dataType: "currency", defaultJson: 34000, unit: "₹/centre/yr" },
    { group: "prog_current", key: "pc_annual_day_qty",   label: "Senior Citizen Day — units",      kind: "input", dataType: "int",      defaultJson: 1,     unit: "centres" },
    { group: "prog_current", key: "pc_dry_ration_unit",  label: "Dry ration — unit",               kind: "input", dataType: "currency", defaultJson: 450,   unit: "₹/elder/mo" },
    { group: "prog_current", key: "pc_dry_ration_qty",   label: "Dry ration — units",              kind: "input", dataType: "int",      defaultJson: 600,   unit: "elder-months" },
    { group: "prog_current", key: "pc_misc_unit",        label: "Misc & contingency — unit",       kind: "input", dataType: "currency", defaultJson: 60000, unit: "₹/centre/yr" },
    { group: "prog_current", key: "pc_misc_qty",         label: "Misc & contingency — units",      kind: "input", dataType: "int",      defaultJson: 1,     unit: "centres" },
    { group: "prog_current", key: "pc_veg_unit",         label: "Vegetables — unit",               kind: "input", dataType: "currency", defaultJson: 400,   unit: "₹/elder/mo" },
    { group: "prog_current", key: "pc_veg_qty",          label: "Vegetables — units",              kind: "input", dataType: "int",      defaultJson: 600,   unit: "elder-months" },
    { group: "prog_current", key: "pc_gas_unit",         label: "Gas refill — unit",               kind: "input", dataType: "currency", defaultJson: 7200,  unit: "₹/centre/yr" },
    { group: "prog_current", key: "pc_gas_qty",          label: "Gas refill — units",              kind: "input", dataType: "int",      defaultJson: 1,     unit: "centres" },
    { group: "prog_current", key: "pc_vols_unit",        label: "Community volunteer honoraria (pool) — unit", kind: "input", dataType: "currency", defaultJson: 18000, unit: "₹/mo" },
    { group: "prog_current", key: "pc_vols_qty",         label: "Community volunteer honoraria (pool) — months", kind: "input", dataType: "int",      defaultJson: 12,    unit: "months" },
    { group: "prog_current", key: "pc_rent_unit",        label: "Centre rent & maintenance — unit",kind: "input", dataType: "currency", defaultJson: 15000, unit: "₹/mo" },
    { group: "prog_current", key: "pc_rent_qty",         label: "Centre rent & maintenance — months", kind: "input", dataType: "int",      defaultJson: 12,    unit: "months" },

    // ── 9. Recommended additions (13 × {unit, qty, include}) ────────────────
    { group: "prog_additions", key: "pa_mobility_unit", label: "Mobility aids — unit",      kind: "input", dataType: "currency", defaultJson: 3000,  unit: "₹/unit" },
    { group: "prog_additions", key: "pa_mobility_qty",  label: "Mobility aids — units",     kind: "input", dataType: "int",      defaultJson: 40,    unit: "units" },
    { group: "prog_additions", key: "pa_mobility_inc",  label: "Mobility aids — include?",  kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_diapers_unit",  label: "Adult diapers (Profound) — unit",     kind: "input", dataType: "currency", defaultJson: 1500, unit: "₹/elder/mo" },
    { group: "prog_additions", key: "pa_diapers_qty",   label: "Adult diapers (Profound) — units",    kind: "input", dataType: "int",      defaultJson: 12,   unit: "elder-months" },
    { group: "prog_additions", key: "pa_diapers_inc",   label: "Adult diapers — include?",            kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_mattress_unit", label: "Air mattresses — unit",               kind: "input", dataType: "currency", defaultJson: 3500, unit: "₹/unit" },
    { group: "prog_additions", key: "pa_mattress_qty",  label: "Air mattresses — units",              kind: "input", dataType: "int",      defaultJson: 8,    unit: "units" },
    { group: "prog_additions", key: "pa_mattress_inc",  label: "Air mattresses — include?",           kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_emerg_ration_unit", label: "Emergency dry ration kits — unit",  kind: "input", dataType: "currency", defaultJson: 800, unit: "₹/kit" },
    { group: "prog_additions", key: "pa_emerg_ration_qty",  label: "Emergency dry ration kits — units", kind: "input", dataType: "int",      defaultJson: 30,  unit: "kits" },
    { group: "prog_additions", key: "pa_emerg_ration_inc",  label: "Emergency dry ration — include?",   kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_firstaid_unit", label: "First-aid + dressing — unit",         kind: "input", dataType: "currency", defaultJson: 500,  unit: "₹/kit" },
    { group: "prog_additions", key: "pa_firstaid_qty",  label: "First-aid + dressing — units",        kind: "input", dataType: "int",      defaultJson: 24,   unit: "kits" },
    { group: "prog_additions", key: "pa_firstaid_inc",  label: "First-aid — include?",                kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_bp_unit",       label: "BP machines + glucometer + strips — unit",  kind: "input", dataType: "currency", defaultJson: 15000, unit: "₹/set" },
    { group: "prog_additions", key: "pa_bp_qty",        label: "BP machines + glucometer + strips — units", kind: "input", dataType: "int",      defaultJson: 1,     unit: "sets" },
    { group: "prog_additions", key: "pa_bp_inc",        label: "BP machines — include?",              kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_idband_unit",   label: "ID bands (dementia-flagged) — unit",  kind: "input", dataType: "currency", defaultJson: 100,  unit: "₹/band" },
    { group: "prog_additions", key: "pa_idband_qty",    label: "ID bands — units",                    kind: "input", dataType: "int",      defaultJson: 30,   unit: "bands" },
    { group: "prog_additions", key: "pa_idband_inc",    label: "ID bands — include?",                 kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_mis_unit",      label: "MIS / mobile devices — unit",         kind: "input", dataType: "currency", defaultJson: 2000, unit: "₹/mo" },
    { group: "prog_additions", key: "pa_mis_qty",       label: "MIS / mobile devices — months",       kind: "input", dataType: "int",      defaultJson: 12,   unit: "months" },
    { group: "prog_additions", key: "pa_mis_inc",       label: "MIS / mobile devices — include?",     kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_transport_unit",label: "Transport contingency — unit",        kind: "input", dataType: "currency", defaultJson: 2000, unit: "₹/mo" },
    { group: "prog_additions", key: "pa_transport_qty", label: "Transport contingency — months",      kind: "input", dataType: "int",      defaultJson: 12,   unit: "months" },
    { group: "prog_additions", key: "pa_transport_inc", label: "Transport contingency — include?",    kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_training_unit", label: "Training & calibration — unit",       kind: "input", dataType: "currency", defaultJson: 40000, unit: "₹/yr" },
    { group: "prog_additions", key: "pa_training_qty",  label: "Training & calibration — units",      kind: "input", dataType: "int",      defaultJson: 1,    unit: "yr" },
    { group: "prog_additions", key: "pa_training_inc",  label: "Training & calibration — include?",   kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_camp_unit",     label: "Eye / ENT camp logistics — unit",     kind: "input", dataType: "currency", defaultJson: 25000, unit: "₹/camp" },
    { group: "prog_additions", key: "pa_camp_qty",      label: "Eye / ENT camp logistics — units",    kind: "input", dataType: "int",      defaultJson: 2,    unit: "camps" },
    { group: "prog_additions", key: "pa_camp_inc",      label: "Eye / ENT camps — include?",          kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_mh_unit",       label: "Mental health partner case fee — unit", kind: "input", dataType: "currency", defaultJson: 500, unit: "₹/case" },
    { group: "prog_additions", key: "pa_mh_qty",        label: "Mental health partner — units",       kind: "input", dataType: "int",      defaultJson: 30,   unit: "cases" },
    { group: "prog_additions", key: "pa_mh_inc",        label: "Mental health partner — include?",    kind: "input", dataType: "boolean",  defaultJson: true },

    { group: "prog_additions", key: "pa_pall_unit",     label: "Palliative partner referral fee — unit", kind: "input", dataType: "currency", defaultJson: 1000, unit: "₹/referral" },
    { group: "prog_additions", key: "pa_pall_qty",      label: "Palliative partner — units",          kind: "input", dataType: "int",      defaultJson: 15,   unit: "referrals" },
    { group: "prog_additions", key: "pa_pall_inc",      label: "Palliative partner — include?",       kind: "input", dataType: "boolean",  defaultJson: true },

    // ── 10. Volunteer programme (Hybrid scenario only) ──────────────────────
    { group: "volunteer", key: "vol_hours_per_week",     label: "Volunteer hours contributed per week",          kind: "input", dataType: "number",   defaultJson: 0, unit: "hrs/wk",   notes: "Offsets net CO hours required. 0 in scenarios A/B." },
    { group: "volunteer", key: "vol_honoraria_per_year", label: "Volunteer honoraria (annual)",                  kind: "input", dataType: "currency", defaultJson: 0, unit: "₹/yr",     notes: "C: ~₹3,000/mo × 10 active vols ≈ ₹360k." },
    { group: "volunteer", key: "vol_training_per_year",  label: "Volunteer training & oversight (annual)",       kind: "input", dataType: "currency", defaultJson: 0, unit: "₹/yr",     notes: "C: ~₹80k." },

    // ── 11. Tier counts (derived) ───────────────────────────────────────────
    { group: "tier_counts", key: "n_profound", label: "Profound — count",  kind: "formula", dataType: "int", formula: "ROUND(catchment * pct_profound, 0)", unit: "elders" },
    { group: "tier_counts", key: "n_high",     label: "High — count",      kind: "formula", dataType: "int", formula: "ROUND(catchment * pct_high, 0)",     unit: "elders" },
    { group: "tier_counts", key: "n_moderate", label: "Moderate — count",  kind: "formula", dataType: "int", formula: "ROUND(catchment * pct_moderate, 0)", unit: "elders" },
    { group: "tier_counts", key: "n_low",      label: "Low — count",       kind: "formula", dataType: "int", formula: "ROUND(catchment * pct_low, 0)",      unit: "elders" },
    { group: "tier_counts", key: "n_stable",   label: "Stable — count",    kind: "formula", dataType: "int", formula: "ROUND(catchment * pct_stable, 0)",   unit: "elders" },
    { group: "tier_counts", key: "n_total",    label: "Total elders",      kind: "formula", dataType: "int", formula: "n_profound + n_high + n_moderate + n_low + n_stable", unit: "elders" },

    // ── 12. Workload (derived) ──────────────────────────────────────────────
    { group: "workload", key: "hpw_profound", label: "Profound — hrs/wk", kind: "formula", dataType: "number", formula: "n_profound * vw_profound * mn_profound / 60", unit: "hrs/wk" },
    { group: "workload", key: "hpw_high",     label: "High — hrs/wk",     kind: "formula", dataType: "number", formula: "n_high * vw_high * mn_high / 60",             unit: "hrs/wk" },
    { group: "workload", key: "hpw_moderate", label: "Moderate — hrs/wk", kind: "formula", dataType: "number", formula: "n_moderate * vw_moderate * mn_moderate / 60", unit: "hrs/wk" },
    { group: "workload", key: "hpw_low",      label: "Low — hrs/wk",      kind: "formula", dataType: "number", formula: "n_low * vw_low * mn_low / 60",                unit: "hrs/wk" },
    { group: "workload", key: "hpw_stable",   label: "Stable — hrs/wk",   kind: "formula", dataType: "number", formula: "n_stable * vw_stable * mn_stable / 60",       unit: "hrs/wk" },
    { group: "workload", key: "hpw_total",    label: "Total direct visit hrs/wk", kind: "formula", dataType: "number", formula: "hpw_profound + hpw_high + hpw_moderate + hpw_low + hpw_stable", unit: "hrs/wk" },

    // ── 13. CO requirement (derived) ────────────────────────────────────────
    { group: "co_req", key: "co_admin_hrs_pw",    label: "Admin/documentation hrs/wk",              kind: "formula", dataType: "number", formula: "hpw_total * co_admin_pct",                     unit: "hrs/wk" },
    { group: "co_req", key: "co_total_hrs_pw",    label: "Total CO hrs required/wk (pre-volunteers)", kind: "formula", dataType: "number", formula: "hpw_total + co_admin_hrs_pw",                  unit: "hrs/wk" },
    { group: "co_req", key: "co_net_hrs_pw",      label: "Net CO hrs/wk (after volunteer offset)",  kind: "formula", dataType: "number", formula: "MAX(0, co_total_hrs_pw - vol_hours_per_week)", unit: "hrs/wk" },
    { group: "co_req", key: "cos_required",       label: "COs required at EVRAT cadences",          kind: "formula", dataType: "int",    formula: "CEILING(co_net_hrs_pw / co_hours_pw)",         unit: "COs",   notes: "Rounded up." },
    { group: "co_req", key: "cos_gap",            label: "CO gap (required − budgeted)",            kind: "formula", dataType: "int",    formula: "cos_required - cos_budgeted",                  unit: "COs",   notes: "Negative ⇒ overstaffed." },

    // ── 14. Annual subtotals (3-year vectors with inflation) ────────────────
    //   Build a Y1 scalar per category, then a 3-year vector. Inflation: 10% salaries, 5% other, CAPEX 20% Y2/Y3.
    { group: "subtotals", key: "salaries_y1", label: "Salaries — Y1", kind: "formula", dataType: "currency",
      formula: "sal_incharge_pm * 12 * sal_incharge_n + sal_co_pm * 12 * sal_co_n + sal_kitchen_pm * 12 * sal_kitchen_n", unit: "₹/yr" },
    { group: "subtotals", key: "capex_y1", label: "CAPEX — Y1", kind: "formula", dataType: "currency",
      formula: "centre_setup_unit * centre_setup_qty", unit: "₹/yr" },
    { group: "subtotals", key: "travel_y1", label: "Travel — Y1", kind: "formula", dataType: "currency",
      formula: "kitchen_travel_pm * kitchen_travel_months", unit: "₹/yr" },
    { group: "subtotals", key: "prog_current_y1", label: "Programme current — Y1", kind: "formula", dataType: "currency",
      formula:
        "pc_nutrition_unit * pc_nutrition_qty + pc_refreshments_unit * pc_refreshments_qty + pc_annual_day_unit * pc_annual_day_qty + " +
        "pc_dry_ration_unit * pc_dry_ration_qty + pc_misc_unit * pc_misc_qty + pc_veg_unit * pc_veg_qty + " +
        "pc_gas_unit * pc_gas_qty + pc_vols_unit * pc_vols_qty + pc_rent_unit * pc_rent_qty",
      unit: "₹/yr" },
    { group: "subtotals", key: "prog_additions_y1", label: "Programme additions — Y1", kind: "formula", dataType: "currency",
      formula:
        "pa_mobility_inc * pa_mobility_unit * pa_mobility_qty + pa_diapers_inc * pa_diapers_unit * pa_diapers_qty + " +
        "pa_mattress_inc * pa_mattress_unit * pa_mattress_qty + pa_emerg_ration_inc * pa_emerg_ration_unit * pa_emerg_ration_qty + " +
        "pa_firstaid_inc * pa_firstaid_unit * pa_firstaid_qty + pa_bp_inc * pa_bp_unit * pa_bp_qty + " +
        "pa_idband_inc * pa_idband_unit * pa_idband_qty + pa_mis_inc * pa_mis_unit * pa_mis_qty + " +
        "pa_transport_inc * pa_transport_unit * pa_transport_qty + pa_training_inc * pa_training_unit * pa_training_qty + " +
        "pa_camp_inc * pa_camp_unit * pa_camp_qty + pa_mh_inc * pa_mh_unit * pa_mh_qty + pa_pall_inc * pa_pall_unit * pa_pall_qty",
      unit: "₹/yr" },
    { group: "subtotals", key: "volunteer_y1", label: "Volunteer programme — Y1", kind: "formula", dataType: "currency",
      formula: "vol_honoraria_per_year + vol_training_per_year", unit: "₹/yr" },

    { group: "subtotals", key: "salaries_annual", label: "Salaries (annual, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" }, formula: "salaries_y1 * (1.10 ^ T)", unit: "₹/yr" },
    { group: "subtotals", key: "capex_annual", label: "CAPEX (annual, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" }, formula: "IF(T == 0, capex_y1, capex_y1 * 0.2)", unit: "₹/yr",
      notes: "Y1 full setup; Y2/Y3 = 20% replenishment." },
    { group: "subtotals", key: "travel_annual", label: "Travel (annual, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" }, formula: "travel_y1 * (1.05 ^ T)", unit: "₹/yr" },
    { group: "subtotals", key: "prog_current_annual", label: "Programme current (annual, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" }, formula: "prog_current_y1 * (1.05 ^ T)", unit: "₹/yr" },
    { group: "subtotals", key: "prog_additions_annual", label: "Programme additions (annual, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" }, formula: "prog_additions_y1 * (1.05 ^ T)", unit: "₹/yr" },
    { group: "subtotals", key: "volunteer_annual", label: "Volunteer programme (annual, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" }, formula: "volunteer_y1 * (1.05 ^ T)", unit: "₹/yr" },

    // ── 15. Totals (derived) ────────────────────────────────────────────────
    { group: "totals", key: "grand_total_annual", label: "Grand total (annual, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "salaries_annual + capex_annual + travel_annual + prog_current_annual + prog_additions_annual + volunteer_annual",
      unit: "₹/yr" },
    { group: "totals", key: "grand_total_y1", label: "Grand total — Y1", kind: "formula", dataType: "currency",
      formula: "salaries_y1 + capex_y1 + travel_y1 + prog_current_y1 + prog_additions_y1 + volunteer_y1", unit: "₹/yr" },
    { group: "totals", key: "grand_total_3yr", label: "Grand total — 3-yr sum", kind: "formula", dataType: "currency",
      formula: "SUM(grand_total_annual)", unit: "₹" },
    { group: "totals", key: "unit_cost_per_elder_y1", label: "Unit cost per catchment elder — Y1", kind: "formula", dataType: "currency",
      formula: "IFERROR(grand_total_y1 / catchment, 0)", unit: "₹/elder/yr" },
    { group: "totals", key: "unit_cost_per_attendee_y1", label: "Unit cost per centre attendee — Y1 (~50 daily)", kind: "formula", dataType: "currency",
      formula: "IFERROR(grand_total_y1 / 50, 0)", unit: "₹/attendee/yr" },
    { group: "totals", key: "unit_cost_per_elder_annual", label: "Unit cost per elder (annual, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" }, formula: "IFERROR(grand_total_annual / catchment, 0)", unit: "₹/elder/yr" },

    // Scenario delivery cost = base + extra CO salaries needed to close the cadence gap.
    // Matches xlsx Scenarios sheet (rows 26–31): the grand total above is "current
    // budgeted spend"; scenario_total below is "what full delivery would cost."
    { group: "totals", key: "extra_cos_needed", label: "Extra COs needed (req − budgeted, floored at 0)", kind: "formula", dataType: "int",
      formula: "MAX(0, cos_required - cos_budgeted)", unit: "COs" },
    { group: "totals", key: "extra_co_salary_y1", label: "Extra CO salaries — Y1", kind: "formula", dataType: "currency",
      formula: "extra_cos_needed * sal_co_pm * 12", unit: "₹/yr" },
    { group: "totals", key: "scenario_total_y1", label: "Scenario total (incl. CO gap-fund) — Y1", kind: "formula", dataType: "currency",
      formula: "grand_total_y1 + extra_co_salary_y1", unit: "₹/yr" },
    { group: "totals", key: "scenario_unit_cost_per_elder_y1", label: "Scenario unit cost per elder — Y1", kind: "formula", dataType: "currency",
      formula: "IFERROR(scenario_total_y1 / catchment, 0)", unit: "₹/elder/yr" },
    { group: "totals", key: "scenario_total_annual", label: "Scenario total (incl. CO gap-fund, 3-yr)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" }, formula: "grand_total_annual + extra_co_salary_y1 * (1.10 ^ T)", unit: "₹/yr",
      notes: "Extra-CO salaries inflate at 10% YoY along with base salaries." },
    { group: "totals", key: "scenario_total_3yr", label: "Scenario total — 3-yr sum", kind: "formula", dataType: "currency",
      formula: "SUM(scenario_total_annual)", unit: "₹" },

    // ── 16. Per-tier allocation (Y1) ────────────────────────────────────────
    { group: "allocation", key: "pct_hrs_profound", label: "Profound — % of CO hrs", kind: "formula", dataType: "percent", formula: "IFERROR(hpw_profound / hpw_total, 0)", unit: "%" },
    { group: "allocation", key: "pct_hrs_high",     label: "High — % of CO hrs",     kind: "formula", dataType: "percent", formula: "IFERROR(hpw_high / hpw_total, 0)",     unit: "%" },
    { group: "allocation", key: "pct_hrs_moderate", label: "Moderate — % of CO hrs", kind: "formula", dataType: "percent", formula: "IFERROR(hpw_moderate / hpw_total, 0)", unit: "%" },
    { group: "allocation", key: "pct_hrs_low",      label: "Low — % of CO hrs",      kind: "formula", dataType: "percent", formula: "IFERROR(hpw_low / hpw_total, 0)",      unit: "%" },
    { group: "allocation", key: "pct_hrs_stable",   label: "Stable — % of CO hrs",   kind: "formula", dataType: "percent", formula: "IFERROR(hpw_stable / hpw_total, 0)",   unit: "%" },

    { group: "allocation", key: "cost_share_profound", label: "Profound — Y1 cost share", kind: "formula", dataType: "currency", formula: "grand_total_y1 * pct_hrs_profound", unit: "₹/yr" },
    { group: "allocation", key: "cost_share_high",     label: "High — Y1 cost share",     kind: "formula", dataType: "currency", formula: "grand_total_y1 * pct_hrs_high",     unit: "₹/yr" },
    { group: "allocation", key: "cost_share_moderate", label: "Moderate — Y1 cost share", kind: "formula", dataType: "currency", formula: "grand_total_y1 * pct_hrs_moderate", unit: "₹/yr" },
    { group: "allocation", key: "cost_share_low",      label: "Low — Y1 cost share",      kind: "formula", dataType: "currency", formula: "grand_total_y1 * pct_hrs_low",      unit: "₹/yr" },
    { group: "allocation", key: "cost_share_stable",   label: "Stable — Y1 cost share",   kind: "formula", dataType: "currency", formula: "grand_total_y1 * pct_hrs_stable",   unit: "₹/yr" },

    { group: "allocation", key: "per_elder_profound", label: "Profound — Y1 per-elder cost", kind: "formula", dataType: "currency", formula: "IFERROR(cost_share_profound / n_profound, 0)", unit: "₹/elder/yr" },
    { group: "allocation", key: "per_elder_high",     label: "High — Y1 per-elder cost",     kind: "formula", dataType: "currency", formula: "IFERROR(cost_share_high / n_high, 0)",         unit: "₹/elder/yr" },
    { group: "allocation", key: "per_elder_moderate", label: "Moderate — Y1 per-elder cost", kind: "formula", dataType: "currency", formula: "IFERROR(cost_share_moderate / n_moderate, 0)", unit: "₹/elder/yr" },
    { group: "allocation", key: "per_elder_low",      label: "Low — Y1 per-elder cost",      kind: "formula", dataType: "currency", formula: "IFERROR(cost_share_low / n_low, 0)",           unit: "₹/elder/yr" },
    { group: "allocation", key: "per_elder_stable",   label: "Stable — Y1 per-elder cost",   kind: "formula", dataType: "currency", formula: "IFERROR(cost_share_stable / n_stable, 0)",     unit: "₹/elder/yr" },
  ];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    await prisma.modelNode.create({
      data: {
        templateId: template.id,
        groupId: groups[n.group],
        key: n.key, label: n.label, kind: n.kind, dataType: n.dataType,
        shape: n.shape ?? { kind: "scalar" },
        defaultJson: (n.defaultJson ?? null) as never,
        formula: n.formula ?? null,
        unit: n.unit ?? null,
        notes: n.notes ?? null,
        enumValues: (n.enumValues ?? null) as never,
        order: i,
      },
    });
  }

  type OutputIn = { key: string; label: string; kind: string; config: Record<string, unknown>; order: number };

  const outputs: OutputIn[] = [
    // Headline KPIs (Year 1 unless noted).
    { key: "kpi_grand_total_y1",       label: "Grand total — Y1",                    kind: "kpi", order: 0,  config: { nodeKey: "grand_total_y1",          format: "currency" } },
    { key: "kpi_unit_cost_per_elder",  label: "Unit cost per catchment elder — Y1",  kind: "kpi", order: 1,  config: { nodeKey: "unit_cost_per_elder_y1",  format: "currency" } },
    { key: "kpi_unit_cost_attendee",   label: "Unit cost per centre attendee — Y1",  kind: "kpi", order: 2,  config: { nodeKey: "unit_cost_per_attendee_y1", format: "currency" } },
    { key: "kpi_cos_required",         label: "COs required at EVRAT cadences",      kind: "kpi", order: 3,  config: { nodeKey: "cos_required",            format: "number" } },
    { key: "kpi_cos_budgeted",         label: "COs currently budgeted",              kind: "kpi", order: 4,  config: { nodeKey: "cos_budgeted",            format: "number" } },
    { key: "kpi_cos_gap",              label: "CO gap (required − budgeted)",        kind: "kpi", order: 5,  config: { nodeKey: "cos_gap",                 format: "number" } },
    { key: "kpi_grand_total_3yr",      label: "Grand total — 3-yr sum",              kind: "kpi", order: 6,  config: { nodeKey: "grand_total_3yr",         format: "currency" } },

    // Per-year KPI cards from the 3-yr vector.
    { key: "kpi_grand_total_y2",       label: "Grand total — Y2",                    kind: "kpi", order: 7,  config: { nodeKey: "grand_total_annual", index: 1, format: "currency" } },
    { key: "kpi_grand_total_y3",       label: "Grand total — Y3",                    kind: "kpi", order: 8,  config: { nodeKey: "grand_total_annual", index: 2, format: "currency" } },

    // Scenario delivery cost — base + CO gap-funding.
    { key: "kpi_scenario_total_y1",    label: "Scenario total (full delivery) — Y1", kind: "kpi", order: 9,  config: { nodeKey: "scenario_total_y1",            format: "currency" } },
    { key: "kpi_scenario_unit_cost",   label: "Scenario unit cost per elder — Y1",   kind: "kpi", order: 10, config: { nodeKey: "scenario_unit_cost_per_elder_y1", format: "currency" } },
    { key: "kpi_scenario_total_3yr",   label: "Scenario total — 3-yr sum",           kind: "kpi", order: 11, config: { nodeKey: "scenario_total_3yr",           format: "currency" } },

    // 3-year series (Salaries / CAPEX / Travel / Programme / Additions / Volunteer / Grand total / Unit cost).
    { key: "series_salaries",          label: "Salaries — 3-yr",                     kind: "series", order: 20, config: { nodeKey: "salaries_annual",         horizon: "annual", format: "currency" } },
    { key: "series_capex",             label: "CAPEX — 3-yr",                        kind: "series", order: 21, config: { nodeKey: "capex_annual",            horizon: "annual", format: "currency" } },
    { key: "series_travel",            label: "Travel — 3-yr",                       kind: "series", order: 22, config: { nodeKey: "travel_annual",           horizon: "annual", format: "currency" } },
    { key: "series_prog_current",      label: "Programme (current lines) — 3-yr",    kind: "series", order: 23, config: { nodeKey: "prog_current_annual",     horizon: "annual", format: "currency" } },
    { key: "series_prog_additions",    label: "Programme (additions) — 3-yr",        kind: "series", order: 24, config: { nodeKey: "prog_additions_annual",   horizon: "annual", format: "currency" } },
    { key: "series_volunteer",         label: "Volunteer programme — 3-yr",          kind: "series", order: 25, config: { nodeKey: "volunteer_annual",        horizon: "annual", format: "currency" } },
    { key: "series_grand_total",       label: "Grand total — 3-yr",                  kind: "series", order: 26, config: { nodeKey: "grand_total_annual",      horizon: "annual", format: "currency" } },
    { key: "series_scenario_total",    label: "Scenario total (full delivery) — 3-yr", kind: "series", order: 27, config: { nodeKey: "scenario_total_annual", horizon: "annual", format: "currency" } },
    { key: "series_unit_cost_elder",   label: "Unit cost per elder — 3-yr",          kind: "series", order: 28, config: { nodeKey: "unit_cost_per_elder_annual", horizon: "annual", format: "currency" } },
  ];

  for (const o of outputs) {
    await prisma.modelOutput.create({
      data: { templateId: template.id, key: o.key, label: o.label, kind: o.kind, config: o.config as never, order: o.order },
    });
  }

  // ── Scenario instances ───────────────────────────────────────────────────
  // A is the head (parent); B and C link to A so /compare bundles all three.
  const scenarioA = await prisma.modelInstance.create({
    data: {
      templateId: template.id,
      name: "Per-centre — A (Honour cadences)",
      scenarioName: "A — Honour cadences",
      inputsJson: {}, // all defaults match EVRAT cadences + 1 CO budgeted + no volunteers
    },
  });

  await prisma.modelInstance.create({
    data: {
      templateId: template.id,
      name: "Per-centre — B (Soften cadences)",
      scenarioName: "B — Soften cadences",
      parentInstanceId: scenarioA.id,
      // Reduce cadences to fit current 1-CO staffing. Lowest unit cost; commitments not honoured.
      inputsJson: {
        vw_profound: 1,
        vw_high:     0.25,
        vw_moderate: 0.083,
        vw_low:      0.04,
        vw_stable:   0.04,
      },
    },
  });

  await prisma.modelInstance.create({
    data: {
      templateId: template.id,
      name: "Per-centre — C (Hybrid with volunteers)",
      scenarioName: "C — Hybrid with volunteers",
      parentInstanceId: scenarioA.id,
      // Funded staff cover Profound + High + first-contact Moderate. Volunteers/peer
      // mentors cover Low + Stable under CO supervision. 80 volunteer hrs/wk offset.
      inputsJson: {
        vw_profound: 2,
        vw_high:     0.5,
        vw_moderate: 0.15,
        vw_low:      0.04,
        vw_stable:   0.04,
        vol_hours_per_week:     80,
        vol_honoraria_per_year: 360000,
        vol_training_per_year:  80000,
      },
    },
  });

  console.log(`Seeded template ${TEMPLATE_KEY}: ${nodes.length} nodes, ${outputs.length} outputs, 3 scenarios.`);
  console.log(`Head instance: ${scenarioA.id}`);
  console.log(`Visit /models/${scenarioA.id} to play, /models/${scenarioA.id}/compare for A/B/C.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
