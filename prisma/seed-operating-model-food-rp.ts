// Food programme — RP Effort + Staffing + Cost Calculator (operating model).
// Translated from /Users/vishnuharikumar/Downloads/food-programme-rp-effort-calculator.xlsx
// (3 working sheets: Calculator, Staffing model, Cost registry + Scenarios + Assumptions).
//
// Steady-state monthly math. Grant-funded → no revenue/EBITDA. Headline KPIs:
// Total RPs, total headcount, monthly grand-total cost, cost per meal.
//
// Run:  npx tsx prisma/seed-operating-model-food-rp.ts

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEMPLATE_KEY = "food_rp_effort";

async function main() {
  await prisma.modelTemplate.deleteMany({ where: { key: TEMPLATE_KEY } });

  const template = await prisma.modelTemplate.create({
    data: {
      key: TEMPLATE_KEY,
      name: "Food Programme — RP Effort & Staffing Calculator",
      description:
        "Steady-state operations calculator for the food-distribution programme. Sizes the " +
        "RP team given meals/day + kitchen + DP topology, rolls up full staffing (coordinators, " +
        "kitchen, transport, DP), kitchen utilities, DP consumables and vendor food cost into a " +
        "monthly grant-budget line. Translated from the xlsx workbook. Defaults mirror " +
        "lib/budget-costs.ts FoodDistribution domain.",
      // 12-month horizon kept for future scenarios (monsoon buffer, ramp-up).
      // Current model is steady-state so all derived values are scalar.
      horizons: [{ key: "annual", length: 1 }],
      sortOrder: 30,
    },
  });

  const groupDefs = [
    ["scale",        "Programme Scale"],
    ["rp_unit",      "RP Unit Costs"],
    ["ratios",       "Staffing Ratios"],
    ["salaries",     "Salaries"],
    ["utilities_in", "Kitchen Utilities (per-kitchen monthly)"],
    ["dp_in",        "DP Consumables (rates & qty)"],
    ["food_in",      "Food Cost"],
    ["structure",    "Programme Structure (derived)"],
    ["rp_team",      "RP Team (derived)"],
    ["rp_cost",      "RP Monthly Cost (derived)"],
    ["headcount",    "Staffing Headcount (derived)"],
    ["staff_cost",   "Staffing Monthly Cost (derived)"],
    ["utilities",    "Utilities Monthly Cost (derived)"],
    ["consumables",  "DP Consumables Monthly (derived)"],
    ["totals",       "Programme Totals (derived)"],
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
    group: string;
  };

  const nodes: NodeIn[] = [
    // ── 1. Programme scale ─────────────────────────────────────────────────
    { group: "scale", key: "meals_per_day",        label: "Total meals served per day",      kind: "input", dataType: "int",      defaultJson: 1500, unit: "meals",       notes: "Launch ~1,500; mid-scale 5,000; full ~20,000." },
    { group: "scale", key: "num_kitchens",         label: "Number of kitchens",              kind: "input", dataType: "int",      defaultJson: 1,    unit: "kitchens",    notes: "One per geographical cluster." },
    { group: "scale", key: "meals_per_truck",      label: "Meals per truck per day",         kind: "input", dataType: "int",      defaultJson: 750,  unit: "meals/truck", notes: "TATA Ace × 6 containers × ~125 portions." },
    { group: "scale", key: "meals_per_dp",         label: "Meals per DP per day (avg)",      kind: "input", dataType: "int",      defaultJson: 300,  unit: "meals/DP",    notes: "Sampark 300; CFAR mix 150–200." },
    { group: "scale", key: "visits_per_dp_week",   label: "RP visits per DP per week",       kind: "input", dataType: "int",      defaultJson: 2,    unit: "visits/wk",   notes: "Floor for quality observation." },
    { group: "scale", key: "rp_days_per_week",     label: "RP working days per week",        kind: "input", dataType: "int",      defaultJson: 6,    unit: "days/wk" },
    { group: "scale", key: "dps_per_rp_day",       label: "DPs observable per RP per day",   kind: "input", dataType: "int",      defaultJson: 6,    unit: "DPs",         notes: "3 on truck-follow + 3 independent. Hard cap." },
    { group: "scale", key: "buffer_factor",        label: "Headroom buffer (rain/illness)",  kind: "input", dataType: "number",   defaultJson: 1.10, unit: "×",           notes: "1.10 baseline; 1.15 in monsoon." },
    { group: "scale", key: "days_per_month",       label: "Working days per RP per month",   kind: "input", dataType: "int",      defaultJson: 26,   unit: "days/mo",     notes: "Sunday off." },

    // ── 2. RP unit costs ───────────────────────────────────────────────────
    { group: "rp_unit", key: "rp_salary_pm",      label: "RP salary per month",                kind: "input", dataType: "currency", defaultJson: 50000, unit: "₹/mo",  notes: "Mid-level field officer, Bangalore." },
    { group: "rp_unit", key: "rp_2w_pm",          label: "Two-wheeler allowance",              kind: "input", dataType: "currency", defaultJson: 3500,  unit: "₹/mo",  notes: "Fuel + maintenance." },
    { group: "rp_unit", key: "rp_night_cab",      label: "Night cab per trip (01:30 home → kitchen)", kind: "input", dataType: "currency", defaultJson: 350,   unit: "₹",     notes: "Programme-paid safety floor." },
    { group: "rp_unit", key: "rp_buffer_cab",     label: "Buffer cab budget per RP per month", kind: "input", dataType: "currency", defaultJson: 3000,  unit: "₹/mo",  notes: "ZL discretion: monsoon/illness/late return." },

    // ── 3. Staffing ratios (1 staff per X meals/day) ───────────────────────
    { group: "ratios", key: "meals_per_kitchen_manager",   label: "Meals/day per Kitchen Manager",    kind: "input", dataType: "int", defaultJson: 10000, unit: "meals/staff", notes: "1 Kitchen Mgr per 10K meals/day." },
    { group: "ratios", key: "meals_per_warehouse_manager", label: "Meals/day per Warehouse Manager",  kind: "input", dataType: "int", defaultJson: 10000, unit: "meals/staff" },
    { group: "ratios", key: "meals_per_cook",              label: "Meals/day per Cook",               kind: "input", dataType: "int", defaultJson: 1667,  unit: "meals/staff", notes: "6 Cooks per 10K." },
    { group: "ratios", key: "meals_per_helper_cook",       label: "Meals/day per Helper Cook",        kind: "input", dataType: "int", defaultJson: 1112,  unit: "meals/staff", notes: "9 per 10K." },
    { group: "ratios", key: "meals_per_kitchen_loader",    label: "Meals/day per Kitchen Loader",     kind: "input", dataType: "int", defaultJson: 1667,  unit: "meals/staff", notes: "6 per 10K." },
    { group: "ratios", key: "meals_per_chopping_cleaning", label: "Meals/day per Chopping & Cleaning",kind: "input", dataType: "int", defaultJson: 667,   unit: "meals/staff", notes: "15 per 10K." },
    { group: "ratios", key: "meals_per_food_loader",       label: "Meals/day per Food Loader",        kind: "input", dataType: "int", defaultJson: 667,   unit: "meals/staff", notes: "15 per 10K." },
    { group: "ratios", key: "meals_per_housekeeping",      label: "Meals/day per Housekeeping",       kind: "input", dataType: "int", defaultJson: 667,   unit: "meals/staff", notes: "15 per 10K." },
    { group: "ratios", key: "dp_staff_per_dp",             label: "DP Staff per DP",                  kind: "input", dataType: "int", defaultJson: 2,     unit: "staff/DP" },

    // ── 4. Salaries ────────────────────────────────────────────────────────
    { group: "salaries", key: "salary_programme_coordinator",   label: "Programme Coordinator",   kind: "input", dataType: "currency", defaultJson: 65000, unit: "₹/mo" },
    { group: "salaries", key: "salary_procurement_coordinator", label: "Procurement Coordinator", kind: "input", dataType: "currency", defaultJson: 50000, unit: "₹/mo" },
    { group: "salaries", key: "salary_delivery_coordinator",    label: "Delivery Coordinator",    kind: "input", dataType: "currency", defaultJson: 30000, unit: "₹/mo" },
    { group: "salaries", key: "salary_kitchen_manager",         label: "Kitchen Manager",         kind: "input", dataType: "currency", defaultJson: 55000, unit: "₹/mo" },
    { group: "salaries", key: "salary_warehouse_manager",       label: "Warehouse Manager",       kind: "input", dataType: "currency", defaultJson: 40000, unit: "₹/mo" },
    { group: "salaries", key: "salary_cook",                    label: "Cook",                    kind: "input", dataType: "currency", defaultJson: 50000, unit: "₹/mo" },
    { group: "salaries", key: "salary_helper_cook",             label: "Helper Cook",             kind: "input", dataType: "currency", defaultJson: 25000, unit: "₹/mo" },
    { group: "salaries", key: "salary_kitchen_loader",          label: "Kitchen Loader",          kind: "input", dataType: "currency", defaultJson: 25000, unit: "₹/mo" },
    { group: "salaries", key: "salary_chopping_cleaning",       label: "Chopping & Cleaning",     kind: "input", dataType: "currency", defaultJson: 20000, unit: "₹/mo" },
    { group: "salaries", key: "salary_food_loader",             label: "Food Loader",             kind: "input", dataType: "currency", defaultJson: 18000, unit: "₹/mo" },
    { group: "salaries", key: "salary_housekeeping",            label: "Housekeeping",            kind: "input", dataType: "currency", defaultJson: 15000, unit: "₹/mo" },
    { group: "salaries", key: "salary_dp_staff",                label: "DP Staff (per person)",   kind: "input", dataType: "currency", defaultJson: 6000,  unit: "₹/mo", notes: "Part-time ~3 hrs/day." },
    { group: "salaries", key: "truck_cost_per_month",           label: "Truck (driver + fuel + maint + rental, all-in)", kind: "input", dataType: "currency", defaultJson: 53100, unit: "₹/truck/mo", notes: "JustDelivery retainer." },

    // ── 5. Kitchen utilities ───────────────────────────────────────────────
    { group: "utilities_in", key: "electricity_per_month", label: "Electricity",         kind: "input", dataType: "currency", defaultJson: 75000, unit: "₹/kitchen/mo" },
    { group: "utilities_in", key: "water_bill_per_month",  label: "Water bill",          kind: "input", dataType: "currency", defaultJson: 40000, unit: "₹/kitchen/mo" },
    { group: "utilities_in", key: "cleaning_per_month",    label: "Cleaning",            kind: "input", dataType: "currency", defaultJson: 60000, unit: "₹/kitchen/mo" },
    { group: "utilities_in", key: "gas_per_month",         label: "Gas",                 kind: "input", dataType: "currency", defaultJson: 85000, unit: "₹/kitchen/mo" },
    { group: "utilities_in", key: "maintenance_per_month", label: "Maintenance & misc", kind: "input", dataType: "currency", defaultJson: 50000, unit: "₹/kitchen/mo" },

    // ── 6. DP consumables ──────────────────────────────────────────────────
    { group: "dp_in", key: "paper_plate_cost",                  label: "Paper plate cost",                    kind: "input", dataType: "currency", defaultJson: 1.30, unit: "₹/plate" },
    { group: "dp_in", key: "dustbin_cover_cost",                label: "Dustbin cover cost",                  kind: "input", dataType: "currency", defaultJson: 10,   unit: "₹/cover" },
    { group: "dp_in", key: "dustbin_covers_per_dp_per_month",   label: "Dustbin covers per DP per month",     kind: "input", dataType: "int",      defaultJson: 50,   unit: "covers/DP/mo" },
    { group: "dp_in", key: "gloves_cost",                       label: "Gloves cost",                         kind: "input", dataType: "currency", defaultJson: 5,    unit: "₹/pair" },
    { group: "dp_in", key: "gloves_per_dp_per_month",           label: "Gloves per DP per month",             kind: "input", dataType: "int",      defaultJson: 100,  unit: "pairs/DP/mo" },
    { group: "dp_in", key: "head_cap_cost",                     label: "Head cap cost",                       kind: "input", dataType: "currency", defaultJson: 2,    unit: "₹/cap" },
    { group: "dp_in", key: "head_caps_per_dp_per_month",        label: "Head caps per DP per month",          kind: "input", dataType: "int",      defaultJson: 50,   unit: "caps/DP/mo" },
    { group: "dp_in", key: "drinking_water_can_cost",           label: "Drinking water can cost",             kind: "input", dataType: "currency", defaultJson: 30,   unit: "₹/can" },
    { group: "dp_in", key: "drinking_water_cans_per_dp_per_month", label: "Drinking water cans per DP per month", kind: "input", dataType: "int",  defaultJson: 50,   unit: "cans/DP/mo" },
    { group: "dp_in", key: "apron_cost",                        label: "Apron cost",                          kind: "input", dataType: "currency", defaultJson: 500,  unit: "₹/apron" },
    { group: "dp_in", key: "aprons_per_dp_per_year",            label: "Aprons per DP per year",              kind: "input", dataType: "int",      defaultJson: 2,    unit: "aprons/DP/yr" },
    { group: "dp_in", key: "misc_per_dp_per_month",             label: "Misc DP supplies",                    kind: "input", dataType: "currency", defaultJson: 2000, unit: "₹/DP/mo" },

    // ── 7. Food cost ───────────────────────────────────────────────────────
    { group: "food_in", key: "food_cost_per_meal", label: "Food cost per meal", kind: "input", dataType: "currency", defaultJson: 29.40, unit: "₹/meal", notes: "Sampark/Ramani 29.40; CFAR/Wipro 20.00; in-house veg ref 21.91." },

    // ── 8. Programme structure (derived) ───────────────────────────────────
    { group: "structure", key: "trucks_required",     label: "Trucks required",                kind: "formula", dataType: "int",      formula: "MAX(1, CEILING(meals_per_day / meals_per_truck))", unit: "trucks" },
    { group: "structure", key: "dps_required",        label: "DPs required",                   kind: "formula", dataType: "int",      formula: "CEILING(meals_per_day / meals_per_dp)",            unit: "DPs" },
    { group: "structure", key: "dps_per_truck",       label: "DPs per truck (avg)",            kind: "formula", dataType: "number",   formula: "IFERROR(dps_required / trucks_required, 0)", unit: "DPs/truck", notes: "FILO loading caps this at ~3." },
    { group: "structure", key: "dp_visits_required",  label: "Total DP-visits required / week",kind: "formula", dataType: "int",      formula: "dps_required * visits_per_dp_week", unit: "visits/wk" },
    { group: "structure", key: "dp_visits_per_rp",    label: "DP-visits per RP per week",      kind: "formula", dataType: "int",      formula: "dps_per_rp_day * rp_days_per_week", unit: "visits/wk/RP" },

    // ── 9. RP team (derived) ───────────────────────────────────────────────
    { group: "rp_team", key: "kitchen_rps",        label: "Kitchen-RPs needed (one per kitchen)", kind: "formula", dataType: "int",    formula: "num_kitchens", unit: "RPs",      notes: "Pre-dawn audit is single-kitchen." },
    { group: "rp_team", key: "field_rps",          label: "Field-RPs needed (by DP-visit load)",  kind: "formula", dataType: "int",    formula: "CEILING(dp_visits_required / dp_visits_per_rp)", unit: "RPs" },
    { group: "rp_team", key: "rps_pre_buffer",     label: "Total RPs before buffer",              kind: "formula", dataType: "int",    formula: "MAX(kitchen_rps, field_rps)",                    unit: "RPs", notes: "Same person fills kitchen + field shifts." },
    { group: "rp_team", key: "total_rps",          label: "Total RPs required",                   kind: "formula", dataType: "int",    formula: "CEILING(rps_pre_buffer * buffer_factor)",        unit: "RPs", notes: "Headline number — staff to this." },
    { group: "rp_team", key: "rp_per_dp_ratio",    label: "RP : DP ratio",                        kind: "formula", dataType: "number", formula: "IFERROR(total_rps / dps_required, 0)",    unit: "RP/DP",    notes: "Sanity gauge. Launch ~0.2." },
    { group: "rp_team", key: "rp_per_truck_ratio", label: "RP : Truck ratio",                     kind: "formula", dataType: "number", formula: "IFERROR(total_rps / trucks_required, 0)", unit: "RP/truck", notes: "Below 0.5 means truck rotation slips." },

    // ── 10. RP monthly cost (derived) ──────────────────────────────────────
    { group: "rp_cost", key: "cost_rp_salary",        label: "RP salary cost (monthly)",         kind: "formula", dataType: "currency", formula: "total_rps * rp_salary_pm", unit: "₹/mo" },
    { group: "rp_cost", key: "cost_rp_2w",            label: "RP two-wheeler allowance (monthly)", kind: "formula", dataType: "currency", formula: "total_rps * rp_2w_pm", unit: "₹/mo" },
    { group: "rp_cost", key: "cost_rp_night_cab",     label: "RP night cabs (monthly)",          kind: "formula", dataType: "currency", formula: "total_rps * days_per_month * rp_night_cab", unit: "₹/mo" },
    { group: "rp_cost", key: "cost_rp_buffer_cab",    label: "RP buffer cabs (monthly)",         kind: "formula", dataType: "currency", formula: "total_rps * rp_buffer_cab", unit: "₹/mo" },
    { group: "rp_cost", key: "cost_rp_total_monthly", label: "Total RP cost (monthly)",          kind: "formula", dataType: "currency", formula: "cost_rp_salary + cost_rp_2w + cost_rp_night_cab + cost_rp_buffer_cab", unit: "₹/mo", notes: "Add this line to the grant budget." },
    { group: "rp_cost", key: "rp_cost_per_meal",      label: "RP cost per meal",                 kind: "formula", dataType: "currency", formula: "IFERROR(cost_rp_total_monthly / (meals_per_day * days_per_month), 0)", unit: "₹/meal", notes: "Compare against Wipro ₹20 / Ramani ₹29.40 production cost." },

    // ── 11. Staffing headcount (derived) ───────────────────────────────────
    { group: "headcount", key: "hc_programme_coordinator",   label: "Programme Coordinator HC",   kind: "constant", dataType: "int", defaultJson: 1, unit: "people" },
    { group: "headcount", key: "hc_procurement_coordinator", label: "Procurement Coordinator HC", kind: "constant", dataType: "int", defaultJson: 1, unit: "people" },
    { group: "headcount", key: "hc_delivery_coordinator",    label: "Delivery Coordinator HC",    kind: "constant", dataType: "int", defaultJson: 1, unit: "people" },
    { group: "headcount", key: "hc_kitchen_manager",   label: "Kitchen Manager HC",   kind: "formula", dataType: "int", formula: "CEILING(meals_per_day / meals_per_kitchen_manager)",   unit: "people" },
    { group: "headcount", key: "hc_warehouse_manager", label: "Warehouse Manager HC", kind: "formula", dataType: "int", formula: "CEILING(meals_per_day / meals_per_warehouse_manager)", unit: "people" },
    { group: "headcount", key: "hc_cook",              label: "Cook HC",              kind: "formula", dataType: "int", formula: "CEILING(meals_per_day / meals_per_cook)",              unit: "people" },
    { group: "headcount", key: "hc_helper_cook",       label: "Helper Cook HC",       kind: "formula", dataType: "int", formula: "CEILING(meals_per_day / meals_per_helper_cook)",       unit: "people" },
    { group: "headcount", key: "hc_kitchen_loader",    label: "Kitchen Loader HC",    kind: "formula", dataType: "int", formula: "CEILING(meals_per_day / meals_per_kitchen_loader)",    unit: "people" },
    { group: "headcount", key: "hc_chopping_cleaning", label: "Chopping & Cleaning HC", kind: "formula", dataType: "int", formula: "CEILING(meals_per_day / meals_per_chopping_cleaning)", unit: "people" },
    { group: "headcount", key: "hc_food_loader",       label: "Food Loader HC",       kind: "formula", dataType: "int", formula: "CEILING(meals_per_day / meals_per_food_loader)",       unit: "people" },
    { group: "headcount", key: "hc_housekeeping",      label: "Housekeeping HC",      kind: "formula", dataType: "int", formula: "CEILING(meals_per_day / meals_per_housekeeping)",      unit: "people" },
    { group: "headcount", key: "hc_truck_driver",      label: "Truck drivers HC",     kind: "formula", dataType: "int", formula: "trucks_required", unit: "people", notes: "Rolled into truck_cost_per_month but counted here." },
    { group: "headcount", key: "hc_dp_staff",          label: "DP Staff HC",          kind: "formula", dataType: "int", formula: "dp_staff_per_dp * dps_required", unit: "people" },
    { group: "headcount", key: "hc_rps",               label: "Resource Persons HC",  kind: "formula", dataType: "int", formula: "total_rps", unit: "people" },
    { group: "headcount", key: "total_headcount",      label: "Total programme headcount", kind: "formula", dataType: "int",
      formula: "hc_programme_coordinator + hc_procurement_coordinator + hc_delivery_coordinator + hc_kitchen_manager + hc_warehouse_manager + hc_cook + hc_helper_cook + hc_kitchen_loader + hc_chopping_cleaning + hc_food_loader + hc_housekeeping + hc_truck_driver + hc_dp_staff + hc_rps",
      unit: "people" },

    // ── 12. Staffing monthly cost (derived) ────────────────────────────────
    { group: "staff_cost", key: "cost_programme_coordinator",   label: "Programme Coordinator cost",   kind: "formula", dataType: "currency", formula: "hc_programme_coordinator * salary_programme_coordinator",     unit: "₹/mo" },
    { group: "staff_cost", key: "cost_procurement_coordinator", label: "Procurement Coordinator cost", kind: "formula", dataType: "currency", formula: "hc_procurement_coordinator * salary_procurement_coordinator", unit: "₹/mo" },
    { group: "staff_cost", key: "cost_delivery_coordinator",    label: "Delivery Coordinator cost",    kind: "formula", dataType: "currency", formula: "hc_delivery_coordinator * salary_delivery_coordinator",       unit: "₹/mo" },
    { group: "staff_cost", key: "cost_kitchen_manager",         label: "Kitchen Manager cost",         kind: "formula", dataType: "currency", formula: "hc_kitchen_manager * salary_kitchen_manager",         unit: "₹/mo" },
    { group: "staff_cost", key: "cost_warehouse_manager",       label: "Warehouse Manager cost",       kind: "formula", dataType: "currency", formula: "hc_warehouse_manager * salary_warehouse_manager",     unit: "₹/mo" },
    { group: "staff_cost", key: "cost_cook",                    label: "Cook cost",                    kind: "formula", dataType: "currency", formula: "hc_cook * salary_cook",                               unit: "₹/mo" },
    { group: "staff_cost", key: "cost_helper_cook",             label: "Helper Cook cost",             kind: "formula", dataType: "currency", formula: "hc_helper_cook * salary_helper_cook",                 unit: "₹/mo" },
    { group: "staff_cost", key: "cost_kitchen_loader",          label: "Kitchen Loader cost",          kind: "formula", dataType: "currency", formula: "hc_kitchen_loader * salary_kitchen_loader",           unit: "₹/mo" },
    { group: "staff_cost", key: "cost_chopping_cleaning",       label: "Chopping & Cleaning cost",     kind: "formula", dataType: "currency", formula: "hc_chopping_cleaning * salary_chopping_cleaning",     unit: "₹/mo" },
    { group: "staff_cost", key: "cost_food_loader",             label: "Food Loader cost",             kind: "formula", dataType: "currency", formula: "hc_food_loader * salary_food_loader",                 unit: "₹/mo" },
    { group: "staff_cost", key: "cost_housekeeping",            label: "Housekeeping cost",            kind: "formula", dataType: "currency", formula: "hc_housekeeping * salary_housekeeping",               unit: "₹/mo" },
    { group: "staff_cost", key: "cost_trucks",                  label: "Trucks (all-in) cost",         kind: "formula", dataType: "currency", formula: "trucks_required * truck_cost_per_month",              unit: "₹/mo", notes: "Driver + fuel + maint + rental; do not add driver separately." },
    { group: "staff_cost", key: "cost_dp_staff",                label: "DP Staff cost",                kind: "formula", dataType: "currency", formula: "hc_dp_staff * salary_dp_staff",                       unit: "₹/mo" },
    { group: "staff_cost", key: "cost_staff_total_monthly",     label: "Staffing total (monthly, ex-RPs)", kind: "formula", dataType: "currency",
      formula: "cost_programme_coordinator + cost_procurement_coordinator + cost_delivery_coordinator + cost_kitchen_manager + cost_warehouse_manager + cost_cook + cost_helper_cook + cost_kitchen_loader + cost_chopping_cleaning + cost_food_loader + cost_housekeeping + cost_trucks + cost_dp_staff",
      unit: "₹/mo" },

    // ── 13. Utilities monthly cost (derived) ───────────────────────────────
    { group: "utilities", key: "cost_utilities_total_monthly", label: "Kitchen utilities (monthly)", kind: "formula", dataType: "currency",
      formula: "num_kitchens * (electricity_per_month + water_bill_per_month + cleaning_per_month + gas_per_month + maintenance_per_month)",
      unit: "₹/mo" },

    // ── 14. DP consumables monthly (derived) ───────────────────────────────
    { group: "consumables", key: "cost_paper_plates",      label: "Paper plates",        kind: "formula", dataType: "currency", formula: "paper_plate_cost * meals_per_day * days_per_month",                          unit: "₹/mo" },
    { group: "consumables", key: "cost_dustbin_covers",    label: "Dustbin covers",      kind: "formula", dataType: "currency", formula: "dustbin_cover_cost * dps_required * dustbin_covers_per_dp_per_month",       unit: "₹/mo" },
    { group: "consumables", key: "cost_gloves",            label: "Gloves",              kind: "formula", dataType: "currency", formula: "gloves_cost * dps_required * gloves_per_dp_per_month",                     unit: "₹/mo" },
    { group: "consumables", key: "cost_head_caps",         label: "Head caps",           kind: "formula", dataType: "currency", formula: "head_cap_cost * dps_required * head_caps_per_dp_per_month",                unit: "₹/mo" },
    { group: "consumables", key: "cost_drinking_water",    label: "Drinking water cans", kind: "formula", dataType: "currency", formula: "drinking_water_can_cost * dps_required * drinking_water_cans_per_dp_per_month", unit: "₹/mo" },
    { group: "consumables", key: "cost_aprons_monthly",    label: "Aprons (annualised)", kind: "formula", dataType: "currency", formula: "apron_cost * dps_required * aprons_per_dp_per_year / 12",                   unit: "₹/mo" },
    { group: "consumables", key: "cost_misc_dp",           label: "Misc DP supplies",    kind: "formula", dataType: "currency", formula: "misc_per_dp_per_month * dps_required",                                       unit: "₹/mo" },
    { group: "consumables", key: "cost_consumables_total_monthly", label: "DP consumables (monthly)", kind: "formula", dataType: "currency",
      formula: "cost_paper_plates + cost_dustbin_covers + cost_gloves + cost_head_caps + cost_drinking_water + cost_aprons_monthly + cost_misc_dp",
      unit: "₹/mo" },

    // ── 15. Programme totals (derived) ─────────────────────────────────────
    { group: "totals", key: "cost_food_total_monthly",      label: "Food cost (monthly)",        kind: "formula", dataType: "currency", formula: "food_cost_per_meal * meals_per_day * days_per_month",                                unit: "₹/mo" },
    { group: "totals", key: "cost_grand_total_monthly",     label: "Grand total — monthly cost", kind: "formula", dataType: "currency",
      formula: "cost_staff_total_monthly + cost_rp_total_monthly + cost_utilities_total_monthly + cost_consumables_total_monthly + cost_food_total_monthly",
      unit: "₹/mo", notes: "RP cost is reported separately above and included here." },
    { group: "totals", key: "cost_grand_total_annual",      label: "Grand total — annual cost",  kind: "formula", dataType: "currency", formula: "cost_grand_total_monthly * 12", unit: "₹/yr" },
    { group: "totals", key: "cost_per_meal_all_in",         label: "Cost per meal (all-in)",     kind: "formula", dataType: "currency", formula: "IFERROR(cost_grand_total_monthly / (meals_per_day * days_per_month), 0)", unit: "₹/meal" },
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
        order: i,
      },
    });
  }

  type OutputIn = { key: string; label: string; kind: string; config: Record<string, unknown>; order: number };

  const outputs: OutputIn[] = [
    // KPI cards (headline metrics).
    { key: "kpi_total_rps",        label: "Total RPs required",        kind: "kpi", order: 0, config: { nodeKey: "total_rps", format: "number" } },
    { key: "kpi_total_headcount",  label: "Total programme headcount", kind: "kpi", order: 1, config: { nodeKey: "total_headcount", format: "number" } },
    { key: "kpi_trucks",           label: "Trucks required",           kind: "kpi", order: 2, config: { nodeKey: "trucks_required", format: "number" } },
    { key: "kpi_dps",              label: "DPs required",              kind: "kpi", order: 3, config: { nodeKey: "dps_required", format: "number" } },
    { key: "kpi_rp_cost_monthly",  label: "RP cost (monthly)",         kind: "kpi", order: 4, config: { nodeKey: "cost_rp_total_monthly", format: "currency" } },
    { key: "kpi_grand_monthly",    label: "Grand total monthly",       kind: "kpi", order: 5, config: { nodeKey: "cost_grand_total_monthly", format: "currency" } },
    { key: "kpi_grand_annual",     label: "Grand total annual",        kind: "kpi", order: 6, config: { nodeKey: "cost_grand_total_annual", format: "currency" } },
    { key: "kpi_cost_per_meal",    label: "Cost per meal (all-in)",    kind: "kpi", order: 7, config: { nodeKey: "cost_per_meal_all_in", format: "currency" } },

    // Promote to a 12-month grant budget under FoodDistribution domain.
    { key: "budget_export_year1", label: "Promote to Budget (12-month)", kind: "budgetExport", order: 30,
      config: {
        domainName: "FoodDistribution",
        years: 1,
        // Capex: none here (vendor-procured). In-house variant would add kitchen_equipment.
        capexLines: [],
        opexLines: [
          { nodeKey: "cost_programme_coordinator",   itemKey: "food.programme_coordinator_salary",   description: "Programme Coordinator", monthsToProject: 12, unitMultiplier: "hc_programme_coordinator" },
          { nodeKey: "cost_procurement_coordinator", itemKey: "food.procurement_coordinator_salary", description: "Procurement Coordinator", monthsToProject: 12 },
          { nodeKey: "cost_delivery_coordinator",    itemKey: "food.delivery_coordinator_salary",    description: "Delivery Coordinator",    monthsToProject: 12 },
          { nodeKey: "cost_kitchen_manager",         itemKey: "food.kitchen_manager_salary",         description: "Kitchen Manager",         monthsToProject: 12 },
          { nodeKey: "cost_warehouse_manager",       itemKey: "food.warehouse_manager_salary",       description: "Warehouse Manager",       monthsToProject: 12 },
          { nodeKey: "cost_cook",                    itemKey: "food.cook_salary",                    description: "Cook",                    monthsToProject: 12 },
          { nodeKey: "cost_helper_cook",             itemKey: "food.helper_cook_salary",             description: "Helper Cook",             monthsToProject: 12 },
          { nodeKey: "cost_kitchen_loader",          itemKey: "food.kitchen_loader_salary",          description: "Kitchen Loader",          monthsToProject: 12 },
          { nodeKey: "cost_chopping_cleaning",       itemKey: "food.chopping_cleaning_salary",       description: "Chopping & Cleaning",     monthsToProject: 12 },
          { nodeKey: "cost_food_loader",             itemKey: "food.food_loader_salary",             description: "Food Loader",             monthsToProject: 12 },
          { nodeKey: "cost_housekeeping",            itemKey: "food.housekeeping_salary",            description: "Housekeeping",            monthsToProject: 12 },
          { nodeKey: "cost_trucks",                  itemKey: "food.truck_cost_per_month",           description: "Trucks (driver + fuel + maint + rental)", monthsToProject: 12 },
          { nodeKey: "cost_dp_staff",                itemKey: "food.dp_staff_remuneration_per_month",description: "DP Staff",                monthsToProject: 12 },
          { nodeKey: "cost_rp_total_monthly",        itemKey: "food.rp_total_monthly",               description: "Resource Persons (all-in: salary + 2W + cabs)", monthsToProject: 12 },
          { nodeKey: "cost_utilities_total_monthly", itemKey: "food.utilities_total_monthly",        description: "Kitchen utilities (electricity, water, cleaning, gas, maintenance)", monthsToProject: 12 },
          { nodeKey: "cost_consumables_total_monthly", itemKey: "food.consumables_total_monthly",    description: "DP consumables (plates, gloves, caps, water cans, aprons, misc)", monthsToProject: 12 },
          { nodeKey: "cost_food_total_monthly",      itemKey: "food.cost_per_meal",                  description: "Food production (vendor / in-house)", monthsToProject: 12 },
        ],
      },
    },
  ];

  for (const o of outputs) {
    await prisma.modelOutput.create({
      data: { templateId: template.id, key: o.key, label: o.label, kind: o.kind, config: o.config as never, order: o.order },
    });
  }

  // Default instance — Sampark scenario (1,500 meals/day, 1 kitchen, vendor food).
  await prisma.modelInstance.create({
    data: {
      templateId: template.id,
      name: "Sampark — Launch (1,500 meals/day)",
      scenarioName: "Base",
      inputsJson: {},
    },
  });

  console.log(`Seeded template ${TEMPLATE_KEY}: ${nodes.length} nodes, ${outputs.length} outputs.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
