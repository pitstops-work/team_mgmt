import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";

/**
 * Slugify a string for use as a journey key.
 */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Infer a phase label from a goal template slug.
 *  - "*-existing" → "Operations"
 *  - "*-renewal"  → "Renewal"
 *  - otherwise    → "Setup"
 */
function inferPhaseLabel(templateSlug: string): string {
  if (templateSlug.endsWith("-existing")) return "Operations";
  if (templateSlug.endsWith("-renewal")) return "Renewal";
  if (templateSlug.endsWith("-launch")) return "Launch";
  return "Setup";
}

/**
 * Upserts a ProgrammeJourney for the (domain, settlement) pair and attaches a
 * new phase fulfilled by the given goal. Auto-creates an edge from the most-
 * recent prior phase (linear chain by default).
 *
 * Idempotent: if a phase already exists for the goal, returns without changes.
 *
 * Silent on missing data; caller should not block goal creation on failures.
 */
export async function attachGoalToProgrammeJourney({
  goalId,
  templateSlug,
  domain,
  settlementId,
}: {
  goalId: string;
  templateSlug: string;
  domain: string | null | undefined;
  settlementId: string | null | undefined;
}) {
  if (!domain || !settlementId) return;

  // Skip if this goal is already attached to any phase
  const existingPhase = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "ProgrammeJourneyPhase" WHERE "goalId" = ${goalId} LIMIT 1
  `;
  if (existingPhase[0]) return;

  // Find or create journey
  const settlementRow = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM "Settlement" WHERE id = ${settlementId} LIMIT 1
  `;
  const settlementName = settlementRow[0]?.name ?? settlementId;

  let journeyId: string;
  let firstPhase = false;
  const found = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "ProgrammeJourney"
    WHERE "primaryDomain" = ${domain} AND "settlementId" = ${settlementId}
    LIMIT 1
  `;
  if (found[0]) {
    journeyId = found[0].id;
  } else {
    journeyId = randomUUID();
    const key = `${slugify(domain)}-${slugify(settlementName)}-${journeyId.slice(0, 6)}`;
    await prisma.$executeRaw`
      INSERT INTO "ProgrammeJourney" (id, key, label, "primaryDomain", "settlementId", status, "createdAt", "updatedAt")
      VALUES (${journeyId}, ${key}, ${`${domain} · ${settlementName}`}, ${domain}, ${settlementId}, 'Active', NOW(), NOW())
    `;
    firstPhase = true;
  }

  // Find current max position
  const posRows = await prisma.$queryRaw<{ p: number | null }[]>`
    SELECT MAX(position) AS p FROM "ProgrammeJourneyPhase" WHERE "journeyId" = ${journeyId}
  `;
  const nextPos = (posRows[0]?.p ?? -1) + 1;

  const phaseId = randomUUID();
  const phaseLabel = inferPhaseLabel(templateSlug);
  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourneyPhase" (
      id, "journeyId", position, label, "goalId", status, "createdAt", "updatedAt"
    ) VALUES (
      ${phaseId}, ${journeyId}, ${nextPos}, ${phaseLabel}, ${goalId}, 'Active', NOW(), NOW()
    )
  `;

  // Auto-edge from the most recent prior phase (linear chain default)
  if (!firstPhase) {
    const priorRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ProgrammeJourneyPhase"
      WHERE "journeyId" = ${journeyId} AND id != ${phaseId}
      ORDER BY position DESC LIMIT 1
    `;
    const priorId = priorRows[0]?.id;
    if (priorId) {
      await prisma.$executeRaw`
        INSERT INTO "ProgrammeJourneyPhaseEdge" (id, "fromPhaseId", "toPhaseId")
        VALUES (${randomUUID()}, ${priorId}, ${phaseId})
        ON CONFLICT ("fromPhaseId", "toPhaseId") DO NOTHING
      `;
    }
  }

  return { journeyId, phaseId };
}
