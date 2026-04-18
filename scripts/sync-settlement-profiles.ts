/**
 * scripts/sync-settlement-profiles.ts
 *
 * For each Settlement, takes its latest SettlementAssessment and writes a
 * flattened SettlementProfile row (upsert). Safe to re-run at any time.
 *
 * Run: npx tsx scripts/sync-settlement-profiles.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Fetch each settlement's latest assessment in a single query per settlement
  const settlements = await prisma.settlement.findMany({
    select: {
      id: true,
      assessments: {
        orderBy: { assessedAt: "desc" },
        take: 1,
        select: {
          id: true,
          totalHouseholds: true,
          children6m3yr: true,
          children4to14: true,
          youth15to21: true,
          elderly60plus: true,
          settlementType: true,
          priorityIssues: true,
        },
      },
    },
  });

  let created = 0, skipped = 0;

  for (const s of settlements) {
    const latest = s.assessments[0];
    if (!latest) { skipped++; continue; }

    await prisma.settlementProfile.upsert({
      where: { settlementId: s.id },
      create: {
        settlementId: s.id,
        totalHouseholds: latest.totalHouseholds,
        children6m3yr: latest.children6m3yr,
        children4to14: latest.children4to14,
        youth15to21: latest.youth15to21,
        elderly60plus: latest.elderly60plus,
        settlementType: latest.settlementType ?? null,
        priorityIssues: latest.priorityIssues ?? null,
        lastAssessmentId: latest.id,
        lastSyncedAt: new Date(),
      },
      update: {
        totalHouseholds: latest.totalHouseholds,
        children6m3yr: latest.children6m3yr,
        children4to14: latest.children4to14,
        youth15to21: latest.youth15to21,
        elderly60plus: latest.elderly60plus,
        settlementType: latest.settlementType ?? null,
        priorityIssues: latest.priorityIssues ?? null,
        lastAssessmentId: latest.id,
        lastSyncedAt: new Date(),
      },
    });
    created++;
  }

  console.log(`Done. Profiles synced: ${created}, settlements with no assessment: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
