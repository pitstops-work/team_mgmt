import prisma from "../lib/prisma";

async function main() {
  const rows = await prisma.$queryRaw<{
    id: string; label: string; primaryDomain: string | null;
    settlementName: string | null; phaseCount: bigint; outcomeCount: bigint;
  }[]>`
    SELECT j.id, j.label, j."primaryDomain",
           s.name AS "settlementName",
           (SELECT COUNT(*) FROM "ProgrammeJourneyPhase" p WHERE p."journeyId" = j.id) AS "phaseCount",
           (SELECT COUNT(*) FROM "ProgrammeJourneyOutcome" o WHERE o."journeyId" = j.id) AS "outcomeCount"
    FROM "ProgrammeJourney" j
    LEFT JOIN "Settlement" s ON s.id = j."settlementId"
    ORDER BY j."updatedAt" DESC
    LIMIT 20
  `;
  console.log(`Total journeys: ${rows.length}`);
  for (const r of rows) {
    console.log(`  ${r.id} · ${r.label.padEnd(50)} ${Number(r.phaseCount)} phases · ${Number(r.outcomeCount)} outcomes`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
