import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; edgeId: string }> },
) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, edgeId } = await params;
  await prisma.$executeRaw`
    DELETE FROM "ProgrammeJourneyPhaseEdge" e
    USING "ProgrammeJourneyPhase" p
    WHERE e.id = ${edgeId} AND e."fromPhaseId" = p.id AND p."journeyId" = ${id}
  `;
  return Response.json({ ok: true });
}
