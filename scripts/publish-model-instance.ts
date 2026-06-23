// Set or clear ModelInstance.publicSlug so the instance is reachable at
// /models-public/<slug>. Idempotent.
//
// Usage:
//   npx tsx scripts/publish-model-instance.ts <instanceId> <slug>     # publish
//   npx tsx scripts/publish-model-instance.ts <instanceId> --unpublish # take down
//   npx tsx scripts/publish-model-instance.ts --list                   # show published

import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [arg1, arg2] = process.argv.slice(2);

  if (arg1 === "--list") {
    const rows = await prisma.modelInstance.findMany({
      where: { publicSlug: { not: null } },
      select: { id: true, name: true, publicSlug: true, scenarioName: true, template: { select: { name: true, key: true } } },
      orderBy: { updatedAt: "desc" },
    });
    if (rows.length === 0) { console.log("(no instances published)"); return; }
    console.log(`Published instances:\n`);
    for (const r of rows) {
      console.log(`  /models-public/${r.publicSlug}`);
      console.log(`    ${r.template.name}${r.scenarioName ? " · " + r.scenarioName : ""}  (${r.template.key})`);
      console.log(`    instance id: ${r.id}    name: ${r.name}\n`);
    }
    return;
  }

  if (!arg1) {
    console.error("usage:");
    console.error("  npx tsx scripts/publish-model-instance.ts <instanceId> <slug>");
    console.error("  npx tsx scripts/publish-model-instance.ts <instanceId> --unpublish");
    console.error("  npx tsx scripts/publish-model-instance.ts --list");
    process.exit(1);
  }

  const inst = await prisma.modelInstance.findUnique({
    where: { id: arg1 },
    select: { id: true, name: true, publicSlug: true, template: { select: { name: true } } },
  });
  if (!inst) { console.error(`Instance ${arg1} not found`); process.exit(1); }

  if (arg2 === "--unpublish") {
    await prisma.modelInstance.update({ where: { id: arg1 }, data: { publicSlug: null } });
    console.log(`✔ Unpublished — ${inst.template.name} (${inst.name})`);
    if (inst.publicSlug) console.log(`  was at /models-public/${inst.publicSlug}`);
    return;
  }

  if (!arg2 || /[^a-z0-9-]/.test(arg2)) {
    console.error(`Slug "${arg2}" invalid. Use lowercase letters, digits, hyphens only.`);
    process.exit(1);
  }

  // Free up the slug if another instance currently holds it
  const holder = await prisma.modelInstance.findUnique({ where: { publicSlug: arg2 }, select: { id: true, name: true } });
  if (holder && holder.id !== arg1) {
    await prisma.modelInstance.update({ where: { id: holder.id }, data: { publicSlug: null } });
    console.log(`✔ Unpublished previous holder of "${arg2}" — ${holder.name}`);
  }

  await prisma.modelInstance.update({ where: { id: arg1 }, data: { publicSlug: arg2 } });
  console.log(`✔ Published — ${inst.template.name} (${inst.name})`);
  console.log(`  URL: /models-public/${arg2}`);
  console.log(`  Embed: /models-public/${arg2}?embed=1`);
}
main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
