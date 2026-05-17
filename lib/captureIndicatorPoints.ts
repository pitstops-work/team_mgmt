import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";

type ItemContext = {
  key: string | null;
  templateSlug: string | null;
  settlementId: string | null;
};

type Binding = {
  id: string;
  defId: string;
  numericField: string;
};

/**
 * Writes FacilityIndicatorPoint rows for an RP_ACTIVITY capture.
 *
 * Looks up bindings for the checklist item via (templateSlug, key), and for
 * each binding whose numericField is present in `values`, upserts the per-
 * settlement FacilityIndicator and inserts a time-series point.
 *
 * Silent on missing settlement / missing key / no bindings — completion
 * is never blocked by indicator capture failures.
 */
export async function captureIndicatorPointsForChecklistItem({
  itemId,
  values,
  capturedById,
}: {
  itemId: string;
  values: Record<string, number>;
  capturedById: string | null;
}) {
  if (!values || Object.keys(values).length === 0) return;

  const ctxRows = await prisma.$queryRaw<ItemContext[]>`
    SELECT
      ci.key,
      ci."templateSlug",
      COALESCE(g."needsSettlementId", p."needsSettlementId") AS "settlementId"
    FROM "ChecklistItem" ci
    JOIN "Pitstop" p ON p.id = ci."pitstopId"
    JOIN "Goal" g ON g.id = p."goalId"
    WHERE ci.id = ${itemId}
    LIMIT 1
  `;
  const ctx = ctxRows[0];
  if (!ctx?.key || !ctx?.templateSlug || !ctx?.settlementId) return;

  const bindings = await prisma.$queryRaw<Binding[]>`
    SELECT b.id, b."defId", b."numericField"
    FROM "ActivityIndicatorBinding" b
    JOIN "FacilityIndicatorDef" d ON d.id = b."defId"
    WHERE b."templateSlug" = ${ctx.templateSlug}
      AND b."checklistKey" = ${ctx.key}
      AND d."isActive" = true
  `;

  for (const b of bindings) {
    const raw = values[b.numericField];
    if (raw === undefined || raw === null || !isFinite(raw)) continue;

    const indicatorId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "FacilityIndicator" (
        id, "defId", "settlementId", "currentValue",
        "lastCapturedAt", "lastSource", "createdAt", "updatedAt"
      ) VALUES (
        ${indicatorId}, ${b.defId}, ${ctx.settlementId}, ${raw},
        NOW(), 'RP_ACTIVITY'::"FacilityIndicatorSource", NOW(), NOW()
      )
      ON CONFLICT ("defId", "settlementId") DO UPDATE SET
        "currentValue" = EXCLUDED."currentValue",
        "lastCapturedAt" = EXCLUDED."lastCapturedAt",
        "lastSource" = EXCLUDED."lastSource",
        "updatedAt" = NOW()
    `;

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "FacilityIndicator"
      WHERE "defId" = ${b.defId} AND "settlementId" = ${ctx.settlementId}
      LIMIT 1
    `;
    const resolvedIndicatorId = existing[0]?.id;
    if (!resolvedIndicatorId) continue;

    await prisma.$executeRaw`
      INSERT INTO "FacilityIndicatorPoint" (
        id, "indicatorId", value, "capturedAt", source,
        "sourceRefId", "capturedById", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${resolvedIndicatorId}, ${raw},
        NOW(), 'RP_ACTIVITY'::"FacilityIndicatorSource",
        ${itemId}, ${capturedById}, NOW()
      )
    `;
  }
}
