/**
 * Seeds a demo programme journey so you can walk through Layer 3 end-to-end
 * without first creating real goals. Pick any settlement; output is clearly
 * labelled "DEMO" so you can delete with one click.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/_seed-demo-journey.ts
 */

import { randomUUID } from "crypto";
import prisma from "../lib/prisma";

async function main() {
  // Find a settlement with a creche facility for plausibility
  const settlementRows = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT s.id, s.name
    FROM "Settlement" s
    WHERE s."deletedAt" IS NULL
    ORDER BY s.name ASC
    LIMIT 1
  `;
  const settlement = settlementRows[0];
  if (!settlement) { console.error("No settlements found"); process.exit(1); }

  // Wipe any prior demo journey to keep this idempotent
  await prisma.$executeRaw`DELETE FROM "ProgrammeJourney" WHERE key LIKE 'demo-ecd-%'`;

  const journeyId = randomUUID();
  const key = `demo-ecd-${journeyId.slice(0, 8)}`;
  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourney" (id, key, label, "primaryDomain", "settlementId", status, notes, "createdAt", "updatedAt")
    VALUES (${journeyId}, ${key}, ${`DEMO · ECD Ladder · ${settlement.name}`}, 'Creche', ${settlement.id}, 'Active',
            'Demo journey seeded by scripts/_seed-demo-journey.ts. Click the trash icon to remove.', NOW(), NOW())
  `;

  // Three phases — historical createdAt so the attribution view shows real bands
  const phaseSetup = randomUUID();
  const phaseOps = randomUUID();
  const phaseMain = randomUUID();

  // Phase active windows: Setup 12mo→9mo ago (Done), Ops 9mo→now (Active), Mainstreaming 3mo→now (Planned)
  const now = new Date();
  const setupStart  = new Date(now); setupStart.setMonth(setupStart.getMonth() - 12);
  const setupEnd    = new Date(now); setupEnd.setMonth(setupEnd.getMonth() - 9);
  const opsStart    = new Date(now); opsStart.setMonth(opsStart.getMonth() - 9);
  const mainStart   = new Date(now); mainStart.setMonth(mainStart.getMonth() - 3);

  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourneyPhase" (id, "journeyId", position, label, status, notes, "createdAt", "updatedAt")
    VALUES
      (${phaseSetup}, ${journeyId}, 0, 'Creche Setup',     'Done',    'Centre opened ~12 months ago.', ${setupStart}, ${setupEnd}),
      (${phaseOps},   ${journeyId}, 1, 'Creche Operations','Active',  'Currently in monthly cycle.', ${opsStart}, NOW()),
      (${phaseMain},  ${journeyId}, 2, 'Mainstreaming',    'Planned', 'Children aging out to govt school.', ${mainStart}, NOW())
  `;
  // Edges
  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourneyPhaseEdge" (id, "fromPhaseId", "toPhaseId")
    VALUES (${randomUUID()}, ${phaseSetup}, ${phaseOps}),
           (${randomUUID()}, ${phaseOps}, ${phaseMain})
  `;

  // Outcomes
  const o1 = randomUUID();
  const o2 = randomUUID();
  const o3 = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourneyOutcome" (
      id, "journeyId", key, label, description, unit,
      "captureSource", "targetValue", "targetCadence", "sortOrder", "isActive",
      "createdAt", "updatedAt"
    ) VALUES
      (${o1}, ${journeyId}, 'enrolled', 'Children enrolled',
        'Total children enrolled in the creche this month.', 'children',
        'MANUAL_ADMIN', 30, 'monthly', 1, true, NOW(), NOW()),
      (${o2}, ${journeyId}, 'attendance_pct', 'Avg daily attendance',
        'Average daily attendance as % of enrolled.', '%',
        'MANUAL_ADMIN', 75, 'monthly', 2, true, NOW(), NOW()),
      (${o3}, ${journeyId}, 'mainstreamed', 'Children mainstreamed (cumulative)',
        'Children who have transitioned to government school after creche.', 'children',
        'MANUAL_ADMIN', 20, 'annual', 3, true, NOW(), NOW())
  `;

  // Sample data points — 12 months of enrolment + attendance
  for (let m = 11; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    // Enrolment grows linearly with mild noise; first month is 8, plateau ~30
    const monthsIn = 11 - m;
    const enrolled   = Math.round(8 + monthsIn * 2 + (Math.random() * 3 - 1));
    const attendance = Math.round(45 + monthsIn * 2.5 + (Math.random() * 6 - 3));
    await prisma.$executeRaw`
      INSERT INTO "ProgrammeJourneyOutcomePoint" (id, "outcomeId", value, "capturedAt", source, "createdAt")
      VALUES (${randomUUID()}, ${o1}, ${enrolled}, ${d}, 'MANUAL_ADMIN', NOW()),
             (${randomUUID()}, ${o2}, ${attendance}, ${d}, 'MANUAL_ADMIN', NOW())
    `;
  }
  // Mainstreamed: 2 annual data points
  const lastYr = new Date(); lastYr.setFullYear(lastYr.getFullYear() - 1);
  const thisYr = new Date(); thisYr.setMonth(thisYr.getMonth() - 1);
  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourneyOutcomePoint" (id, "outcomeId", value, "capturedAt", source, "createdAt")
    VALUES (${randomUUID()}, ${o3}, 4, ${lastYr}, 'MANUAL_ADMIN', NOW()),
           (${randomUUID()}, ${o3}, 11, ${thisYr}, 'MANUAL_ADMIN', NOW())
  `;

  console.log("");
  console.log(`✓ Demo journey seeded for settlement: ${settlement.name}`);
  console.log("");
  console.log(`  → Browse:   /programmes/${journeyId}`);
  console.log(`  → Attribute: /programmes/${journeyId}/outcomes/${o1}`);
  console.log("");
  console.log("To remove: delete the journey from the detail page (trash icon).");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
