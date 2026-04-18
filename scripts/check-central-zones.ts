import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never);

const STALE_ZONE_ID       = "cmnstb53p000104jqfjtm5dnv"; // Central under deleted Bangalore
const STALE_CLUSTER_ID    = "cmnstbhwx000204jq5y3fvjxx"; // Majestic
const STALE_SETTLEMENT_ID = "cmo0e5csf000grivckrc2lmj5"; // Majestic (Aggregate)

async function main() {
  const now = new Date();

  // Soft-delete in leaf-first order
  const s = await (prisma as any).settlement.update({
    where: { id: STALE_SETTLEMENT_ID },
    data: { deletedAt: now },
    select: { name: true },
  });
  console.log(`Soft-deleted settlement: "${s.name}"`);

  const cl = await (prisma as any).cluster.update({
    where: { id: STALE_CLUSTER_ID },
    data: { deletedAt: now },
    select: { name: true },
  });
  console.log(`Soft-deleted cluster: "${cl.name}"`);

  const z = await (prisma as any).zone.update({
    where: { id: STALE_ZONE_ID },
    data: { deletedAt: now },
    select: { name: true },
  });
  console.log(`Soft-deleted zone: "${z.name}"`);

  console.log("\nDone. The stale Bangalore Central / Majestic (Aggregate) entries are now hidden.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
