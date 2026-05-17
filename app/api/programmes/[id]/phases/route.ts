import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { label, goalId, position, status = "Planned", notes } = body;
  if (!label) return Response.json({ error: "label required" }, { status: 400 });

  let pos = position;
  if (pos === undefined || pos === null) {
    const posRows = await prisma.$queryRaw<{ p: number | null }[]>`
      SELECT MAX(position) AS p FROM "ProgrammeJourneyPhase" WHERE "journeyId" = ${id}
    `;
    pos = (posRows[0]?.p ?? -1) + 1;
  }

  const phaseId = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourneyPhase" (
      id, "journeyId", position, label, "goalId", status, notes, "createdAt", "updatedAt"
    ) VALUES (
      ${phaseId}, ${id}, ${pos}, ${label}, ${goalId ?? null}, ${status}, ${notes ?? null}, NOW(), NOW()
    )
  `;
  return Response.json({ id: phaseId }, { status: 201 });
}
