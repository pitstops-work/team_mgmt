import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type RawRow = {
  checklistItemId: string;
  bindingId: string;
  numericField: string;
  defId: string;
  defLabel: string;
  defUnit: string | null;
  defColor: string;
};

type JourneyOutcomeRow = {
  checklistItemId: string;
  outcomeId: string;
  outcomeLabel: string;
  outcomeUnit: string | null;
  journeyId: string;
  journeyLabel: string;
};

export type ItemBinding = {
  kind: "facility" | "journey";
  bindingId: string;
  numericField: string;
  defId: string;
  defLabel: string;
  defUnit: string | null;
  defColor: string;
  journeyId?: string;
  journeyLabel?: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pitstopId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT ci.id AS "checklistItemId",
           b.id AS "bindingId",
           b."numericField",
           d.id AS "defId",
           d.label AS "defLabel",
           d.unit AS "defUnit",
           d.color AS "defColor"
    FROM "ChecklistItem" ci
    JOIN "ActivityIndicatorBinding" b
      ON b."templateSlug" = ci."templateSlug" AND b."checklistKey" = ci.key
    JOIN "FacilityIndicatorDef" d
      ON d.id = b."defId"
    WHERE ci."pitstopId" = ${pitstopId}
      AND ci.key IS NOT NULL AND ci."templateSlug" IS NOT NULL
      AND d."isActive" = true
    ORDER BY d."sortOrder", d.label
  `;

  // Journey outcomes bound to checklist items in this pitstop, scoped to this
  // pitstop's settlement. Each outcome surfaces only on the right (settlement,
  // template, key) intersection.
  const outcomeRows = await prisma.$queryRaw<JourneyOutcomeRow[]>`
    SELECT
      ci.id AS "checklistItemId",
      o.id AS "outcomeId",
      o.label AS "outcomeLabel",
      o.unit AS "outcomeUnit",
      j.id AS "journeyId",
      j.label AS "journeyLabel"
    FROM "ChecklistItem" ci
    JOIN "Pitstop" p   ON p.id = ci."pitstopId"
    JOIN "Goal" g      ON g.id = p."goalId"
    JOIN "ProgrammeJourney" j
      ON j."settlementId" = COALESCE(g."needsSettlementId", p."needsSettlementId")
    JOIN "ProgrammeJourneyOutcome" o
      ON o."journeyId" = j.id
     AND o."captureSource" = 'RP_ACTIVITY'
     AND o."isActive" = true
     AND o."bindingTemplateSlug" = ci."templateSlug"
     AND o."bindingChecklistKey" = ci.key
    WHERE ci."pitstopId" = ${pitstopId}
      AND ci.key IS NOT NULL AND ci."templateSlug" IS NOT NULL
  `;

  const byItem: Record<string, ItemBinding[]> = {};
  for (const r of rows) {
    (byItem[r.checklistItemId] ??= []).push({
      kind: "facility",
      bindingId: r.bindingId,
      numericField: r.numericField,
      defId: r.defId,
      defLabel: r.defLabel,
      defUnit: r.defUnit,
      defColor: r.defColor,
    });
  }
  for (const r of outcomeRows) {
    (byItem[r.checklistItemId] ??= []).push({
      kind: "journey",
      bindingId: r.outcomeId,
      numericField: `outcome_${r.outcomeId.slice(0, 8)}`,
      defId: r.outcomeId,
      defLabel: r.outcomeLabel,
      defUnit: r.outcomeUnit,
      defColor: "#6366f1",
      journeyId: r.journeyId,
      journeyLabel: r.journeyLabel,
    });
  }

  return Response.json(byItem);
}
