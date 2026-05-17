import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

type JourneyRow = {
  id: string;
  key: string;
  label: string;
  primaryDomain: string | null;
  settlementId: string;
  settlementName: string | null;
  clusterId: string | null;
  clusterName: string | null;
  status: string;
  notes: string | null;
  parentId: string | null;
  parentLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PhaseRow = {
  id: string;
  position: number;
  label: string;
  goalId: string | null;
  goalTitle: string | null;
  goalStatus: string | null;
  goalTargetDate: Date | null;
  status: string;
  notes: string | null;
  createdAt: Date;
};

type EdgeRow = {
  id: string;
  fromPhaseId: string;
  toPhaseId: string;
  label: string | null;
};

type OutcomeRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  unit: string | null;
  captureSource: string;
  bindingTemplateSlug: string | null;
  bindingChecklistKey: string | null;
  targetValue: number | null;
  targetCadence: string | null;
  sortOrder: number;
  isActive: boolean;
  latestValue: number | null;
  latestCapturedAt: Date | null;
  pointCount: bigint;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const journeyRows = await prisma.$queryRaw<JourneyRow[]>`
    SELECT
      j.id, j.key, j.label, j."primaryDomain",
      j."settlementId",
      s.name AS "settlementName",
      s."clusterId",
      c.name AS "clusterName",
      j.status, j.notes,
      j."parentId",
      pj.label AS "parentLabel",
      j."createdAt", j."updatedAt"
    FROM "ProgrammeJourney" j
    LEFT JOIN "Settlement" s ON s.id = j."settlementId"
    LEFT JOIN "Cluster" c ON c.id = s."clusterId"
    LEFT JOIN "ProgrammeJourney" pj ON pj.id = j."parentId"
    WHERE j.id = ${id} LIMIT 1
  `;
  const journey = journeyRows[0];
  if (!journey) return Response.json({ error: "Not found" }, { status: 404 });

  const phases = await prisma.$queryRaw<PhaseRow[]>`
    SELECT
      p.id, p.position, p.label, p."goalId",
      g.title AS "goalTitle",
      g.status::text AS "goalStatus",
      g."targetDate" AS "goalTargetDate",
      p.status, p.notes, p."createdAt"
    FROM "ProgrammeJourneyPhase" p
    LEFT JOIN "Goal" g ON g.id = p."goalId"
    WHERE p."journeyId" = ${id}
    ORDER BY p.position ASC, p."createdAt" ASC
  `;

  const edges = await prisma.$queryRaw<EdgeRow[]>`
    SELECT e.id, e."fromPhaseId", e."toPhaseId", e.label
    FROM "ProgrammeJourneyPhaseEdge" e
    JOIN "ProgrammeJourneyPhase" p1 ON p1.id = e."fromPhaseId"
    WHERE p1."journeyId" = ${id}
  `;

  const outcomes = await prisma.$queryRaw<OutcomeRow[]>`
    SELECT
      o.id, o.key, o.label, o.description, o.unit, o."captureSource",
      o."bindingTemplateSlug", o."bindingChecklistKey",
      o."targetValue", o."targetCadence", o."sortOrder", o."isActive",
      (SELECT pt.value FROM "ProgrammeJourneyOutcomePoint" pt
        WHERE pt."outcomeId" = o.id ORDER BY pt."capturedAt" DESC LIMIT 1) AS "latestValue",
      (SELECT pt."capturedAt" FROM "ProgrammeJourneyOutcomePoint" pt
        WHERE pt."outcomeId" = o.id ORDER BY pt."capturedAt" DESC LIMIT 1) AS "latestCapturedAt",
      (SELECT COUNT(*) FROM "ProgrammeJourneyOutcomePoint" pt WHERE pt."outcomeId" = o.id) AS "pointCount"
    FROM "ProgrammeJourneyOutcome" o
    WHERE o."journeyId" = ${id}
    ORDER BY o."sortOrder" ASC, o.label ASC
  `;

  return Response.json({
    journey,
    phases,
    edges,
    outcomes: outcomes.map((o) => ({ ...o, pointCount: Number(o.pointCount) })),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { label, status, notes, parentId } = body;

  await prisma.$executeRaw`
    UPDATE "ProgrammeJourney" SET
      label = COALESCE(${label ?? null}::text, label),
      status = COALESCE(${status ?? null}::text, status),
      notes = CASE WHEN ${notes !== undefined}::boolean THEN ${notes ?? null}::text ELSE notes END,
      "parentId" = CASE WHEN ${parentId !== undefined}::boolean THEN ${parentId ?? null}::text ELSE "parentId" END,
      "updatedAt" = NOW()
    WHERE id = ${id}
  `;

  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.$executeRaw`DELETE FROM "ProgrammeJourney" WHERE id = ${id}`;
  return Response.json({ ok: true });
}
