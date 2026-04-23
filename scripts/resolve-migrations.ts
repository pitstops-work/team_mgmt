/**
 * Marks pending migrations as already applied when the schema was created manually.
 * Run with: npx tsx scripts/resolve-migrations.ts
 */
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

// Migrations to mark as applied (because we ran the DDL manually)
const MIGRATIONS_TO_RESOLVE = [
  "0050_goal_template_def",
  "0051_rp_cluster_assignment",
];

async function main() {
  for (const name of MIGRATIONS_TO_RESOLVE) {
    // Check if already recorded
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "_prisma_migrations" WHERE migration_name = ${name} LIMIT 1
    `;
    if (existing.length > 0) {
      console.log(`  ✓ ${name} already recorded`);
      continue;
    }

    // Read the SQL file to get checksum
    const sqlPath = path.join(__dirname, `../prisma/migrations/${name}/migration.sql`);
    const sql = fs.readFileSync(sqlPath, "utf-8");

    // Insert as applied (finished_at = now, no logs = success)
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        gen_random_uuid()::text,
        md5(${sql})::text,
        NOW(),
        ${name},
        NULL,
        NULL,
        NOW(),
        1
      )
    `;
    console.log(`  ✓ Marked ${name} as applied`);
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
