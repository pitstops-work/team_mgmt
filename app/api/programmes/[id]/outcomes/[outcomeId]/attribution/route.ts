import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type Outcome = {
  id: string; label: string; unit: string | null;
  targetValue: number | null; targetCadence: string | null;
};
type Point = { capturedAt: Date; value: number };
type PhaseSpan = {
  id: string; label: string; status: string;
  startedAt: Date | null; endedAt: Date | null;
  goalId: string | null; goalTitle: string | null;
};
type PhasePointContrib = {
  phaseId: string; phaseLabel: string;
  pointsCount: number;
  deltaFirst: number | null; // first→last delta while phase active
  startValue: number | null; endValue: number | null;
};

/**
 * Per-outcome attribution analysis: for each phase, what was the outcome's
 * movement while that phase was Active? Heuristic, not causal — visual
 * attribution rather than statistical.
 *
 * Returns:
 *  - outcome metadata
 *  - all points (time series)
 *  - all phases with their active-period spans
 *  - per-phase contribution: count of points captured during active span +
 *    first→last delta + start/end values
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; outcomeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, outcomeId } = await params;

  const outcomeRows = await prisma.$queryRaw<Outcome[]>`
    SELECT id, label, unit, "targetValue", "targetCadence"
    FROM "ProgrammeJourneyOutcome"
    WHERE id = ${outcomeId} AND "journeyId" = ${id}
    LIMIT 1
  `;
  const outcome = outcomeRows[0];
  if (!outcome) return Response.json({ error: "Outcome not found" }, { status: 404 });

  const points = await prisma.$queryRaw<Point[]>`
    SELECT "capturedAt", value
    FROM "ProgrammeJourneyOutcomePoint"
    WHERE "outcomeId" = ${outcomeId}
    ORDER BY "capturedAt" ASC
  `;

  // A phase's active span = earliest pitstop startDate → latest pitstop
  // completedAt (or NULL if still active). Heuristic; goalCompletedAt approach.
  const phaseSpans = await prisma.$queryRaw<PhaseSpan[]>`
    SELECT
      p.id, p.label, p.status,
      g.title AS "goalTitle", g.id AS "goalId",
      (SELECT MIN(pt."startDate") FROM "Pitstop" pt WHERE pt."goalId" = g.id) AS "startedAt",
      CASE WHEN p.status = 'Done' THEN (SELECT MAX(pt."completedAt") FROM "Pitstop" pt WHERE pt."goalId" = g.id)
           ELSE NULL END AS "endedAt"
    FROM "ProgrammeJourneyPhase" p
    LEFT JOIN "Goal" g ON g.id = p."goalId"
    WHERE p."journeyId" = ${id}
    ORDER BY "startedAt" NULLS LAST, p.position ASC
  `;

  // Per-phase contribution: for each phase with a startedAt, find points whose
  // capturedAt falls within [startedAt, endedAt ?? now]. Compute delta from
  // first to last in that window.
  const contributions: PhasePointContrib[] = phaseSpans.map((ps) => {
    if (!ps.startedAt) return { phaseId: ps.id, phaseLabel: ps.label, pointsCount: 0, deltaFirst: null, startValue: null, endValue: null };
    const endBound = ps.endedAt ? new Date(ps.endedAt) : new Date();
    const inWindow = points.filter(p => {
      const t = new Date(p.capturedAt);
      return t >= new Date(ps.startedAt!) && t <= endBound;
    });
    if (inWindow.length === 0) {
      return { phaseId: ps.id, phaseLabel: ps.label, pointsCount: 0, deltaFirst: null, startValue: null, endValue: null };
    }
    const start = inWindow[0].value;
    const end = inWindow[inWindow.length - 1].value;
    return {
      phaseId: ps.id, phaseLabel: ps.label,
      pointsCount: inWindow.length,
      startValue: start, endValue: end,
      deltaFirst: end - start,
    };
  });

  return Response.json({ outcome, points, phaseSpans, contributions });
}
