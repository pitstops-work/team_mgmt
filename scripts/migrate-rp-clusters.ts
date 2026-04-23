import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_RPClusters" (
      "A" TEXT NOT NULL,
      "B" TEXT NOT NULL,
      CONSTRAINT "_RPClusters_AB_pkey" PRIMARY KEY ("A","B")
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "_RPClusters_B_index" ON "_RPClusters"("B")`
  );
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "_RPClusters" ADD CONSTRAINT "_RPClusters_A_fkey" FOREIGN KEY ("A") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    );
  } catch { console.log("A fkey already exists"); }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "_RPClusters" ADD CONSTRAINT "_RPClusters_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    );
  } catch { console.log("B fkey already exists"); }
  console.log("Migration done: _RPClusters table ready");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
