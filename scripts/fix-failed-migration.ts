import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Show current state
  const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; logs: string | null; rolled_back_at: Date | null }[]>`
    SELECT migration_name, finished_at, logs, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name IN ('0050_goal_template_def', '0051_rp_cluster_assignment')
    ORDER BY migration_name
  `;
  console.log("Current state:", JSON.stringify(rows, null, 2));

  // Fix 0050: delete the failed record, insert a clean successful one
  await prisma.$executeRaw`
    DELETE FROM "_prisma_migrations"
    WHERE migration_name = '0050_goal_template_def'
  `;

  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (
      gen_random_uuid()::text,
      'resolved',
      NOW(),
      '0050_goal_template_def',
      NULL,
      NULL,
      NOW(),
      1
    )
  `;
  console.log("Fixed 0050_goal_template_def — replaced failed record with successful one");

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
