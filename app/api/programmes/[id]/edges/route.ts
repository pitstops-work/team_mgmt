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
  const { fromPhaseId, toPhaseId, label } = body;
  if (!fromPhaseId || !toPhaseId) return Response.json({ error: "fromPhaseId + toPhaseId required" }, { status: 400 });
  if (fromPhaseId === toPhaseId) return Response.json({ error: "Self-edges not allowed" }, { status: 400 });

  // Both phases must belong to this journey
  const check = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM "ProgrammeJourneyPhase"
    WHERE id IN (${fromPhaseId}, ${toPhaseId}) AND "journeyId" = ${id}
  `;
  if (Number(check[0]?.c ?? 0) !== 2) return Response.json({ error: "Phases not in this journey" }, { status: 400 });

  const edgeId = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "ProgrammeJourneyPhaseEdge" (id, "fromPhaseId", "toPhaseId", label)
      VALUES (${edgeId}, ${fromPhaseId}, ${toPhaseId}, ${label ?? null})
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique")) return Response.json({ error: "Edge already exists" }, { status: 409 });
    return Response.json({ error: msg }, { status: 500 });
  }
  return Response.json({ id: edgeId }, { status: 201 });
}
