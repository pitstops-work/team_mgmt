import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

type JourneyListRow = {
  id: string;
  key: string;
  label: string;
  primaryDomain: string | null;
  settlementId: string;
  settlementName: string | null;
  clusterId: string | null;
  status: string;
  phaseCount: bigint;
  outcomeCount: bigint;
  activePhaseCount: bigint;
  donePhaseCount: bigint;
  latestOutcomeAt: Date | null;
  updatedAt: Date;
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const settlementId = url.searchParams.get("settlement");
  const clusterId = url.searchParams.get("cluster");
  const domain = url.searchParams.get("domain");
  const status = url.searchParams.get("status");

  // City scope: admins see all; everyone else is restricted to journeys whose
  // settlement belongs to their assigned city (null cityId = no restriction).
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { cityId: true },
  });
  const scopeCityId = isAdminUser(session) ? null : (me?.cityId ?? null);

  const rows = await prisma.$queryRaw<JourneyListRow[]>`
    SELECT
      j.id, j.key, j.label, j."primaryDomain",
      j."settlementId",
      s.name AS "settlementName",
      s."clusterId",
      j.status,
      (SELECT COUNT(*) FROM "ProgrammeJourneyPhase" p WHERE p."journeyId" = j.id) AS "phaseCount",
      (SELECT COUNT(*) FROM "ProgrammeJourneyOutcome" o WHERE o."journeyId" = j.id AND o."isActive") AS "outcomeCount",
      (SELECT COUNT(*) FROM "ProgrammeJourneyPhase" p WHERE p."journeyId" = j.id AND p.status = 'Active') AS "activePhaseCount",
      (SELECT COUNT(*) FROM "ProgrammeJourneyPhase" p WHERE p."journeyId" = j.id AND p.status = 'Done') AS "donePhaseCount",
      (SELECT MAX(pt."capturedAt") FROM "ProgrammeJourneyOutcomePoint" pt
        JOIN "ProgrammeJourneyOutcome" o ON o.id = pt."outcomeId"
        WHERE o."journeyId" = j.id) AS "latestOutcomeAt",
      j."updatedAt"
    FROM "ProgrammeJourney" j
    LEFT JOIN "Settlement" s ON s.id = j."settlementId"
    WHERE
      (${settlementId}::text IS NULL OR j."settlementId" = ${settlementId})
      AND (${clusterId}::text IS NULL OR s."clusterId" = ${clusterId})
      AND (${domain}::text IS NULL OR j."primaryDomain" = ${domain})
      AND (${status}::text IS NULL OR j.status = ${status})
      AND (${scopeCityId}::text IS NULL OR s."cityId" = ${scopeCityId})
    ORDER BY j."updatedAt" DESC
  `;

  return Response.json(
    rows.map((r) => ({
      ...r,
      phaseCount: Number(r.phaseCount),
      outcomeCount: Number(r.outcomeCount),
      activePhaseCount: Number(r.activePhaseCount),
      donePhaseCount: Number(r.donePhaseCount),
    })),
  );
}
