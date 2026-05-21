import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "", max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Any GoalCoOwner rows in the DB at all?
  const total = await prisma.goalCoOwner.count();
  console.log(`Total GoalCoOwner rows: ${total}`);
  if (total === 0) {
    console.log("→ No co-owner records exist. Either none were added, or the add isn't persisting.");
    await prisma.$disconnect();
    return;
  }

  // 2. Show first 20 co-owners with goal title + user name.
  const rows = await prisma.goalCoOwner.findMany({
    take: 20,
    include: {
      goal: { select: { id: true, title: true, status: true, deletedAt: true, owner: { select: { name: true } } } },
      user: { select: { id: true, name: true, designation: true } },
    },
  });
  console.log("\nSample co-owner records:");
  for (const r of rows) {
    const deleted = r.goal.deletedAt ? " [DELETED]" : "";
    console.log(`  goal="${r.goal.title}" (${r.goal.status})${deleted}`);
    console.log(`    owner=${r.goal.owner?.name ?? "?"}  co-owner=${r.user.name ?? "?"} (${r.user.designation ?? "?"})  userId=${r.user.id}`);
  }

  // 3. For each co-owner user, simulate the home-page goal query.
  const uniqueUserIds = [...new Set(rows.map(r => r.user.id))].slice(0, 5);
  console.log("\nSimulating home goal query per co-owner:");
  for (const userId of uniqueUserIds) {
    const user = rows.find(r => r.user.id === userId)?.user;
    const visible = await prisma.goal.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { coOwners: { some: { userId } } },
        ],
      },
      select: { id: true, title: true, ownerId: true, coOwners: { select: { userId: true } } },
    });
    const coOwned = visible.filter(g => g.ownerId !== userId);
    console.log(`  ${user?.name ?? userId}: ${visible.length} total visible, ${coOwned.length} as co-owner`);
    for (const g of coOwned.slice(0, 3)) {
      console.log(`    - "${g.title}"`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
