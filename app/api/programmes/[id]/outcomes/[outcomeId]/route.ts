import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; outcomeId: string }> },
) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, outcomeId } = await params;
  const body = await req.json();
  const {
    label, description, unit,
    captureSource, bindingTemplateSlug, bindingChecklistKey,
    targetValue, targetCadence, sortOrder, isActive,
  } = body;

  await prisma.$executeRaw`
    UPDATE "ProgrammeJourneyOutcome" SET
      label = COALESCE(${label ?? null}::text, label),
      description = CASE WHEN ${description !== undefined}::boolean THEN ${description ?? null}::text ELSE description END,
      unit = CASE WHEN ${unit !== undefined}::boolean THEN ${unit ?? null}::text ELSE unit END,
      "captureSource" = COALESCE(${captureSource ?? null}::text, "captureSource"),
      "bindingTemplateSlug" = CASE WHEN ${bindingTemplateSlug !== undefined}::boolean THEN ${bindingTemplateSlug ?? null}::text ELSE "bindingTemplateSlug" END,
      "bindingChecklistKey" = CASE WHEN ${bindingChecklistKey !== undefined}::boolean THEN ${bindingChecklistKey ?? null}::text ELSE "bindingChecklistKey" END,
      "targetValue" = CASE WHEN ${targetValue !== undefined}::boolean THEN ${targetValue ?? null}::double precision ELSE "targetValue" END,
      "targetCadence" = CASE WHEN ${targetCadence !== undefined}::boolean THEN ${targetCadence ?? null}::text ELSE "targetCadence" END,
      "sortOrder" = COALESCE(${sortOrder ?? null}::int, "sortOrder"),
      "isActive" = COALESCE(${isActive ?? null}::boolean, "isActive"),
      "updatedAt" = NOW()
    WHERE id = ${outcomeId} AND "journeyId" = ${id}
  `;

  return Response.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; outcomeId: string }> },
) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, outcomeId } = await params;
  await prisma.$executeRaw`
    DELETE FROM "ProgrammeJourneyOutcome" WHERE id = ${outcomeId} AND "journeyId" = ${id}
  `;
  return Response.json({ ok: true });
}
