// Materialise daySim engine constants + presentation into ModelOutput.config.
//
// Before this change those values were hardcoded in the sim engines/renderers.
// They now live in the daySim output's config so each model is editable in the
// template editor's Sim tab. This backfill writes the defaults into any daySim
// output that doesn't already carry them, so existing (pre-change) templates
// become self-describing in the DB. Idempotent: existing constants/presentation
// are preserved; only missing blocks are filled.
//
// Run:  npx tsx scripts/backfill-sim-config-defaults.ts

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  DEFAULT_COMPLEX_CONSTANTS, DEFAULT_COMPLEX_PRESENTATION,
  DEFAULT_RO_CONSTANTS, DEFAULT_RO_PRESENTATION,
} from "../lib/models/simConfig";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const outputs = await prisma.modelOutput.findMany({ where: { kind: "daySim" } });
  let updated = 0;
  for (const o of outputs) {
    const config = (o.config ?? {}) as Record<string, unknown>;
    const schematic = config.schematic;
    const defConst = schematic === "ro_water" ? DEFAULT_RO_CONSTANTS
      : schematic === "sanitation_complex" ? DEFAULT_COMPLEX_CONSTANTS : null;
    const defPres = schematic === "ro_water" ? DEFAULT_RO_PRESENTATION
      : schematic === "sanitation_complex" ? DEFAULT_COMPLEX_PRESENTATION : null;
    if (!defConst || !defPres) {
      console.log(`· skip ${o.key} — unknown schematic ${String(schematic)}`);
      continue;
    }
    const hasConst = config.constants && Object.keys(config.constants as object).length > 0;
    const hasPres = config.presentation && Object.keys(config.presentation as object).length > 0;
    if (hasConst && hasPres) {
      console.log(`· ok   ${o.key} — already has constants + presentation`);
      continue;
    }
    const next = {
      ...config,
      constants: hasConst ? config.constants : defConst,
      presentation: hasPres ? config.presentation : defPres,
    };
    await prisma.modelOutput.update({ where: { id: o.id }, data: { config: next as never } });
    updated++;
    console.log(`✓ fill ${o.key} (${String(schematic)})`);
  }
  console.log(`\nDone. ${updated} output(s) updated, ${outputs.length - updated} left as-is.`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
