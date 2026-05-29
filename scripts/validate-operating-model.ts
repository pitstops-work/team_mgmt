// Validate that a seeded operating-model template parses, has no cycles, and
// computes without errors. Usage:
//   npx tsx scripts/validate-operating-model.ts <templateKey>

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { toEngineTemplate } from "../lib/models/fromPrisma";
import { compute, validateTemplate } from "../lib/models/engine";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const key = process.argv[2];
  if (!key) { console.error("usage: validate-operating-model.ts <templateKey>"); process.exit(2); }

  const t = await prisma.modelTemplate.findUnique({
    where: { key },
    include: {
      groups: { orderBy: { order: "asc" } },
      nodes: { orderBy: { order: "asc" }, include: { group: { select: { key: true } } } },
      outputs: { orderBy: { order: "asc" } },
    },
  });
  if (!t) { console.error(`template '${key}' not found`); process.exit(1); }

  const tpl = toEngineTemplate(t);
  const errs = validateTemplate(tpl);
  if (errs.length) {
    console.log(`VALIDATION ERRORS (${errs.length}):`);
    errs.forEach(e => console.log("   ", e.nodeKey, ":", e.message));
  }
  const r = compute(tpl, {});
  if (Object.keys(r.errors).length) {
    console.log(`COMPUTE ERRORS (${Object.keys(r.errors).length}):`);
    Object.entries(r.errors).forEach(([k, v]) => console.log("   ", k, ":", v));
  }
  console.log(`\n${tpl.name}`);
  console.log(`  nodes: ${tpl.nodes.length}  outputs: ${tpl.outputs.length}`);
  console.log(`  validation errs: ${errs.length}  compute errs: ${Object.keys(r.errors).length}`);

  // Spot-check a few canonical values.
  const fmt = (n: unknown): string => {
    if (Array.isArray(n)) return `[${n.slice(0, 3).map(x => Math.round(x as number)).join(", ")}${n.length > 3 ? ", …" : ""}]`;
    if (typeof n === "number") return Math.round(n).toLocaleString("en-IN");
    return String(n);
  };
  const spot = ["capex_total", "capex_per_hh", "opex_monthly_steady", "breakeven_price_per_litre",
                "revenue_annual", "ebitda_annual", "oss_ratio_annual", "npv_5yr",
                "ebitda_monthly", "adoption_monthly"];
  console.log("\n  spot checks:");
  for (const k of spot) {
    if (k in r.values) console.log(`     ${k.padEnd(28)} ${fmt(r.values[k])}`);
  }

  await prisma.$disconnect();
  if (errs.length || Object.keys(r.errors).length) process.exit(1);
}

main();
