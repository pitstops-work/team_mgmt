import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // How many EntitlementBaseline rows have surveyEnrolled > 0?
  const total = await prisma.entitlementBaseline.count();
  const withSurvey = await prisma.entitlementBaseline.count({ where: { surveyEnrolled: { gt: 0 } } });

  // Sample ration-card rows with surveyEnrolled
  const rationSample = await (prisma as unknown as { $queryRaw: Function }).$queryRaw`
    SELECT eb."assessmentId", eb."schemeId", eb."surveyEnrolled", eb."eligibleHouseholds", s.name as settlement_name
    FROM "EntitlementBaseline" eb
    JOIN "SettlementAssessment" sa ON sa.id = eb."assessmentId"
    JOIN "Settlement" s ON s.id = sa."settlementId"
    WHERE eb."schemeId" = 'ration-card'
      AND eb."surveyEnrolled" > 0
    LIMIT 10
  `;

  // Check what the needs page actually sees for Bangalore ration-card
  const bangaloreRation = await (prisma as unknown as { $queryRaw: Function }).$queryRaw`
    SELECT
      SUM(eb."surveyEnrolled") as total_survey_enrolled,
      SUM(eb."enrolledHouseholds") as total_ngo_enrolled,
      SUM(eb."eligibleHouseholds") as total_eligible,
      COUNT(*) as row_count
    FROM "EntitlementBaseline" eb
    JOIN "SettlementAssessment" sa ON sa.id = eb."assessmentId"
    JOIN "Settlement" s ON s.id = sa."settlementId"
    JOIN "Cluster" cl ON cl.id = s."clusterId"
    JOIN "Zone" z ON z.id = cl."zoneId"
    JOIN "City" c ON c.id = z."cityId"
    WHERE c.name = 'Bangalore'
      AND eb."schemeId" = 'ration-card'
      AND (sa.id, sa."assessedAt") IN (
        SELECT DISTINCT ON (sa2."settlementId") sa2.id, sa2."assessedAt"
        FROM "SettlementAssessment" sa2
        ORDER BY sa2."settlementId", sa2."assessedAt" DESC
      )
  `;

  return Response.json({ total, withSurvey, rationSample, bangaloreRation });
}
