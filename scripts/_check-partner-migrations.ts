import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM _prisma_migrations
    WHERE migration_name LIKE '20260604140%'
    ORDER BY migration_name
  `;
  console.log("Partner migrations status:");
  for (const r of rows) console.log(`  ${r.migration_name}  finished=${r.finished_at?.toISOString() ?? "PENDING"}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
