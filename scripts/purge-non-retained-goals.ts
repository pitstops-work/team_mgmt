/**
 * Purge all goals (and their cascading data) NOT owned by Shrinivas, Mathew, or Kiran.
 *
 * DRY RUN by default — pass --execute to actually delete.
 *
 * Usage:
 *   npx tsx scripts/purge-non-retained-goals.ts           # dry run
 *   npx tsx scripts/purge-non-retained-goals.ts --execute # live delete
 */

import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const DB_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) { console.error("No DATABASE_URL"); process.exit(1); }

const adapter = new PrismaPg({ connectionString: DB_URL, max: 1 });
const prisma = new PrismaClient({ adapter });

const EXECUTE = process.argv.includes("--execute");

// Names to match (case-insensitive substring)
const RETAINED_NAMES = ["shrinivas", "mathew", "kiran"];

async function main() {
  // 1. Find all users
  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  // 2. Identify retained users
  const retainedUsers = allUsers.filter((u) =>
    RETAINED_NAMES.some((n) => u.name?.toLowerCase().includes(n))
  );

  console.log("=== RETAINED USERS ===");
  if (retainedUsers.length === 0) {
    console.error("ERROR: No users found matching Shrinivas / Mathew / Kiran. Aborting.");
    await prisma.$disconnect();
    process.exit(1);
  }
  retainedUsers.forEach((u) => console.log(`  ✓ ${u.name} <${u.email}> [${u.id}]`));

  const retainedIds = new Set(retainedUsers.map((u) => u.id));

  // 3. Find goals to DELETE (owner NOT in retained set)
  const goalsToDelete = await prisma.goal.findMany({
    where: { ownerId: { notIn: Array.from(retainedIds) } },
    select: {
      id: true,
      title: true,
      status: true,
      owner: { select: { name: true, email: true } },
      _count: { select: { pitstops: true, threads: true, attachments: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // 4. Find goals to KEEP (for reference)
  const goalsToKeep = await prisma.goal.findMany({
    where: { ownerId: { in: Array.from(retainedIds) } },
    select: {
      id: true,
      title: true,
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n=== GOALS TO KEEP ===");
  goalsToKeep.forEach((g) => console.log(`  ✓ [${g.owner?.name}] ${g.title}`));

  console.log("\n=== GOALS TO DELETE ===");
  if (goalsToDelete.length === 0) {
    console.log("  Nothing to delete — all goals are already owned by retained users.");
    await prisma.$disconnect();
    return;
  }

  let totalPitstops = 0;
  for (const g of goalsToDelete) {
    totalPitstops += g._count.pitstops;
    console.log(
      `  ✗ [${g.owner?.name ?? "unknown"} <${g.owner?.email}>] "${g.title}"` +
      ` | ${g._count.pitstops} pitstops | ${g._count.threads} threads | ${g._count.attachments} attachments`
    );
  }

  console.log(`\nSummary: ${goalsToDelete.length} goals, ~${totalPitstops} pitstops to delete.`);

  if (!EXECUTE) {
    console.log("\n⚠️  DRY RUN — nothing was deleted.");
    console.log("   Re-run with --execute to perform the actual deletion.");
    await prisma.$disconnect();
    return;
  }

  // 5. Execute deletion
  console.log("\n🗑️  Deleting...");
  const deleteIds = goalsToDelete.map((g) => g.id);

  // All child tables (Pitstop, ChecklistItem, Thread, Attachment, PitstopDependency,
  // PitstopEventPitstop, PlanItemPitstop, etc.) have onDelete: Cascade, so deleting
  // the Goal rows is sufficient.
  const result = await prisma.goal.deleteMany({ where: { id: { in: deleteIds } } });
  console.log(`✅  Deleted ${result.count} goals and all their cascading data.`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
