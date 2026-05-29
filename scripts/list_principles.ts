import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const pages = await prisma.wikiPage.findMany({
    where: { type: "principle" },
  });
  for (const p of pages) {
    console.log(`---`);
    console.log(JSON.stringify(p, null, 2));
  }
  const owner = await prisma.user.findFirst({ where: { email: "kotlerster@gmail.com" }, select: { id: true, email: true, name: true } });
  console.log(`\nowner lookup:`, owner);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect().finally(() => process.exit(1)); });
