// Non-destructive patch: apply Operations-sim surface/tier/slider tags to the
// LIVE ro_water template, plus the new tank/cans/peak_concentration nodes —
// WITHOUT dropping the template (which would cascade-delete its instances and
// any attached scenarios). The seed file carries the same data for fresh seeds;
// this is the idempotent path for already-seeded environments.
//
// Run:  npx tsx scripts/patch-model-ops-surface.ts

import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEMPLATE_KEY = "ro_water";

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
  const plant = tpl.groups.find(g => g.key === "plant");
  if (!plant) throw new Error("plant group missing — unexpected template shape.");

  // ── Existing-node tags (surface / tier / slider range) ─────────────────────
  const nodePatch: Record<string, { surface?: string; tier?: string; uiJson?: unknown }> = {
    hh_count: { uiJson: { min: 300, max: 1200, step: 20 } },
    adoption_m3: { surface: "finance" },
    adoption_m6: { surface: "finance" },
    adoption_m12: { surface: "finance" },
    adoption_y2: { surface: "finance" },
    adoption_y3: { uiJson: { min: 0.2, max: 1, step: 0.05 } },
    litres_per_adopting_hh: { uiJson: { min: 4, max: 25, step: 1 } },
    plant_lph: { uiJson: { min: 250, max: 2000, step: 50 } },
    operating_hours_per_day: { uiJson: { min: 4, max: 24, step: 1 } },
    ro_recovery_rate: { tier: "advanced", uiJson: { min: 0.3, max: 0.8, step: 0.05 } },
    days_per_month: { tier: "advanced", uiJson: { min: 20, max: 31, step: 1 } },
    price_per_litre: { uiJson: { min: 0, max: 5, step: 0.1 } },
  };
  for (const [key, data] of Object.entries(nodePatch)) {
    await prisma.modelNode.updateMany({ where: { templateId: tpl.id, key }, data: data as never });
  }

  // ── New nodes (upsert by key) ──────────────────────────────────────────────
  const seen = new Set(tpl.nodes.map(n => n.key));
  const newNodes = [
    { groupId: plant.id, key: "tank_litres", label: "Product tank size", kind: "input", dataType: "int", defaultJson: 2000, unit: "L", notes: "Primary buffer between plant and dispensing", surface: "both", uiJson: { min: 1000, max: 8000, step: 250 }, order: 901 },
    { groupId: plant.id, key: "cans_count", label: "Pre-packed 10 L cans (reserve)", kind: "input", dataType: "int", defaultJson: 50, unit: "cans", notes: "Off-peak reserve drawn down at the rush", surface: "both", uiJson: { min: 0, max: 150, step: 5 }, order: 902 },
    { groupId: ops.id, key: "peak_concentration", label: "Peak concentration", kind: "input", dataType: "number", defaultJson: 100, unit: "", notes: "Higher = sharper morning/evening rush", surface: "sim", uiJson: { min: 60, max: 200, step: 5 }, order: 903 },
  ];
  for (const n of newNodes) {
    if (seen.has(n.key)) {
      await prisma.modelNode.updateMany({
        where: { templateId: tpl.id, key: n.key },
        data: { surface: n.surface, uiJson: n.uiJson as never, defaultJson: n.defaultJson as never },
      });
    } else {
      await prisma.modelNode.create({
        data: {
          templateId: tpl.id, groupId: n.groupId, key: n.key, label: n.label,
          kind: n.kind, dataType: n.dataType, shape: { kind: "scalar" },
          defaultJson: n.defaultJson as never, unit: n.unit, notes: n.notes,
          surface: n.surface, tier: "basic", uiJson: n.uiJson as never, order: n.order,
        },
      });
    }
  }

  // ── daySim output (upsert by key) ──────────────────────────────────────────
  const daySimConfig = {
    schematic: "ro_water",
    nodes: {
      lph: "plant_lph", tankCap: "tank_litres", cansCount: "cans_count",
      hh: "hh_count", adoption: "adoption_y3", lpd: "litres_per_adopting_hh",
      peak: "peak_concentration", price: "effective_price_per_litre", opexMonthly: "opex_monthly_steady",
      operatingDays: "days_per_month",
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

  console.log(`✔ Patched ${TEMPLATE_KEY}: group surfaces, ${Object.keys(nodePatch).length} node tags, ${newNodes.length} ops nodes, daySim output.`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
