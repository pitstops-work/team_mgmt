// V3 patch (2026-06-23 evening): pre-demo polish for the sanitation_complex
// template. Bumps undersized capacity defaults, renames adoption_y3 for sim-tab
// clarity, adds the new kwh_per_bath_heating input + electricity formula node,
// rewrites recycle_demand_l_day to scale with built-out fixtures, and adds
// replacementReserveAnnual to the daysim_ops nodes map.
//
// Idempotent — safe to re-run. Never drops the template.
//
// Run:  npx tsx scripts/patch-model-ops-sanitation-v3.ts

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
  if (!tpl) throw new Error(`Template ${TEMPLATE_KEY} not found.`);

  const groupId = (key: string) => {
    const g = tpl.groups.find(x => x.key === key);
    if (!g) throw new Error(`group '${key}' missing`);
    return g.id;
  };
  const opexInId = groupId("opex_in");
  const opexId = groupId("opex");
  const existingByKey = new Set(tpl.nodes.map(n => n.key));

  // ── 1. Capacity default bumps (demo opens green) ───────────────────────────
  const capPatches = [
    { key: "wc_seats", defaultJson: 52, notes: "Default bumped 30→52 so peak hour ~622 uses/h is covered at 12 uses/h/seat with small headroom", uiJson: { min: 6, max: 80, step: 2 } },
    { key: "bath_cubicles", defaultJson: 20, notes: "Default bumped 8→20 so peak hour ~53 baths/h is covered at 3/h × 20 cubicles", uiJson: { min: 0, max: 24, step: 1 } },
    { key: "washing_machines", defaultJson: 10, notes: "Default bumped 4→10 so peak hour ~13 loads/h is covered at 1.3/h × 10 machines", uiJson: { min: 0, max: 14, step: 1 } },
    { key: "stp_kld", defaultJson: 28, notes: "Default bumped 12→28 to cover ~25 KLD greywater + RO reject + headroom", uiJson: { min: 4, max: 40, step: 1 } },
  ];
  for (const p of capPatches) {
    await prisma.modelNode.updateMany({
      where: { templateId: tpl.id, key: p.key },
      data: { defaultJson: p.defaultJson as never, notes: p.notes, uiJson: p.uiJson as never },
    });
  }

  // ── 2. Adoption_y3 relabel for sim-tab clarity ─────────────────────────────
  await prisma.modelNode.updateMany({
    where: { templateId: tpl.id, key: "adoption_y3" },
    data: {
      label: "Active adoption (% of HH)",
      notes: "Used by the day-in-the-life sim as the *current* active fraction. Finance also uses it as the Year 3+ steady-state value (M3/M6/M12/Y2 are the ramp).",
    },
  });

  // ── 3. New input: kwh_per_bath_heating ─────────────────────────────────────
  const bathHeatNode = {
    groupId: opexInId, key: "kwh_per_bath_heating", label: "Electricity per bath (water heating)",
    dataType: "number", defaultJson: 0.87, unit: "kWh/bath",
    notes: "25 L at ΔT=30°C ≈ 0.87 kWh. Set to 0 if cold-water bathing or solar-heated",
    uiJson: { min: 0, max: 2, step: 0.05 }, order: 721,
  };
  if (existingByKey.has(bathHeatNode.key)) {
    await prisma.modelNode.updateMany({
      where: { templateId: tpl.id, key: bathHeatNode.key },
      data: { defaultJson: bathHeatNode.defaultJson as never, notes: bathHeatNode.notes, uiJson: bathHeatNode.uiJson as never },
    });
  } else {
    await prisma.modelNode.create({
      data: {
        templateId: tpl.id, groupId: bathHeatNode.groupId, key: bathHeatNode.key, label: bathHeatNode.label,
        kind: "input", dataType: bathHeatNode.dataType, shape: { kind: "scalar" } as never,
        defaultJson: bathHeatNode.defaultJson as never, unit: bathHeatNode.unit, notes: bathHeatNode.notes,
        surface: "both", tier: "basic", uiJson: bathHeatNode.uiJson as never, order: bathHeatNode.order,
      },
    });
  }

  // ── 4. New formula node: electricity_bath_heating_kwh_per_day + update net ─
  const formulaPatches = [
    { key: "electricity_bath_heating_kwh_per_day", label: "Bath water heating (kWh/day)", formula: "bath_uses_per_day_steady * kwh_per_bath_heating", unit: "kWh/day", notes: "Set kwh_per_bath_heating to 0 if cold-water bathing or solar-heated geyser", order: 832 },
    { key: "electricity_kwh_net_per_day", label: "Net grid electricity (kWh/day)", formula: "MAX(0, electricity_ro_kwh_per_day + electricity_laundry_kwh_per_day + electricity_bath_heating_kwh_per_day + electricity_lighting_kwh_per_day - solar_offset_kwh_per_day)", unit: "kWh/day", notes: "Solar offsets day-time load first", order: 834 },
    // Recycle demand now scales with built-out fixtures (was a flat 500 L)
    { key: "recycle_demand_l_day", label: "Recycle demand (L/day)", formula: "toilet_uses_per_day_steady * 5 + 150 + wc_seats * 8 + bath_cubicles * 12 + washing_machines * 5", unit: "L/day", notes: "5 L per flush + fixture cleaning (8 L/seat + 12 L/cubicle + 5 L/machine + 150 L common area)", order: 826 },
  ];
  for (const f of formulaPatches) {
    if (existingByKey.has(f.key)) {
      await prisma.modelNode.updateMany({
        where: { templateId: tpl.id, key: f.key },
        data: { kind: "formula", formula: f.formula, label: f.label, unit: f.unit, notes: f.notes, dataType: f.unit.startsWith("INR") ? "currency" : "number", shape: { kind: "scalar" } as never, defaultJson: undefined, order: f.order },
      });
    } else {
      await prisma.modelNode.create({
        data: {
          templateId: tpl.id, groupId: opexId, key: f.key, label: f.label, kind: "formula",
          dataType: f.unit.startsWith("INR") ? "currency" : "number",
          shape: { kind: "scalar" } as never, formula: f.formula, unit: f.unit, notes: f.notes,
          surface: "both", tier: "basic", order: f.order,
        },
      });
    }
  }

  // ── 5. daysim_ops config — add replacementReserveAnnual mapping ────────────
  const daySim = await prisma.modelOutput.findFirst({ where: { templateId: tpl.id, key: "daysim_ops" } });
  if (daySim) {
    const cfg = (daySim.config as Record<string, unknown>) ?? {};
    const nodes = ((cfg.nodes as Record<string, string>) ?? {});
    nodes.replacementReserveAnnual = "replacement_reserve_annual";
    await prisma.modelOutput.update({
      where: { id: daySim.id },
      data: { config: { ...cfg, nodes } as never },
    });
  }

  console.log(`✔ Patched ${TEMPLATE_KEY} v3:`);
  console.log(`  • ${capPatches.length} capacity defaults bumped (bath/laundry/stp)`);
  console.log(`  • adoption_y3 relabeled for sim clarity`);
  console.log(`  • kwh_per_bath_heating input added + electricity formula extended`);
  console.log(`  • recycle_demand_l_day scales with fixture count`);
  console.log(`  • daysim_ops exposes replacement_reserve_annual`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
