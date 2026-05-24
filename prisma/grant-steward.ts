// One-off: grant the steward WikiRole to a user by email.
// Run with: npx tsx prisma/grant-steward.ts <email>

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx prisma/grant-steward.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const row = await prisma.wikiStaff.upsert({
    where: { userId_wikiRole: { userId: user.id, wikiRole: "steward" } },
    update: {},
    create: { userId: user.id, wikiRole: "steward" },
  });
  console.log(`Granted steward to ${user.name ?? user.email} (${user.id}). WikiStaff id=${row.id}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
