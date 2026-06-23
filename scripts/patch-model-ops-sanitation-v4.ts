// V4 patch (2026-06-23 evening): remove CBO honorarium from the model + rewrite
// parameter notes in plain English for the public viewer audience.
//
// Idempotent. CBO removal sequence: update referencing formulas FIRST (else the
// engine errors with "unknown ref" on the next compute), then delete the nodes.
//
// Run:  npx tsx scripts/patch-model-ops-sanitation-v4.ts

import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEMPLATE_KEY = "sanitation_complex";

async function main() {
  const tpl = await prisma.modelTemplate.findUnique({ where: { key: TEMPLATE_KEY }, select: { id: true } });
  if (!tpl) throw new Error(`Template ${TEMPLATE_KEY} not found.`);

  // ── 1. Update formulas that reference CBO nodes (BEFORE deleting nodes) ────
  const formulaUpdates = [
    { key: "opex_staff_steady", label: "Staff opex (steady)",
      formula: "opex_caretakers + opex_plant_operators_total + opex_laundry_supervisors_total + opex_security_total + opex_admin_cashier_total" },
    { key: "opex_monthly_actual",
      formula:
        "IF(T < 2, 0, " +
        "opex_staff_steady + electricity_monthly + water_bwssb_monthly + cleaning_consumables_monthly + laundry_detergent_monthly + ro_consumables_monthly + stp_consumables_monthly + desludging_monthly_amortised + amc_monthly + tech_monthly" +
        " + IF(T == 2, lab_quarterly, IF((T - 2) % 3 == 0, lab_quarterly, 0)))" },
    { key: "opex_annual_staff",
      formula: "opex_staff_steady * 12 * (1 + cost_inflation) ^ T * IF(T == 0, 10 / 12, 1)" },
    { key: "opex_annual",
      formula: "opex_annual_staff + opex_annual_utilities + opex_annual_consumables + opex_annual_amc_tech + opex_annual_lab" },
  ];
  for (const f of formulaUpdates) {
    await prisma.modelNode.updateMany({
      where: { templateId: tpl.id, key: f.key },
      data: { formula: f.formula, ...(f.label ? { label: f.label } : {}) },
    });
  }

  // ── 2. Delete CBO + opex_staff_pre_cbo nodes (safe now — no formula refs) ──
  const drop = await prisma.modelNode.deleteMany({
    where: { templateId: tpl.id, key: { in: ["num_cbo_reps", "salary_cbo_honorarium", "opex_cbo_total", "opex_annual_cbo", "opex_staff_pre_cbo"] } },
  });

  // ── 3. Rewrite parameter notes (and labels where they're misleading) ───────
  type NotePatch = { key: string; label?: string; notes: string | null };
  const notes: NotePatch[] = [
    { key: "wc_seats", notes: "Total toilet pans across men's, women's, and disabled-access blocks." },
    { key: "bath_cubicles", notes: "Number of enclosed bathing stalls." },
    { key: "washing_machines", notes: "Number of washing machines for the laundry service." },
    { key: "ro_lph", notes: "How fast the RO plant can produce drinking water at full tilt." },
    { key: "ro_operating_hours", notes: "Hours per day the RO plant runs (starting 6 AM). Off-hours, the dispenser draws from the tank." },
    { key: "facility_open_hours", notes: "Hours per day the complex is open to users (starting 6 AM). Toilet, bath, and laundry only serve during these hours." },
    { key: "stp_kld", notes: "Daily greywater treatment capacity. Treated water is recycled back as toilet flush + cleaning water — reducing fresh BWSSB draw." },
    { key: "ro_tank_litres", notes: "Storage tank that banks water produced during quiet hours for the morning rush." },
    { key: "ro_cans_count", notes: "Pre-filled 10-litre cans held as a backup when the tank runs low." },
    { key: "adoption_y3", notes: "Share of households in the area who actively use the complex." },
    { key: "num_caretakers", notes: "Total caretakers on payroll. Default 3 = one per 8-hour shift × 3 shifts/day." },
    { key: "num_plant_operators", notes: "Technician for the RO plant and greywater treatment unit." },
    { key: "num_laundry_supervisors", notes: "Staff running the laundry intake and machines." },
    { key: "num_security_guards", notes: "Guards across day and night. Default 2 = day + night cover." },
    { key: "num_admin_cashiers", notes: "Cashier + records — pass sales and daily accounts." },
    { key: "free_use_quota", notes: "Share of toilet + bath capacity given free to the poorest, elderly, and disabled." },
    { key: "pilot_free_first_3mo", notes: "1 = first 3 months are free for everyone to drive uptake. 0 = charge from launch." },
  ];
  for (const n of notes) {
    await prisma.modelNode.updateMany({
      where: { templateId: tpl.id, key: n.key },
      data: { notes: n.notes, ...(n.label ? { label: n.label } : {}) },
    });
  }

  console.log(`✔ Patched ${TEMPLATE_KEY} v4:`);
  console.log(`  • ${formulaUpdates.length} formula nodes updated (CBO references stripped)`);
  console.log(`  • ${drop.count} CBO + pre-CBO nodes deleted`);
  console.log(`  • ${notes.length} parameter notes rewritten in plain English`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
