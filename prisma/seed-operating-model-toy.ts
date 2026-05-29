// Toy operating-model template for Phase 1 validation.
// Run:  npx tsx prisma/seed-operating-model-toy.ts
//
// Creates a 10-node template that exercises scalar inputs, scalar formulas,
// monthly vector formulas with implicit T, and an annual rollup. Plus one
// blank ModelInstance so /models/[id] has something to render.

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TEMPLATE_KEY = "toy_water_plant";

async function main() {
  // Wipe prior toy template so this script is idempotent.
  await prisma.modelTemplate.deleteMany({ where: { key: TEMPLATE_KEY } });

  const template = await prisma.modelTemplate.create({
    data: {
      key: TEMPLATE_KEY,
      name: "Toy Water Plant (Phase 1 sanity check)",
      description: "Smoke test: scalar inputs → monthly vector → annual rollup.",
      horizons: [
        { key: "monthly", length: 24 },
        { key: "annual", length: 2 },
      ],
      sortOrder: 0,
    },
  });

  const groups = await Promise.all([
    prisma.modelGroup.create({ data: { templateId: template.id, key: "site", label: "Site", order: 0 } }),
    prisma.modelGroup.create({ data: { templateId: template.id, key: "pricing", label: "Pricing", order: 1 } }),
    prisma.modelGroup.create({ data: { templateId: template.id, key: "adoption", label: "Adoption", order: 2 } }),
  ]);
  const byKey = Object.fromEntries(groups.map(g => [g.key, g.id]));

  type N = Parameters<typeof prisma.modelNode.create>[0]["data"];
  const nodes: N[] = [
    {
      templateId: template.id, groupId: byKey.site, key: "hh_count", label: "Households",
      kind: "input", dataType: "int", shape: { kind: "scalar" }, defaultJson: 500,
      unit: "HH", order: 0,
    },
    {
      templateId: template.id, groupId: byKey.site, key: "persons_per_hh", label: "Persons / HH",
      kind: "input", dataType: "number", shape: { kind: "scalar" }, defaultJson: 5,
      unit: "persons", order: 1,
    },
    {
      templateId: template.id, groupId: byKey.site, key: "lpd_per_person", label: "Litres / person / day",
      kind: "input", dataType: "number", shape: { kind: "scalar" }, defaultJson: 4,
      unit: "L/p/d", order: 2,
    },
    {
      templateId: template.id, groupId: byKey.site, key: "demand_lpd", label: "Total demand (L/day)",
      kind: "formula", dataType: "number", shape: { kind: "scalar" },
      formula: "hh_count * persons_per_hh * lpd_per_person",
      unit: "L/day", order: 3,
    },
    {
      templateId: template.id, groupId: byKey.pricing, key: "price_per_l", label: "Price / litre",
      kind: "input", dataType: "currency", shape: { kind: "scalar" }, defaultJson: 2,
      unit: "INR/L", order: 0,
    },
    {
      templateId: template.id, groupId: byKey.pricing, key: "opex_monthly", label: "Monthly opex",
      kind: "input", dataType: "currency", shape: { kind: "scalar" }, defaultJson: 30000,
      unit: "INR/mo", order: 1,
    },
    {
      templateId: template.id, groupId: byKey.adoption, key: "adoption_monthly", label: "Adoption rate (monthly)",
      kind: "formula", dataType: "percent", shape: { kind: "vector", horizon: "monthly" },
      // S-curve-ish ramp: 30% → 82% over 24 months
      formula: "0.30 + (0.82 - 0.30) * (T / 23)",
      unit: "%", order: 0,
      notes: "Linear ramp from 30% (month 0) to 82% (month 23). Replace with logistic curve later.",
    },
    {
      templateId: template.id, groupId: byKey.adoption, key: "litres_sold", label: "Litres sold (monthly)",
      kind: "formula", dataType: "number", shape: { kind: "vector", horizon: "monthly" },
      // adopters × 18 L per adopting HH per day × 28 days
      formula: "hh_count * adoption_monthly * 18 * 28",
      unit: "L/mo", order: 1,
    },
    {
      templateId: template.id, groupId: byKey.adoption, key: "revenue_monthly", label: "Revenue (monthly)",
      kind: "formula", dataType: "currency", shape: { kind: "vector", horizon: "monthly" },
      formula: "litres_sold * price_per_l",
      unit: "INR/mo", order: 2,
    },
    {
      templateId: template.id, groupId: byKey.adoption, key: "ebitda_monthly", label: "EBITDA (monthly)",
      kind: "formula", dataType: "currency", shape: { kind: "vector", horizon: "monthly" },
      formula: "revenue_monthly - opex_monthly",
      unit: "INR/mo", order: 3,
    },
    {
      templateId: template.id, groupId: byKey.adoption, key: "ebitda_annual", label: "EBITDA (annual)",
      kind: "formula", dataType: "currency", shape: { kind: "vector", horizon: "annual" },
      formula: "SUM(ebitda_monthly, T*12, 12)",
      unit: "INR/yr", order: 4,
    },
  ];
  for (const n of nodes) await prisma.modelNode.create({ data: n });

  // One KPI output and one series output so the play page has something to render.
  await prisma.modelOutput.create({
    data: {
      templateId: template.id, key: "kpi_y1_ebitda", label: "Year-1 EBITDA", kind: "kpi", order: 0,
      config: { nodeKey: "ebitda_annual", index: 0, format: "currency" },
    },
  });
  await prisma.modelOutput.create({
    data: {
      templateId: template.id, key: "kpi_y2_ebitda", label: "Year-2 EBITDA", kind: "kpi", order: 1,
      config: { nodeKey: "ebitda_annual", index: 1, format: "currency" },
    },
  });
  await prisma.modelOutput.create({
    data: {
      templateId: template.id, key: "series_revenue_monthly", label: "Monthly Revenue", kind: "series", order: 2,
      config: { nodeKey: "revenue_monthly", horizon: "monthly", format: "currency" },
    },
  });
  await prisma.modelOutput.create({
    data: {
      templateId: template.id, key: "series_ebitda_monthly", label: "Monthly EBITDA", kind: "series", order: 3,
      config: { nodeKey: "ebitda_monthly", horizon: "monthly", format: "currency" },
    },
  });

  const instance = await prisma.modelInstance.create({
    data: { templateId: template.id, name: "Base scenario", scenarioName: "Base" },
  });

  console.log(`✔ Created template ${template.id} (${TEMPLATE_KEY}) with ${nodes.length} nodes`);
  console.log(`✔ Created instance ${instance.id}`);
  console.log(`→ Visit /models/${instance.id} to play`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
