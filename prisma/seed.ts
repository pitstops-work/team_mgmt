import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = await bcrypt.hash("password", 10);

  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: { name: "Alice Chen", email: "alice@example.com", password },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: { name: "Bob Williams", email: "bob@example.com", password },
  });

  const goal = await prisma.goal.upsert({
    where: { id: "seed-goal-1" },
    update: {},
    create: {
      id: "seed-goal-1",
      title: "Launch Product v1.0",
      description: "Ship the first public version of Pitstop to early adopters.",
      status: "Active",
      ownerId: alice.id,
    },
  });

  const pitstop = await prisma.pitstop.upsert({
    where: { id: "seed-pitstop-1" },
    update: {},
    create: {
      id: "seed-pitstop-1",
      title: "Kickoff Meeting",
      type: "Meeting",
      notes: "Align on scope, timeline, and responsibilities.",
      status: "Done",
      goalId: goal.id,
    },
  });

  const thread = await prisma.thread.upsert({
    where: { id: "seed-thread-1" },
    update: {},
    create: {
      id: "seed-thread-1",
      name: "agenda",
      pitstopId: pitstop.id,
    },
  });

  await prisma.message.create({
    data: {
      body: "Here's what we need to cover:\n1. Project scope\n2. Tech stack decisions\n3. Next steps",
      authorId: alice.id,
      threadId: thread.id,
    },
  });

  await prisma.message.create({
    data: {
      body: `Sounds good @[Alice Chen](${alice.id}). I'll handle the infrastructure setup.`,
      authorId: bob.id,
      threadId: thread.id,
    },
  });

  console.log("Seed complete. Login with alice@example.com / password");
}

main().catch(console.error).finally(() => prisma.$disconnect());
