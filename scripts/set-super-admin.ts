/**
 * One-time script: set the ADMIN_EMAIL user's role to "super-admin".
 * Run with: npx tsx scripts/set-super-admin.ts
 */

import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const DB_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

if (!DB_URL) { console.error("No DATABASE_URL"); process.exit(1); }
if (!ADMIN_EMAIL) { console.error("No ADMIN_EMAIL in .env.local"); process.exit(1); }

const adapter = new PrismaPg({ connectionString: DB_URL, max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true, email: true, role: true } });
  if (!user) {
    console.error(`No user found with email: ${ADMIN_EMAIL}`);
    process.exit(1);
  }

  console.log(`Found user: ${user.email} (current role: ${user.role})`);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: "super-admin" },
    select: { id: true, email: true, role: true },
  });

  console.log(`Updated role to: ${updated.role}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
