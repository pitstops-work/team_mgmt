// Non-destructive patch: apply Operations-sim surface/tier/slider tags to the
// LIVE sanitation_complex template, plus the new RO-buffer + ops nodes and the
// daySim output — WITHOUT dropping the template (which would cascade-delete its
// instances). The seed carries the same data for fresh seeds; this is the
// idempotent path for already-seeded environments.
//
// Run:  npx tsx scripts/patch-model-ops-sanitation.ts

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
    include: { groups: true, nodes: { select: { key: true } } },
  });
  if (!tpl) throw new Error(`Template ${TEMPLATE_KEY} not found — run the seed first.`);

  // ── Groups ────────────────────────────────────────────────────────────────
  await prisma.modelGroup.updateMany({ where: { templateId: tpl.id, key: "capex_in" }, data: { surface: "finance" } });
  await prisma.modelGroup.updateMany({ where: { templateId: tpl.id, key: "financial" }, data: { surface: "finance" } });
  let ops = tpl.groups.find(g => g.key === "ops");
  if (!ops) {
    ops = await prisma.modelGroup.create({
      data: { templateId: tpl.id, key: "ops", label: "Operations (sim)", order: tpl.groups.length, surface: "sim" },
    });
  } else {
    await prisma.modelGroup.update({ where: { id: ops.id }, data: { surface: "sim" } });
  }
  const capacity = tpl.groups.find(g => g.key === "capacity");
  if (!capacity) throw new Error("capacity group missing — unexpected template shape.");

  // ── Existing-node tags ─────────────────────────────────────────────────────
  const sl = (min: number, max: number, step: number) => ({ uiJson: { min, max, step } });
  const nodePatch: Record<string, { surface?: string; tier?: string; uiJson?: unknown }> = {
    hh_count: sl(100, 800, 10),
    persons_per_hh: sl(3, 8, 0.5),
    daily_users_estimate: { surface: "finance" },
    wc_seats: sl(6, 60, 2),
    bath_cubicles: sl(0, 20, 1),
    washing_machines: sl(0, 12, 1),
    ro_lph: sl(250, 2000, 50),
    stp_kld: sl(4, 30, 1),
    toilet_uses_per_person_per_day: sl(1, 6, 0.5),
    bath_share: sl(0.05, 0.6, 0.05),
    laundry_loads_per_machine_per_day: { surface: "finance" },
    ro_litres_per_active_hh_per_day: sl(4, 25, 1),
    adoption_m3: { surface: "finance" }, adoption_m6: { surface: "finance" },
    adoption_m12: { surface: "finance" }, adoption_y2: { surface: "finance" },
    adoption_y3: sl(0.2, 1, 0.05),
    price_toilet: sl(0, 6, 0.5), price_bath: sl(0, 25, 1), price_laundry: sl(0, 100, 5),
    price_ro_per_litre: sl(0, 5, 0.25), monthly_pass_price: sl(0, 400, 10), pass_holder_share: sl(0, 0.8, 0.05),
    free_use_quota: sl(0, 0.4, 0.05),
    pilot_free_first_3mo: { surface: "finance" },
  };
  for (const [key, data] of Object.entries(nodePatch)) {
    await prisma.modelNode.updateMany({ where: { templateId: tpl.id, key }, data: data as never });
  }

  // ── New nodes (upsert by key) ──────────────────────────────────────────────
  const seen = new Set(tpl.nodes.map(n => n.key));
  const newNodes = [
    { groupId: capacity.id, key: "ro_tank_litres", label: "RO product tank size", dataType: "int", defaultJson: 4000, unit: "L", surface: "both", tier: "basic", uiJson: { min: 1000, max: 8000, step: 250 }, order: 901 },
    { groupId: capacity.id, key: "ro_cans_count", label: "RO pre-packed 10 L cans", dataType: "int", defaultJson: 50, unit: "cans", surface: "both", tier: "basic", uiJson: { min: 0, max: 150, step: 5 }, order: 902 },
    { groupId: ops.id, key: "peak_concentration", label: "Peak concentration", dataType: "number", defaultJson: 100, unit: "", notes: "Higher = sharper morning/evening rush", surface: "sim", tier: "basic", uiJson: { min: 60, max: 200, step: 5 }, order: 903 },
    { groupId: ops.id, key: "seat_throughput", label: "WC throughput", dataType: "number", defaultJson: 12, unit: "uses/h/seat", surface: "sim", tier: "advanced", uiJson: { min: 6, max: 20, step: 1 }, order: 904 },
    { groupId: ops.id, key: "bath_throughput", label: "Cubicle throughput", dataType: "number", defaultJson: 3, unit: "baths/h", surface: "sim", tier: "advanced", uiJson: { min: 1, max: 8, step: 0.5 }, order: 905 },
    { groupId: ops.id, key: "machine_throughput", label: "Machine throughput", dataType: "number", defaultJson: 1.3, unit: "loads/h", surface: "sim", tier: "advanced", uiJson: { min: 0.5, max: 3, step: 0.1 }, order: 906 },
    { groupId: ops.id, key: "ro_recovery_rate", label: "RO recovery rate", dataType: "percent", defaultJson: 0.55, unit: "%", surface: "sim", tier: "advanced", uiJson: { min: 0.3, max: 0.8, step: 0.05 }, order: 907 },
  ];
  for (const n of newNodes) {
    if (seen.has(n.key)) {
      await prisma.modelNode.updateMany({
        where: { templateId: tpl.id, key: n.key },
        data: { surface: n.surface, tier: n.tier, uiJson: n.uiJson as never, defaultJson: n.defaultJson as never },
      });
    } else {
      await prisma.modelNode.create({
        data: {
          templateId: tpl.id, groupId: n.groupId, key: n.key, label: n.label, kind: "input",
          dataType: n.dataType, shape: { kind: "scalar" }, defaultJson: n.defaultJson as never,
          unit: n.unit, notes: (n as { notes?: string }).notes ?? null,
          surface: n.surface, tier: n.tier, uiJson: n.uiJson as never, order: n.order,
        },
      });
    }
  }

  // ── Per-service opex split (formula nodes, upsert by key) ──────────────────
  const opexGroup = tpl.groups.find(g => g.key === "opex");
  if (!opexGroup) throw new Error("opex group missing — unexpected template shape.");
  const formulaNodes = [
    { key: "opex_toilet_monthly", label: "Toilet — direct opex (monthly)", formula: "opex_caretakers * 0.4 + cleaning_consumables_monthly * 0.55 + desludging_monthly_amortised + water_bwssb_monthly * 0.3", order: 920 },
    { key: "opex_bath_monthly", label: "Bath — direct opex (monthly)", formula: "opex_caretakers * 0.25 + cleaning_consumables_monthly * 0.25 + water_bwssb_monthly * 0.45", order: 921 },
    { key: "opex_laundry_monthly", label: "Laundry — direct opex (monthly)", formula: "salary_laundry_supervisor + laundry_detergent_monthly + electricity_monthly * 0.25 + water_bwssb_monthly * 0.15", order: 922 },
    { key: "opex_ro_monthly", label: "RO water — direct opex (monthly)", formula: "salary_plant_operator * 0.5 + ro_consumables_monthly + electricity_monthly * 0.3", order: 923 },
    { key: "opex_shared_monthly", label: "Shared / overhead opex (monthly)", formula: "opex_monthly_steady - opex_toilet_monthly - opex_bath_monthly - opex_laundry_monthly - opex_ro_monthly", order: 924 },
  ];
  for (const f of formulaNodes) {
    if (seen.has(f.key)) {
      await prisma.modelNode.updateMany({ where: { templateId: tpl.id, key: f.key }, data: { formula: f.formula } });
    } else {
      await prisma.modelNode.create({
        data: {
          templateId: tpl.id, groupId: opexGroup.id, key: f.key, label: f.label, kind: "formula",
          dataType: "currency", shape: { kind: "scalar" }, formula: f.formula, unit: "INR/mo",
          surface: "both", tier: "basic", order: f.order,
        },
      });
    }
  }

  // ── daySim output (upsert by key) ──────────────────────────────────────────
  const daySimConfig = {
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
    },
  };
  const existingOut = await prisma.modelOutput.findFirst({ where: { templateId: tpl.id, key: "daysim_ops" } });
  if (existingOut) {
    await prisma.modelOutput.update({ where: { id: existingOut.id }, data: { config: daySimConfig as never } });
  } else {
    await prisma.modelOutput.create({
      data: { templateId: tpl.id, key: "daysim_ops", label: "Operations — day in the life", kind: "daySim", config: daySimConfig as never, order: 40 },
    });
  }

  console.log(`✔ Patched ${TEMPLATE_KEY}: group surfaces, ${Object.keys(nodePatch).length} node tags, ${newNodes.length} ops/buffer nodes, daySim output.`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
