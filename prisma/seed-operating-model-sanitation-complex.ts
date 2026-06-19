// Sanitation Complex (multi-service) — operating-model template.
// Translated from /Users/vishnuharikumar/Downloads/Sanitation_Complex_Financial_Model_2.xlsx
// (11 sheets: README, Summary, Cost_Recovery, Inputs, Capex, Opex, Revenue,
// PnL_Monthly, PnL_Annual, Scenarios, Sensitivity).
//
// Run:  npx tsx prisma/seed-operating-model-sanitation-complex.ts

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEMPLATE_KEY = "sanitation_complex";

async function main() {
  await prisma.modelTemplate.deleteMany({ where: { key: TEMPLATE_KEY } });

  const template = await prisma.modelTemplate.create({
    data: {
      key: TEMPLATE_KEY,
      name: "Sanitation Complex (multi-service)",
      description:
        "Multi-service community sanitation complex: toilet, bath, laundry, RO water, monthly pass. " +
        "60-month / 5-year horizon. Translated from the v2 Excel model.",
      horizons: [
        { key: "monthly", length: 60 },
        { key: "annual", length: 5 },
      ],
      sortOrder: 20,
    },
  });

  const groupDefs = [
    ["site", "Site & Population"],
    ["capacity", "Service Capacity"],
    ["usage", "Service Usage"],
    ["adoption", "Adoption Curve"],
    ["pricing", "Pricing per Service"],
    ["capex_in", "Capital Expenditure"],
    ["opex_in", "Operating Expenses"],
    ["equity", "Equity & Social Access"],
    ["financial", "Financial Parameters"],
    ["capex", "Capex (derived)"],
    ["opex", "Opex (derived)"],
    ["revenue", "Revenue (derived)"],
    ["pnl", "P&L (derived)"],
    ["cost_recovery", "Cost Recovery"],
    ["ops", "Operations (sim)"],
  ] as const;
  // Capex/financial inputs are finance-only (vanish on the sim tab); ops is
  // sim-only; everything else shows on both.
  const groupSurface: Record<string, "finance" | "sim" | "both"> = {
    capex_in: "finance", financial: "finance", ops: "sim",
  };
  const groups: Record<string, string> = {};
  for (let i = 0; i < groupDefs.length; i++) {
    const [key, label] = groupDefs[i];
    const g = await prisma.modelGroup.create({
      data: { templateId: template.id, key, label, order: i, surface: groupSurface[key] ?? "both" },
    });
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
    surface?: "finance" | "sim" | "both";
    tier?: "basic" | "advanced";
    ui?: { min?: number; max?: number; step?: number };
  };

  const nodes: NodeIn[] = [
    // ── 1. Site & Population ───────────────────────────────────────────────
    { group: "site", key: "hh_count", label: "Households in service area", kind: "input", dataType: "int", defaultJson: 420, unit: "HH", ui: { min: 100, max: 800, step: 10 } },
    { group: "site", key: "persons_per_hh", label: "Persons per household", kind: "input", dataType: "number", defaultJson: 5, unit: "persons", ui: { min: 3, max: 8, step: 0.5 } },
    { group: "site", key: "daily_users_estimate", label: "Daily users (estimated)", kind: "input", dataType: "int", defaultJson: 500, unit: "users/day", notes: "At steady state", surface: "finance" },

    // ── 2. Service Capacity ────────────────────────────────────────────────
    { group: "capacity", key: "wc_seats", label: "Total WC seats (M+F+DA)", kind: "input", dataType: "int", defaultJson: 30, unit: "seats", notes: "Per SBM 1:20 ratio", ui: { min: 6, max: 60, step: 2 } },
    { group: "capacity", key: "bath_cubicles", label: "Bathing cubicles", kind: "input", dataType: "int", defaultJson: 8, unit: "cubicles", ui: { min: 0, max: 20, step: 1 } },
    { group: "capacity", key: "washing_machines", label: "Washing machines", kind: "input", dataType: "int", defaultJson: 4, unit: "machines", ui: { min: 0, max: 12, step: 1 } },
    { group: "capacity", key: "ro_lph", label: "RO Water ATM capacity", kind: "input", dataType: "int", defaultJson: 1000, unit: "L/hour", ui: { min: 250, max: 2000, step: 50 } },
    { group: "capacity", key: "ro_operating_hours", label: "RO plant daily operating hours", kind: "input", dataType: "number", defaultJson: 12, unit: "hours/day", notes: "Plant runs a window from 6am, banking into the RO tank", ui: { min: 4, max: 24, step: 1 } },
    { group: "capacity", key: "facility_open_hours", label: "Complex open hours", kind: "input", dataType: "number", defaultJson: 16, unit: "hours/day", notes: "Toilet/bath/laundry only serve while open (from 6am); closed-hour demand shifts into the open window", ui: { min: 6, max: 24, step: 1 } },
    { group: "capacity", key: "stp_kld", label: "Greywater treatment capacity", kind: "input", dataType: "number", defaultJson: 12, unit: "KL/day", notes: "MBBR-based packaged unit", ui: { min: 4, max: 30, step: 1 } },
    // RO buffers — sim-relevant but real spec, so "both".
    { group: "capacity", key: "ro_tank_litres", label: "RO product tank size", kind: "input", dataType: "int", defaultJson: 4000, unit: "L", ui: { min: 1000, max: 8000, step: 250 } },
    { group: "capacity", key: "ro_cans_count", label: "RO pre-packed 10 L cans", kind: "input", dataType: "int", defaultJson: 50, unit: "cans", ui: { min: 0, max: 150, step: 5 } },

    // ── 3. Service Usage Assumptions ───────────────────────────────────────
    { group: "usage", key: "toilet_uses_per_person_per_day", label: "Toilet uses per active person/day", kind: "input", dataType: "number", defaultJson: 3, unit: "uses/day", ui: { min: 1, max: 6, step: 0.5 } },
    { group: "usage", key: "bath_share", label: "% of active users who bathe", kind: "input", dataType: "percent", defaultJson: 0.20, unit: "%", ui: { min: 0.05, max: 0.6, step: 0.05 } },
    { group: "usage", key: "laundry_loads_per_machine_per_day", label: "Laundry loads per machine per day", kind: "input", dataType: "number", defaultJson: 3.5, unit: "loads/day", surface: "finance" },
    { group: "usage", key: "ro_litres_per_active_hh_per_day", label: "RO litres per active HH/day", kind: "input", dataType: "number", defaultJson: 18, unit: "L/HH/day", ui: { min: 4, max: 25, step: 1 } },

    // ── 4. Adoption Curve ──────────────────────────────────────────────────
    // Ramp months are finance-only; the sim runs at steady adoption_y3.
    { group: "adoption", key: "adoption_m3", label: "Month 3 adoption", kind: "input", dataType: "percent", defaultJson: 0.25, unit: "% of HH", surface: "finance" },
    { group: "adoption", key: "adoption_m6", label: "Month 6 adoption", kind: "input", dataType: "percent", defaultJson: 0.45, unit: "% of HH", surface: "finance" },
    { group: "adoption", key: "adoption_m12", label: "Month 12 adoption", kind: "input", dataType: "percent", defaultJson: 0.65, unit: "% of HH", surface: "finance" },
    { group: "adoption", key: "adoption_y2", label: "Year 2 average adoption", kind: "input", dataType: "percent", defaultJson: 0.75, unit: "% of HH", surface: "finance" },
    { group: "adoption", key: "adoption_y3", label: "Year 3+ adoption (steady state)", kind: "input", dataType: "percent", defaultJson: 0.80, unit: "% of HH", ui: { min: 0.2, max: 1, step: 0.05 } },

    // ── 5. Pricing per Service ─────────────────────────────────────────────
    { group: "pricing", key: "price_toilet", label: "Toilet — per use", kind: "input", dataType: "currency", defaultJson: 2, unit: "INR/use", ui: { min: 0, max: 6, step: 0.5 } },
    { group: "pricing", key: "price_bath", label: "Bath — per use", kind: "input", dataType: "currency", defaultJson: 8, unit: "INR/bath", ui: { min: 0, max: 25, step: 1 } },
    { group: "pricing", key: "price_laundry", label: "Laundry — per load", kind: "input", dataType: "currency", defaultJson: 50, unit: "INR/load", ui: { min: 0, max: 100, step: 5 } },
    { group: "pricing", key: "price_ro_per_litre", label: "RO water — per litre", kind: "input", dataType: "currency", defaultJson: 2, unit: "INR/L", ui: { min: 0, max: 5, step: 0.25 } },
    { group: "pricing", key: "monthly_pass_price", label: "Monthly household pass", kind: "input", dataType: "currency", defaultJson: 150, unit: "INR/HH/mo", ui: { min: 0, max: 400, step: 10 } },
    { group: "pricing", key: "pass_holder_share", label: "% active HH on monthly pass", kind: "input", dataType: "percent", defaultJson: 0.40, unit: "%", ui: { min: 0, max: 0.8, step: 0.05 } },

    // ── 6. Capex inputs ────────────────────────────────────────────────────
    { group: "capex_in", key: "capex_civil", label: "Civil construction", kind: "input", dataType: "currency", defaultJson: 5800000, unit: "INR" },
    { group: "capex_in", key: "capex_plumbing", label: "Plumbing + sanitaryware", kind: "input", dataType: "currency", defaultJson: 1150000, unit: "INR" },
    { group: "capex_in", key: "capex_washing_machines", label: "Washing machines + spin dryers", kind: "input", dataType: "currency", defaultJson: 480000, unit: "INR" },
    { group: "capex_in", key: "capex_ro", label: "RO plant + Water ATM", kind: "input", dataType: "currency", defaultJson: 650000, unit: "INR" },
    { group: "capex_in", key: "capex_stp", label: "Greywater MBBR STP", kind: "input", dataType: "currency", defaultJson: 1350000, unit: "INR" },
    { group: "capex_in", key: "capex_biodigester", label: "Biodigester / septic", kind: "input", dataType: "currency", defaultJson: 580000, unit: "INR" },
    { group: "capex_in", key: "capex_tanks", label: "Storage tanks (UG + OH)", kind: "input", dataType: "currency", defaultJson: 390000, unit: "INR" },
    { group: "capex_in", key: "capex_solar", label: "Solar PV system (5 kWp)", kind: "input", dataType: "currency", defaultJson: 450000, unit: "INR" },
    { group: "capex_in", key: "capex_electrical", label: "Electrical works", kind: "input", dataType: "currency", defaultJson: 520000, unit: "INR" },
    { group: "capex_in", key: "capex_iot", label: "Payment + IoT monitoring", kind: "input", dataType: "currency", defaultJson: 180000, unit: "INR" },
    { group: "capex_in", key: "capex_approval", label: "Approval fees", kind: "input", dataType: "currency", defaultJson: 173000, unit: "INR" },
    { group: "capex_in", key: "capex_design", label: "Design + supervision", kind: "input", dataType: "currency", defaultJson: 650000, unit: "INR" },
    { group: "capex_in", key: "capex_signage", label: "Signage, accessibility, furnishings", kind: "input", dataType: "currency", defaultJson: 150000, unit: "INR" },
    { group: "capex_in", key: "capex_contingency_pct", label: "Contingency (% of subtotal)", kind: "input", dataType: "percent", defaultJson: 0.10, unit: "%" },
    { group: "capex_in", key: "capex_tax_pct", label: "GST & other taxes (% of subtotal)", kind: "input", dataType: "percent", defaultJson: 0.05, unit: "%" },

    // ── 7. Opex inputs ─────────────────────────────────────────────────────
    { group: "opex_in", key: "salary_caretaker_per_shift", label: "Caretaker — per shift", kind: "input", dataType: "currency", defaultJson: 12000, unit: "INR/shift/mo", notes: "3 shifts" },
    { group: "opex_in", key: "salary_plant_operator", label: "Plant operator (RO + STP)", kind: "input", dataType: "currency", defaultJson: 10000, unit: "INR/mo" },
    { group: "opex_in", key: "salary_laundry_supervisor", label: "Laundry supervisor", kind: "input", dataType: "currency", defaultJson: 8000, unit: "INR/mo" },
    { group: "opex_in", key: "salary_cbo_honorarium", label: "CBO management honorarium (Y2+)", kind: "input", dataType: "currency", defaultJson: 8000, unit: "INR/mo" },
    { group: "opex_in", key: "electricity_monthly", label: "Electricity (net of solar)", kind: "input", dataType: "currency", defaultJson: 18000, unit: "INR/mo" },
    { group: "opex_in", key: "water_bwssb_monthly", label: "Water (BWSSB net of greywater)", kind: "input", dataType: "currency", defaultJson: 8000, unit: "INR/mo" },
    { group: "opex_in", key: "cleaning_consumables_monthly", label: "Cleaning consumables", kind: "input", dataType: "currency", defaultJson: 6000, unit: "INR/mo" },
    { group: "opex_in", key: "laundry_detergent_monthly", label: "Laundry detergent (bulk)", kind: "input", dataType: "currency", defaultJson: 4000, unit: "INR/mo" },
    { group: "opex_in", key: "ro_consumables_monthly", label: "RO consumables", kind: "input", dataType: "currency", defaultJson: 4500, unit: "INR/mo" },
    { group: "opex_in", key: "stp_consumables_monthly", label: "STP consumables", kind: "input", dataType: "currency", defaultJson: 5000, unit: "INR/mo" },
    { group: "opex_in", key: "desludging_monthly_amortised", label: "Septic desludging (amortised)", kind: "input", dataType: "currency", defaultJson: 1500, unit: "INR/mo" },
    { group: "opex_in", key: "amc_monthly", label: "Maintenance / AMC reserve", kind: "input", dataType: "currency", defaultJson: 3000, unit: "INR/mo" },
    { group: "opex_in", key: "tech_monthly", label: "Technology / monitoring fee", kind: "input", dataType: "currency", defaultJson: 2500, unit: "INR/mo" },
    { group: "opex_in", key: "lab_quarterly", label: "Water quality testing (NABL)", kind: "input", dataType: "currency", defaultJson: 5000, unit: "INR/quarter" },

    // ── 8. Equity & Social Access ──────────────────────────────────────────
    { group: "equity", key: "free_use_quota", label: "Free-use quota (% of capacity)", kind: "input", dataType: "percent", defaultJson: 0.10, unit: "%", notes: "Reserved for poorest / disabled / elderly", ui: { min: 0, max: 0.4, step: 0.05 } },
    { group: "equity", key: "pilot_free_first_3mo", label: "Year-1 first 3 months free pilot", kind: "input", dataType: "boolean", defaultJson: 1, notes: "1 = give first 3 months free; 0 = charge from M3", surface: "finance" },

    // ── 9. Financial Parameters ────────────────────────────────────────────
    { group: "financial", key: "cost_inflation", label: "YoY cost inflation", kind: "input", dataType: "percent", defaultJson: 0.06, unit: "%" },
    { group: "financial", key: "price_increase", label: "YoY price increase", kind: "input", dataType: "percent", defaultJson: 0.05, unit: "%" },
    { group: "financial", key: "grant_share", label: "Capex grant funding share", kind: "input", dataType: "percent", defaultJson: 1.0, unit: "%" },
    { group: "financial", key: "discount_rate", label: "Discount rate (NPV)", kind: "input", dataType: "percent", defaultJson: 0.08, unit: "%" },

    // ── Capex derived ──────────────────────────────────────────────────────
    { group: "capex", key: "capex_subtotal", label: "Capex subtotal", kind: "formula", dataType: "currency",
      formula: "capex_civil + capex_plumbing + capex_washing_machines + capex_ro + capex_stp + capex_biodigester + capex_tanks + capex_solar + capex_electrical + capex_iot + capex_approval + capex_design + capex_signage",
      unit: "INR" },
    { group: "capex", key: "capex_contingency", label: "Contingency", kind: "formula", dataType: "currency", formula: "capex_subtotal * capex_contingency_pct", unit: "INR" },
    { group: "capex", key: "capex_tax", label: "GST + taxes", kind: "formula", dataType: "currency", formula: "capex_subtotal * capex_tax_pct", unit: "INR" },
    { group: "capex", key: "capex_total", label: "TOTAL CAPEX", kind: "formula", dataType: "currency", formula: "capex_subtotal + capex_contingency + capex_tax", unit: "INR" },
    { group: "capex", key: "capex_per_wc_seat", label: "Capex per WC seat", kind: "formula", dataType: "currency", formula: "capex_total / wc_seats", unit: "INR/seat", notes: "SBM benchmark ≈ INR 98K/seat" },
    { group: "capex", key: "capex_per_hh", label: "Capex per household served", kind: "formula", dataType: "currency", formula: "capex_total / hh_count", unit: "INR/HH" },

    // ── Steady-state Opex (derived) ────────────────────────────────────────
    { group: "opex", key: "opex_caretakers", label: "Caretakers (3 shifts)", kind: "formula", dataType: "currency", formula: "salary_caretaker_per_shift * 3", unit: "INR/mo" },
    { group: "opex", key: "opex_lab_monthly", label: "Lab testing (monthly avg)", kind: "formula", dataType: "currency", formula: "lab_quarterly / 3", unit: "INR/mo" },
    { group: "opex", key: "opex_monthly_steady", label: "TOTAL monthly opex (steady)", kind: "formula", dataType: "currency",
      formula: "opex_caretakers + salary_plant_operator + salary_laundry_supervisor + salary_cbo_honorarium + electricity_monthly + water_bwssb_monthly + cleaning_consumables_monthly + laundry_detergent_monthly + ro_consumables_monthly + stp_consumables_monthly + desludging_monthly_amortised + amc_monthly + tech_monthly + opex_lab_monthly",
      unit: "INR/mo" },
    { group: "opex", key: "opex_annual_steady", label: "Annual opex (steady)", kind: "formula", dataType: "currency", formula: "opex_monthly_steady * 12", unit: "INR/yr" },

    // Per-service direct opex split + shared/overhead residual. Direct costs are
    // attributed by service; the residual (STP, plant ops, CBO, AMC, tech, lab,
    // remaining utilities/cleaning) is the shared pool. Σ direct + shared =
    // opex_monthly_steady exactly, so the sim's per-service P&L reconciles.
    { group: "opex", key: "opex_toilet_monthly", label: "Toilet — direct opex (monthly)", kind: "formula", dataType: "currency",
      formula: "opex_caretakers * 0.4 + cleaning_consumables_monthly * 0.55 + desludging_monthly_amortised + water_bwssb_monthly * 0.3", unit: "INR/mo" },
    { group: "opex", key: "opex_bath_monthly", label: "Bath — direct opex (monthly)", kind: "formula", dataType: "currency",
      formula: "opex_caretakers * 0.25 + cleaning_consumables_monthly * 0.25 + water_bwssb_monthly * 0.45", unit: "INR/mo" },
    { group: "opex", key: "opex_laundry_monthly", label: "Laundry — direct opex (monthly)", kind: "formula", dataType: "currency",
      formula: "salary_laundry_supervisor + laundry_detergent_monthly + electricity_monthly * 0.25 + water_bwssb_monthly * 0.15", unit: "INR/mo" },
    { group: "opex", key: "opex_ro_monthly", label: "RO water — direct opex (monthly)", kind: "formula", dataType: "currency",
      formula: "salary_plant_operator * 0.5 + ro_consumables_monthly + electricity_monthly * 0.3", unit: "INR/mo" },
    { group: "opex", key: "opex_shared_monthly", label: "Shared / overhead opex (monthly)", kind: "formula", dataType: "currency",
      formula: "opex_monthly_steady - opex_toilet_monthly - opex_bath_monthly - opex_laundry_monthly - opex_ro_monthly", unit: "INR/mo",
      notes: "Residual: STP, plant ops, CBO, AMC, tech, lab, remaining utilities/cleaning" },

    // ── Monthly adoption curve (60-month vector) ───────────────────────────
    { group: "revenue", key: "adoption_monthly", label: "Adoption (monthly)", kind: "formula", dataType: "percent",
      shape: { kind: "vector", horizon: "monthly" },
      formula:
        "IF(T < 2, 0, " +
        "IF(T <= 5, adoption_m3 + (adoption_m6 - adoption_m3) * (T - 2) / 3, " +
        "IF(T <= 11, adoption_m6 + (adoption_m12 - adoption_m6) * (T - 5) / 6, " +
        "IF(T < 24, adoption_y2, adoption_y3))))",
      unit: "%" },
    { group: "revenue", key: "active_hh_monthly", label: "Active households (monthly)", kind: "formula", dataType: "number",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "adoption_monthly * hh_count", unit: "HH" },
    { group: "revenue", key: "active_persons_monthly", label: "Active persons (monthly)", kind: "formula", dataType: "number",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "active_hh_monthly * persons_per_hh", unit: "persons" },
    // Pilot multiplier: 1 if charging (not in free pilot), 0 if in free pilot.
    // Free pilot covers months 1–3 (T=0,1,2). Excel: IF(AND(pilot=1, month<=3), 0, 1).
    { group: "revenue", key: "pilot_pay_factor", label: "Pilot pay factor (0/1 per month)", kind: "formula", dataType: "number",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "IF(pilot_free_first_3mo == 1 && T < 3, 0, 1)" },

    // Per-stream monthly revenue. Toilet/bath/laundry/RO charge per-use; pass
    // holders covered by their monthly fee (excluded via (1 - pass_share)).
    { group: "revenue", key: "rev_toilet_monthly", label: "Toilet revenue (monthly)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "active_persons_monthly * toilet_uses_per_person_per_day * 28 * price_toilet * (1 - free_use_quota) * (1 - pass_holder_share) * pilot_pay_factor",
      unit: "INR/mo" },
    { group: "revenue", key: "rev_bath_monthly", label: "Bath revenue (monthly)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "active_persons_monthly * bath_share * 28 * price_bath * (1 - free_use_quota) * (1 - pass_holder_share) * pilot_pay_factor",
      unit: "INR/mo" },
    // Excel: active_HH × (2/7) × 28 × price (≈ 2 loads per week per HH).
    { group: "revenue", key: "rev_laundry_monthly", label: "Laundry revenue (monthly)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "active_hh_monthly * (2 / 7) * 28 * price_laundry * (1 - pass_holder_share) * pilot_pay_factor",
      unit: "INR/mo" },
    { group: "revenue", key: "rev_ro_monthly", label: "RO water revenue (monthly)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "active_hh_monthly * ro_litres_per_active_hh_per_day * 28 * price_ro_per_litre * pilot_pay_factor",
      unit: "INR/mo" },
    { group: "revenue", key: "rev_pass_monthly", label: "Monthly pass revenue", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "active_hh_monthly * pass_holder_share * monthly_pass_price * pilot_pay_factor",
      unit: "INR/mo" },
    { group: "revenue", key: "revenue_monthly", label: "Total revenue (monthly)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "rev_toilet_monthly + rev_bath_monthly + rev_laundry_monthly + rev_ro_monthly + rev_pass_monthly",
      unit: "INR/mo" },

    // ── Monthly P&L ────────────────────────────────────────────────────────
    // Fixed opex starts from M3 (T>=2). Pre-launch months no opex except setup costs which are capex.
    // CBO honorarium only from Year 2 (T>=12).
    { group: "pnl", key: "opex_monthly_actual", label: "Opex (monthly, actual)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "monthly" },
      formula:
        "IF(T < 2, 0, " +
        "opex_caretakers + salary_plant_operator + salary_laundry_supervisor + electricity_monthly + water_bwssb_monthly + cleaning_consumables_monthly + laundry_detergent_monthly + ro_consumables_monthly + stp_consumables_monthly + desludging_monthly_amortised + amc_monthly + tech_monthly" +
        " + IF(T >= 12, salary_cbo_honorarium, 0)" +
        " + IF(T == 2, lab_quarterly, IF((T - 2) % 3 == 0, lab_quarterly, 0)))",
      unit: "INR/mo" },
    { group: "pnl", key: "ebitda_monthly", label: "EBITDA (monthly)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "monthly" },
      formula: "revenue_monthly - opex_monthly_actual",
      unit: "INR/mo" },

    // ── Annual rollups ─────────────────────────────────────────────────────
    // Y1 uses average adoption from M1-M12; Y2 = adoption_y2; Y3+ = adoption_y3.
    // Adoption ramp Y1 average:
    //   0 + 0 + adoption_m3 + (m3 + (m6-m3)*1/3) + (m3 + (m6-m3)*2/3) + m6
    //   + (m6 + (m12-m6)*1/6) + (m6 + (m12-m6)*2/6) + (m6 + (m12-m6)*3/6)
    //   + (m6 + (m12-m6)*4/6) + (m6 + (m12-m6)*5/6) + m12
    // /12. Algebraic simplification: (3*m3 + 5*m6 + 4*m12) / 12 (the months 1+2 contribute 0).
    // Verify: m1=0, m2=0, m3=m3, m4=m3+(m6-m3)/3, m5=m3+2(m6-m3)/3, m6=m6, m7..m11 ramp m6→m12, m12=m12.
    // Sum: 0+0+m3 + (m3+(m6-m3)/3) + (m3+2(m6-m3)/3) + m6 + sum_{k=1..5}(m6+k(m12-m6)/6) + m12
    //   = 3*m3 + (m6-m3) + m6 + (5*m6 + 15/6*(m12-m6)) + m12
    //   = 3*m3 + (m6-m3) + m6 + 5*m6 + 2.5*(m12-m6) + m12
    //   = 3*m3 - m3 + m6 + m6 + 5*m6 + 2.5*m12 - 2.5*m6 + m12
    //   = 2*m3 + 4.5*m6 + 3.5*m12
    //   /12. Use this closed form to avoid a 12-term formula.
    { group: "pnl", key: "adoption_annual", label: "Adoption (annual avg)", kind: "formula", dataType: "percent",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IF(T == 0, (2 * adoption_m3 + 4.5 * adoption_m6 + 3.5 * adoption_m12) / 12, IF(T == 1, adoption_y2, adoption_y3))",
      unit: "%" },
    { group: "pnl", key: "active_hh_annual", label: "Active households (annual)", kind: "formula", dataType: "number",
      shape: { kind: "vector", horizon: "annual" }, formula: "adoption_annual * hh_count" },
    { group: "pnl", key: "active_persons_annual", label: "Active persons (annual)", kind: "formula", dataType: "number",
      shape: { kind: "vector", horizon: "annual" }, formula: "active_hh_annual * persons_per_hh" },

    // Annual revenue per stream — applies price inflation (1+price_increase)^T.
    // Y1 picks up actual monthly sum (which includes pilot freebie); Y2+ uses
    // the steady annual formula (no pilot factor).
    { group: "pnl", key: "rev_toilet_annual", label: "Toilet revenue (annual)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IF(T == 0, SUM(rev_toilet_monthly, 0, 12), active_persons_annual * toilet_uses_per_person_per_day * 365 * price_toilet * (1 - free_use_quota) * (1 - pass_holder_share) * (1 + price_increase) ^ T)",
      unit: "INR/yr" },
    { group: "pnl", key: "rev_bath_annual", label: "Bath revenue (annual)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IF(T == 0, SUM(rev_bath_monthly, 0, 12), active_persons_annual * bath_share * 365 * price_bath * (1 - free_use_quota) * (1 - pass_holder_share) * (1 + price_increase) ^ T)",
      unit: "INR/yr" },
    { group: "pnl", key: "rev_laundry_annual", label: "Laundry revenue (annual)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IF(T == 0, SUM(rev_laundry_monthly, 0, 12), active_hh_annual * (2 / 7) * 365 * price_laundry * (1 - pass_holder_share) * (1 + price_increase) ^ T)",
      unit: "INR/yr" },
    { group: "pnl", key: "rev_ro_annual", label: "RO water revenue (annual)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IF(T == 0, SUM(rev_ro_monthly, 0, 12), active_hh_annual * ro_litres_per_active_hh_per_day * 365 * price_ro_per_litre * (1 + price_increase) ^ T)",
      unit: "INR/yr" },
    { group: "pnl", key: "rev_pass_annual", label: "Monthly pass revenue (annual)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IF(T == 0, SUM(rev_pass_monthly, 0, 12), active_hh_annual * pass_holder_share * monthly_pass_price * 12 * (1 + price_increase) ^ T)",
      unit: "INR/yr" },
    { group: "pnl", key: "revenue_annual", label: "Total revenue (annual)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "rev_toilet_annual + rev_bath_annual + rev_laundry_annual + rev_ro_annual + rev_pass_annual",
      unit: "INR/yr" },

    // Annual opex — Y1 uses 10/12 prorate for staff (commissioning months), Y2+ full.
    // CBO honorarium first kicks in at Y2.
    { group: "pnl", key: "opex_annual_staff", label: "Annual staff (inflated, Y1 prorated)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "(opex_caretakers + salary_plant_operator + salary_laundry_supervisor) * 12 * (1 + cost_inflation) ^ T * IF(T == 0, 10 / 12, 1)",
      unit: "INR/yr" },
    { group: "pnl", key: "opex_annual_cbo", label: "Annual CBO honorarium (Y2+)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IF(T == 0, 0, salary_cbo_honorarium * 12 * (1 + cost_inflation) ^ T)",
      unit: "INR/yr" },
    { group: "pnl", key: "opex_annual_utilities", label: "Annual utilities (inflated, Y1 prorated)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "(electricity_monthly + water_bwssb_monthly) * 12 * (1 + cost_inflation) ^ T * IF(T == 0, 10 / 12, 1)",
      unit: "INR/yr" },
    { group: "pnl", key: "opex_annual_consumables", label: "Annual consumables (inflated, Y1 prorated)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "(cleaning_consumables_monthly + laundry_detergent_monthly + ro_consumables_monthly + stp_consumables_monthly + desludging_monthly_amortised) * 12 * (1 + cost_inflation) ^ T * IF(T == 0, 10 / 12, 1)",
      unit: "INR/yr" },
    { group: "pnl", key: "opex_annual_amc_tech", label: "Annual AMC + tech (inflated, Y1 prorated)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "(amc_monthly + tech_monthly) * 12 * (1 + cost_inflation) ^ T * IF(T == 0, 10 / 12, 1)",
      unit: "INR/yr" },
    { group: "pnl", key: "opex_annual_lab", label: "Annual lab testing (Y1 3 visits, then 4)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "lab_quarterly * IF(T == 0, 3, 4) * (1 + cost_inflation) ^ T",
      unit: "INR/yr" },
    { group: "pnl", key: "opex_annual", label: "Total annual opex", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "opex_annual_staff + opex_annual_cbo + opex_annual_utilities + opex_annual_consumables + opex_annual_amc_tech + opex_annual_lab",
      unit: "INR/yr" },

    { group: "pnl", key: "ebitda_annual", label: "EBITDA (annual)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "revenue_annual - opex_annual", unit: "INR/yr" },
    { group: "pnl", key: "ebitda_margin_annual", label: "EBITDA margin (annual)", kind: "formula", dataType: "percent",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IFERROR(ebitda_annual / revenue_annual, 0)", unit: "%" },
    { group: "pnl", key: "capex_outflow_y1", label: "Capex outflow (after grant share)", kind: "formula", dataType: "currency",
      formula: "0 - capex_total * (1 - grant_share)", unit: "INR" },
    { group: "pnl", key: "npv_5yr", label: "NPV @ discount rate (5-yr)", kind: "formula", dataType: "currency",
      formula: "NPV(discount_rate, ebitda_annual) + capex_outflow_y1", unit: "INR" },

    // ── Cost Recovery ──────────────────────────────────────────────────────
    { group: "cost_recovery", key: "oss_ratio_annual", label: "Operational Self-Sufficiency (OSS)", kind: "formula", dataType: "number",
      shape: { kind: "vector", horizon: "annual" },
      formula: "IFERROR(revenue_annual / opex_annual, 0)",
      notes: "Above 1.0 = self-sustaining; 1.5+ = comfortable; 2.0+ = funder can step back" },
    // Replacement reserves — sanitation has many more assets with varied lifecycles.
    { group: "cost_recovery", key: "replacement_reserve_annual", label: "Annual replacement reserve required", kind: "formula", dataType: "currency",
      formula:
        "capex_civil * 0.1 / 20 + " +        // Civil shell — 10% major refurbishment / 20y
        "capex_plumbing * 0.5 / 10 + " +      // Plumbing — 50% / 10y
        "capex_washing_machines / 7 + " +     // WMs — 100% / 7y
        "capex_ro / 7 + " +                   // RO — 100% / 7y
        "capex_stp / 10 + " +                 // STP — 100% / 10y
        "capex_biodigester / 15 + " +
        "capex_tanks / 15 + " +
        "capex_solar * 0.6 / 10 + " +         // Solar — 60% blended panels+batteries / 10y
        "capex_electrical * 0.3 / 12 + " +
        "capex_iot / 5",
      unit: "INR/yr",
      notes: "Replacement scope × original capex ÷ asset lifecycle" },
    { group: "cost_recovery", key: "community_surplus_annual", label: "Community surplus (EBITDA − reserves)", kind: "formula", dataType: "currency",
      shape: { kind: "vector", horizon: "annual" },
      formula: "ebitda_annual - replacement_reserve_annual" },

    // ── Operations (sim-only) ─────────────────────────────────────────────
    { group: "ops", key: "peak_concentration", label: "Peak concentration", kind: "input", dataType: "number", defaultJson: 100, unit: "", notes: "Higher = sharper morning/evening rush", surface: "sim", ui: { min: 60, max: 200, step: 5 } },
    // Engineering throughput / recovery — advanced tier (hidden until toggled).
    { group: "ops", key: "seat_throughput", label: "WC throughput", kind: "input", dataType: "number", defaultJson: 12, unit: "uses/h/seat", surface: "sim", tier: "advanced", ui: { min: 6, max: 20, step: 1 } },
    { group: "ops", key: "bath_throughput", label: "Cubicle throughput", kind: "input", dataType: "number", defaultJson: 3, unit: "baths/h", surface: "sim", tier: "advanced", ui: { min: 1, max: 8, step: 0.5 } },
    { group: "ops", key: "machine_throughput", label: "Machine throughput", kind: "input", dataType: "number", defaultJson: 1.3, unit: "loads/h", surface: "sim", tier: "advanced", ui: { min: 0.5, max: 3, step: 0.1 } },
    { group: "ops", key: "ro_recovery_rate", label: "RO recovery rate", kind: "input", dataType: "percent", defaultJson: 0.55, unit: "%", surface: "sim", tier: "advanced", ui: { min: 0.3, max: 0.8, step: 0.05 } },
  ];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    await prisma.modelNode.create({
      data: {
        templateId: template.id, groupId: groups[n.group],
        key: n.key, label: n.label, kind: n.kind, dataType: n.dataType,
        shape: n.shape ?? { kind: "scalar" },
        defaultJson: n.defaultJson === undefined ? undefined : (n.defaultJson as never),
        formula: n.formula ?? null,
        unit: n.unit ?? null, notes: n.notes ?? null,
        surface: n.surface ?? "both",
        tier: n.tier ?? "basic",
        uiJson: n.ui === undefined ? undefined : (n.ui as never),
        order: i,
      },
    });
  }

  // ── Outputs ─────────────────────────────────────────────────────────────
  type OutputIn = { key: string; label: string; kind: string; config: Record<string, unknown>; order: number };
  const outputs: OutputIn[] = [
    { key: "kpi_total_capex",   label: "Total Capex",           kind: "kpi", order: 0, config: { nodeKey: "capex_total", format: "currency" } },
    { key: "kpi_per_seat",      label: "Capex / WC seat",       kind: "kpi", order: 1, config: { nodeKey: "capex_per_wc_seat", format: "currency" } },
    { key: "kpi_per_hh",        label: "Capex / HH",            kind: "kpi", order: 2, config: { nodeKey: "capex_per_hh", format: "currency" } },
    { key: "kpi_opex_steady",   label: "Monthly Opex (steady)", kind: "kpi", order: 3, config: { nodeKey: "opex_monthly_steady", format: "currency" } },
    { key: "kpi_y1_revenue",    label: "Year-1 Revenue",        kind: "kpi", order: 4, config: { nodeKey: "revenue_annual", index: 0, format: "currency" } },
    { key: "kpi_y3_ebitda",     label: "Year-3 EBITDA",         kind: "kpi", order: 5, config: { nodeKey: "ebitda_annual",  index: 2, format: "currency" } },
    { key: "kpi_y3_oss",        label: "Year-3 OSS ratio",      kind: "kpi", order: 6, config: { nodeKey: "oss_ratio_annual", index: 2, format: "number" } },
    { key: "kpi_npv",           label: "5-Year NPV",            kind: "kpi", order: 7, config: { nodeKey: "npv_5yr", format: "currency" } },

    // Revenue vs Opex vs EBITDA on one chart (monthly + annual), OSS standalone.
    { key: "series_pnl_m", label: "Monthly P&L — Revenue vs Opex vs EBITDA", kind: "seriesGroup", order: 10,
      config: {
        horizon: "monthly", format: "currency",
        series: [
          { nodeKey: "revenue_monthly",     label: "Revenue", color: "#10b981" },
          { nodeKey: "opex_monthly_actual", label: "Opex",    color: "#f59e0b" },
          { nodeKey: "ebitda_monthly",      label: "EBITDA",  color: "#2563eb" },
        ],
      },
    },
    { key: "series_pnl_y", label: "Annual P&L — Revenue vs Opex vs EBITDA", kind: "seriesGroup", order: 11,
      config: {
        horizon: "annual", format: "currency",
        series: [
          { nodeKey: "revenue_annual", label: "Revenue", color: "#10b981" },
          { nodeKey: "opex_annual",    label: "Opex",    color: "#f59e0b" },
          { nodeKey: "ebitda_annual",  label: "EBITDA",  color: "#2563eb" },
        ],
      },
    },
    { key: "series_oss_y", label: "OSS Ratio by Year", kind: "series", order: 12, config: { nodeKey: "oss_ratio_annual", horizon: "annual", format: "number" } },

    { key: "sens_ebitda_y3",
      label: "Year-3 EBITDA: Adoption × Toilet price",
      kind: "sensitivity", order: 20,
      config: {
        xNode: "adoption_y3", xValues: [0.5, 0.6, 0.7, 0.8, 0.9],
        yNode: "price_toilet", yValues: [1.0, 1.5, 2.0, 2.5, 3.0],
        resultNode: "ebitda_annual", resultIndex: 2,
        format: "currency",
      } },

    { key: "budget_export_year1", label: "Promote to Budget — Year 1", kind: "budgetExport", order: 30,
      config: {
        domainName: "Sanitation_Complex",
        years: 1,
        capexLines: [
          { nodeKey: "capex_civil", description: "Civil construction" },
          { nodeKey: "capex_plumbing", description: "Plumbing + sanitaryware" },
          { nodeKey: "capex_washing_machines", description: "Washing machines + spin dryers" },
          { nodeKey: "capex_ro", description: "RO plant + Water ATM" },
          { nodeKey: "capex_stp", description: "Greywater MBBR STP" },
          { nodeKey: "capex_biodigester", description: "Biodigester / septic" },
          { nodeKey: "capex_tanks", description: "Storage tanks (UG + OH)" },
          { nodeKey: "capex_solar", description: "Solar PV system" },
          { nodeKey: "capex_electrical", description: "Electrical works" },
          { nodeKey: "capex_iot", description: "Payment + IoT monitoring" },
          { nodeKey: "capex_approval", description: "Approval fees" },
          { nodeKey: "capex_design", description: "Design + supervision" },
          { nodeKey: "capex_signage", description: "Signage, accessibility, furnishings" },
          { nodeKey: "capex_contingency", description: "Contingency" },
          { nodeKey: "capex_tax", description: "GST + taxes" },
        ],
        opexLines: [
          { nodeKey: "opex_caretakers", description: "Caretakers (3 shifts)", costCategory: "Salary", months: 10 },
          { nodeKey: "salary_plant_operator", description: "Plant operator", costCategory: "Salary", months: 10 },
          { nodeKey: "salary_laundry_supervisor", description: "Laundry supervisor", costCategory: "Salary", months: 10 },
          { nodeKey: "electricity_monthly", description: "Electricity (net of solar)", costCategory: "Other", months: 10 },
          { nodeKey: "water_bwssb_monthly", description: "Water (BWSSB)", costCategory: "Other", months: 10 },
          { nodeKey: "cleaning_consumables_monthly", description: "Cleaning consumables", costCategory: "Other", months: 10 },
          { nodeKey: "laundry_detergent_monthly", description: "Laundry detergent", costCategory: "Other", months: 10 },
          { nodeKey: "ro_consumables_monthly", description: "RO consumables", costCategory: "Other", months: 10 },
          { nodeKey: "stp_consumables_monthly", description: "STP consumables", costCategory: "Other", months: 10 },
          { nodeKey: "desludging_monthly_amortised", description: "Septic desludging (amortised)", costCategory: "Other", months: 10 },
          { nodeKey: "amc_monthly", description: "Maintenance / AMC reserve", costCategory: "Other", months: 10 },
          { nodeKey: "tech_monthly", description: "Technology / monitoring", costCategory: "Other", months: 10 },
          { nodeKey: "opex_lab_monthly", description: "Water quality testing", costCategory: "Other", months: 10 },
        ],
      } },

    // Operations day-in-the-life sim (multi-service + DEWATS recycling).
    { key: "daysim_ops", label: "Operations — day in the life", kind: "daySim", order: 40,
      config: {
        schematic: "sanitation_complex",
        nodes: {
          hh: "hh_count", personsPerHH: "persons_per_hh", adoption: "adoption_y3", peak: "peak_concentration",
          seats: "wc_seats", baths: "bath_cubicles", machines: "washing_machines", roLph: "ro_lph", dewatsKld: "stp_kld",
          roTankCap: "ro_tank_litres", roCansCount: "ro_cans_count",
          toiletUses: "toilet_uses_per_person_per_day", bathShare: "bath_share", roLitresPerHH: "ro_litres_per_active_hh_per_day",
          priceToilet: "price_toilet", priceBath: "price_bath", priceLaundry: "price_laundry", priceRo: "price_ro_per_litre",
          passPrice: "monthly_pass_price", passShare: "pass_holder_share", freeQuota: "free_use_quota",
          opexMonthly: "opex_monthly_steady",
          opexToilet: "opex_toilet_monthly", opexBath: "opex_bath_monthly", opexLaundry: "opex_laundry_monthly",
          opexRo: "opex_ro_monthly", opexShared: "opex_shared_monthly",
          seatThroughput: "seat_throughput", bathThroughput: "bath_throughput", machineThroughput: "machine_throughput", roRecovery: "ro_recovery_rate",
          roOperatingHours: "ro_operating_hours", facilityOpenHours: "facility_open_hours",
        },
      } },
  ];
  for (const o of outputs) {
    await prisma.modelOutput.create({
      data: { templateId: template.id, key: o.key, label: o.label, kind: o.kind, config: o.config as never, order: o.order },
    });
  }

  const instance = await prisma.modelInstance.create({
    data: { templateId: template.id, name: "Sanitation Complex — Base", scenarioName: "Base" },
  });

  console.log(`✔ Template ${template.id} (${TEMPLATE_KEY})`);
  console.log(`  ${nodes.length} nodes, ${outputs.length} outputs`);
  console.log(`✔ Instance ${instance.id}`);
  console.log(`→ Visit /models/${instance.id}`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
