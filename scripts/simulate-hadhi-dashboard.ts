import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "", max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hadhi = await prisma.user.findFirst({
    where: { name: { contains: "Hadhi", mode: "insensitive" } },
    select: { id: true, name: true, designation: true, role: true, cityId: true },
  });
  if (!hadhi) { console.log("Hadhi not found"); return; }
  console.log(`Found user: ${hadhi.name} id=${hadhi.id} designation=${hadhi.designation} role=${hadhi.role} cityId=${hadhi.cityId}\n`);

  // Replicate dashboard/page.tsx logic exactly.
  const teamIds = [hadhi.id]; // RP teamIds stays as just the user
  const isScoped = hadhi.designation === "RP" || hadhi.designation === "ZL" || hadhi.designation === "PM";
  console.log(`teamIds=${JSON.stringify(teamIds)} isScoped=${isScoped}\n`);

  const goalOwnerFilter = isScoped
    ? {
        OR: [
          { ownerId: { in: teamIds } },
          { coOwners: { some: { userId: { in: teamIds } } } },
        ],
      }
    : {};
  const goalWhere = goalOwnerFilter;

  const goals = await prisma.goal.findMany({
    where: { deletedAt: null, ...goalWhere },
    select: {
      id: true, title: true, status: true,
      ownerId: true, owner: { select: { id: true, name: true } },
      coOwners: { select: { userId: true, user: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log(`Goals visible to Hadhi: ${goals.length}\n`);
  for (const g of goals) {
    const role = g.ownerId === hadhi.id ? "OWNER" : "CO-OWNER";
    const coOwnerNames = g.coOwners.map(c => c.user.name).join(", ");
    console.log(`  [${role}] "${g.title}" (${g.status})  owner=${g.owner?.name ?? "?"}  coOwners=[${coOwnerNames}]`);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
