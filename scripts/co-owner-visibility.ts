import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "", max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  // All co-owner records on still-active (non-deleted) goals.
  const records = await prisma.goalCoOwner.findMany({
    where: { goal: { deletedAt: null } },
    include: {
      goal: { select: { id: true, title: true, status: true, ownerId: true } },
      user: { select: { id: true, name: true, designation: true } },
    },
  });

  console.log(`Co-owner rows on active goals: ${records.length}\n`);

  // Group by user.
  const byUser = new Map<string, typeof records>();
  for (const r of records) {
    const arr = byUser.get(r.user.id) ?? [];
    arr.push(r);
    byUser.set(r.user.id, arr);
  }

  console.log(`Distinct co-owner users: ${byUser.size}\n`);
  for (const [userId, rows] of byUser) {
    const user = rows[0].user;
    console.log(`${user.name ?? userId} (${user.designation ?? "?"}) — ${rows.length} co-owned active goal(s)`);
    for (const r of rows) {
      console.log(`  - "${r.goal.title}" (${r.goal.status})`);
    }
    console.log("");
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
