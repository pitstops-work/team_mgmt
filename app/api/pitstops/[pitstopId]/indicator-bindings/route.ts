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

export type ItemBinding = {
  bindingId: string;
  numericField: string;
  defId: string;
  defLabel: string;
  defUnit: string | null;
  defColor: string;
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

  const byItem: Record<string, ItemBinding[]> = {};
  for (const r of rows) {
    (byItem[r.checklistItemId] ??= []).push({
      bindingId: r.bindingId,
      numericField: r.numericField,
      defId: r.defId,
      defLabel: r.defLabel,
      defUnit: r.defUnit,
      defColor: r.defColor,
    });
  }

  return Response.json(byItem);
}
