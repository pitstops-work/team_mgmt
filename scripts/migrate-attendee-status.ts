import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.join(__dirname, "../.env.local") });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "PitstopEventAttendee" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'accepted'`
  );
  // Mark migration as applied
  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "_prisma_migrations" WHERE migration_name = '0052_attendee_status' LIMIT 1
  `;
  if (existing.length === 0) {
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (gen_random_uuid()::text, 'resolved', NOW(), '0052_attendee_status', NULL, NULL, NOW(), 1)
    `;
  }
  console.log("Done: status column added to PitstopEventAttendee");
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
