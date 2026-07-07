/**
 * Seed CostRegistryComponent — the structural breakup of aggregate Creche cost
 * items (Urban Creche V.2). Starts with the one-time setup bundle, whose 5
 * category components sum to the setup_cost aggregate (₹254,000). Same pattern
 * extends to the other bundles (hygiene, play, feeding) as their detail is
 * captured.
 *
 * Idempotent: replaces the components for each parent it manages (deleteMany +
 * createMany). Validates each roll-up against the live parent unitCost and
 * refuses to write a bundle that doesn't reconcile (unless --force).
 *
 * Usage:
 *   npx tsx scripts/seed-creche-components.ts            # dry run + validate
 *   npx tsx scripts/seed-creche-components.ts --apply    # write
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { rollup } from "../lib/budget/costComponents";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const CITY = "Bangalore";

type Comp = { label: string; spec?: string; qty?: number; unitCost: number };

// parentItemKey → ordered component rows. Numbers from the V.2 summary breakup.
const BUNDLES: Record<string, Comp[]> = {
  "creche.setup_cost": [
    { label: "Anthropometric equipment",                              spec: "Weighing scale, stadiometer, infantometer, iron weights, calibration rod", unitCost: 39500 },
    { label: "Galvanised steel items & utensils",                     spec: "Trunk/almirah, racks, cooking & serving utensils",                       unitCost: 41400 },
    { label: "Equipment, fitments, linen, water storage & handwash",  spec: "Water storage, handwashing unit, linen & bedding, fittings",              unitCost: 97200 },
    { label: "Misc items, painting, repairs",                         spec: "Child-friendly setup, painting, minor repairs",                          unitCost: 24000 },
    { label: "Safety equipment",                                      spec: "Fire safety, first-response & child-safety kit",                          unitCost: 51900 },
  ],
  // Feeding: per-creche annual (20 children). Decimals reconcile via rounding.
  "creche.feeding_cost_per_child_per_year": [
    { label: "Morning snacks",         spec: "Chhatua & oil",                     unitCost: 26287.2 },
    { label: "Cooked lunch",           spec: "Rice, dal, oil, vegetables",        unitCost: 44179.2 },
    { label: "Evening snacks",         spec: "Suji / maize / ragi halwa",         unitCost: 19094.4 },
    { label: "Special nutrition care", spec: "V.2 addition",                      unitCost: 19702.8 },
  ],
  "creche.play_materials_per_year": [
    { label: "Nappies",              spec: "2 sets of 20",           unitCost: 1000 },
    { label: "Spare clothes",        spec: "5 sets",                 unitCost: 1000 },
    { label: "Aprons",               spec: "2 sets",                 unitCost: 300 },
    { label: "Kitchen towel",        spec: "2 sets",                 unitCost: 150 },
    { label: "Bibs",                 spec: "2 sets of 20",           unitCost: 2000 },
    { label: "Cleaning cloth",       spec: "Set of 6",               unitCost: 240 },
    { label: "Play materials & toys", spec: "Per annum",             unitCost: 10000 },
  ],
  "creche.hygiene_cost_per_year": [
    { label: "Hand washing soap/liquid",  unitCost: 1200 },
    { label: "Dish washing soap/liquid",  unitCost: 600 },
    { label: "Dish washing scrubber",     unitCost: 480 },
    { label: "Detergent powder",          unitCost: 2640 },
    { label: "Broom",                     unitCost: 400 },
    { label: "Floor mop",                 unitCost: 500 },
    { label: "Wiper",                     unitCost: 200 },
    { label: "Stationery",                spec: "Markers, sticky notes etc.", unitCost: 600 },
    { label: "Mug",                       unitCost: 150 },
    { label: "Soap case",                 unitCost: 100 },
    { label: "Mirror",                    unitCost: 150 },
    { label: "Comb",                      unitCost: 60 },
    { label: "Nail cutter",               unitCost: 60 },
    { label: "First aid kit",             unitCost: 1200 },
    { label: "Broom (spider webs)",       unitCost: 200 },
    { label: "Umbrella",                  unitCost: 800 },
    { label: "Dust pan",                  unitCost: 100 },
    { label: "Sanitary pads",             unitCost: 1800 },
    { label: "Toilet cleaner",            unitCost: 800 },
    { label: "Toilet cleaning brush",     unitCost: 100 },
    { label: "Phenyl",                    unitCost: 450 },
    { label: "Mosquito nets",             unitCost: 1000 },
    { label: "Mats (plastic)",            unitCost: 2000 },
    { label: "Durries (cotton)",          unitCost: 2000 },
    { label: "Single bedsheet",           unitCost: 1800 },
    { label: "Curtain set",               unitCost: 600 },
  ],
};

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  console.log(`\n=== Creche component seed (${CITY}) — ${APPLY ? "APPLY" : "DRY RUN"} ===\n`);

  for (const [parentItemKey, comps] of Object.entries(BUNDLES)) {
    const parent = await prisma.costRegistry.findUnique({
      where: { city_itemKey: { city: CITY, itemKey: parentItemKey } },
      select: { unitCost: true },
    });
    const rows = comps.map(c => ({ qty: c.qty ?? 1, unitCost: c.unitCost }));
    const sum = rollup(rows);
    const target = parent ? Math.round(parent.unitCost) : null;
    const ok = target !== null && sum === target;
    console.log(`${parentItemKey}: ${comps.length} components, Σ=${sum}, parent=${target ?? "(missing)"} ${ok ? "✓" : "✗ MISMATCH"}`);
    for (const c of comps) console.log(`    ${String(c.qty ?? 1).padStart(2)} × ${c.unitCost} = ${(c.qty ?? 1) * c.unitCost}  ${c.label}`);

    if (!ok && !FORCE) {
      console.log(`  → skipped (roll-up ≠ parent; re-run with --force to write anyway)\n`);
      continue;
    }
    if (!APPLY) { console.log(""); continue; }

    await prisma.$transaction(async (tx) => {
      await tx.costRegistryComponent.deleteMany({ where: { city: CITY, parentItemKey } });
      await tx.costRegistryComponent.createMany({
        data: comps.map((c, position) => ({
          city: CITY, parentItemKey, position,
          label: c.label, spec: c.spec ?? null,
          qty: c.qty ?? 1, unitCost: c.unitCost,
        })),
      });
    });
    console.log(`  → wrote ${comps.length} components\n`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
