import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phaseId: string }> },
) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, phaseId } = await params;
  const body = await req.json();
  const { label, status, position, notes, goalId, canvasX, canvasY } = body;

  await prisma.$executeRaw`
    UPDATE "ProgrammeJourneyPhase" SET
      label = COALESCE(${label ?? null}::text, label),
      status = COALESCE(${status ?? null}::text, status),
      position = COALESCE(${position ?? null}::int, position),
      notes = CASE WHEN ${notes !== undefined}::boolean THEN ${notes ?? null}::text ELSE notes END,
      "goalId" = CASE WHEN ${goalId !== undefined}::boolean THEN ${goalId ?? null}::text ELSE "goalId" END,
      "canvasX" = CASE WHEN ${canvasX !== undefined}::boolean THEN ${canvasX ?? null}::int ELSE "canvasX" END,
      "canvasY" = CASE WHEN ${canvasY !== undefined}::boolean THEN ${canvasY ?? null}::int ELSE "canvasY" END,
      "updatedAt" = NOW()
    WHERE id = ${phaseId} AND "journeyId" = ${id}
  `;
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; phaseId: string }> },
) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, phaseId } = await params;
  await prisma.$executeRaw`
    DELETE FROM "ProgrammeJourneyPhase" WHERE id = ${phaseId} AND "journeyId" = ${id}
  `;
  return Response.json({ ok: true });
}
