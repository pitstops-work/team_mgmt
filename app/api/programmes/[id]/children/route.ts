import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

type ChildRow = {
  id: string;
  label: string;
  primaryDomain: string | null;
  status: string;
  phaseCount: bigint;
  donePhaseCount: bigint;
  outcomeCount: bigint;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await prisma.$queryRaw<ChildRow[]>`
    SELECT j.id, j.label, j."primaryDomain", j.status,
      (SELECT COUNT(*) FROM "ProgrammeJourneyPhase" p WHERE p."journeyId" = j.id) AS "phaseCount",
      (SELECT COUNT(*) FROM "ProgrammeJourneyPhase" p WHERE p."journeyId" = j.id AND p.status = 'Done') AS "donePhaseCount",
      (SELECT COUNT(*) FROM "ProgrammeJourneyOutcome" o WHERE o."journeyId" = j.id) AS "outcomeCount"
    FROM "ProgrammeJourney" j
    WHERE j."parentId" = ${id}
    ORDER BY j.label
  `;
  return Response.json(rows.map(r => ({
    ...r,
    phaseCount: Number(r.phaseCount),
    donePhaseCount: Number(r.donePhaseCount),
    outcomeCount: Number(r.outcomeCount),
  })));
}

/**
 * Attach an existing journey as a child of this super-journey.
 * Body: { childId: string } — child must share the same settlementId.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { childId } = await req.json();
  if (!childId) return Response.json({ error: "childId required" }, { status: 400 });
  if (childId === id) return Response.json({ error: "Cannot self-parent" }, { status: 400 });

  type Row = { id: string; settlementId: string; parentId: string | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, "settlementId", "parentId" FROM "ProgrammeJourney"
    WHERE id IN (${id}, ${childId})
  `;
  const parent = rows.find(r => r.id === id);
  const child = rows.find(r => r.id === childId);
  if (!parent || !child) return Response.json({ error: "Not found" }, { status: 404 });
  if (parent.settlementId !== child.settlementId) {
    return Response.json({ error: "Child must share settlement with super-journey" }, { status: 400 });
  }
  if (child.parentId) return Response.json({ error: "Child already has a parent" }, { status: 409 });

  await prisma.$executeRaw`
    UPDATE "ProgrammeJourney" SET "parentId" = ${id}, "updatedAt" = NOW() WHERE id = ${childId}
  `;
  return Response.json({ ok: true });
}

/**
 * Detach a child from this super-journey.
 * Query param: ?childId=...
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const url = new URL(req.url);
  const childId = url.searchParams.get("childId");
  if (!childId) return Response.json({ error: "childId required" }, { status: 400 });

  await prisma.$executeRaw`
    UPDATE "ProgrammeJourney" SET "parentId" = NULL, "updatedAt" = NOW()
    WHERE id = ${childId} AND "parentId" = ${id}
  `;
  return Response.json({ ok: true });
}
