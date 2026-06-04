/**
 * Read-only: for the Bheemankuppe creche goal, show what's reachable via
 * linkedFacility → cluster vs the direct needsCluster/needsSettlement. Settles
 * whether we can backfill from one side or need to teach the activity render
 * to read both.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { default: prisma } = await import("../lib/prisma");

  const goal = await prisma.goal.findUnique({
    where: { id: "cmpxwn2x0000104if87r4f6pu" },
    select: {
      id: true, title: true, needsDomain: true,
      needsCluster:    { select: { id: true, name: true } },
      needsSettlement: { select: { id: true, name: true } },
      needsZone:       { select: { id: true, name: true } },
      linkedFacility:  {
        select: {
          id: true, name: true, layerKey: true,
          cluster:    { select: { id: true, name: true } },
          settlement: { select: { id: true, name: true } },
          zone:       { select: { id: true, name: true } },
        },
      },
    },
  });
  console.log("Bheemankuppe creche goal:");
  console.log(JSON.stringify(goal, null, 2));

  // Also: how often across the system does goal have linkedFacility but no
  // needsCluster? That's the population that benefits from the fix.
  const totalActive = await prisma.goal.count({
    where: { deletedAt: null, status: { not: "Complete" } },
  });
  const linkedNoCluster = await prisma.goal.count({
    where: {
      deletedAt: null,
      status: { not: "Complete" },
      linkedFacilityId: { not: null },
      needsClusterId: null,
    },
  });
  const linkedHasCluster = await prisma.goal.count({
    where: {
      deletedAt: null,
      status: { not: "Complete" },
      linkedFacilityId: { not: null },
      needsClusterId: { not: null },
    },
  });
  console.log(`\nActive goals total: ${totalActive}`);
  console.log(`  with linkedFacility AND needsCluster set: ${linkedHasCluster}`);
  console.log(`  with linkedFacility but needsCluster NULL: ${linkedNoCluster}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
