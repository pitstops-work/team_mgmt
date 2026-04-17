import prisma from "@/lib/prisma";

type RawResult = Record<string, unknown>;
const raw = prisma as unknown as { $queryRaw: (...args: unknown[]) => Promise<RawResult[]> };

export async function GET() {
  try {
    const counts = await raw.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM "EntitlementBaseline")::int AS total,
        (SELECT COUNT(*) FROM "EntitlementBaseline" WHERE "surveyEnrolled" > 0)::int AS with_survey,
        (SELECT COUNT(*) FROM "EntitlementBaseline" WHERE "surveyEnrolled" IS NULL OR "surveyEnrolled" = 0)::int AS zero_or_null
    `;

    const rationSample = await raw.$queryRaw`
      SELECT eb."assessmentId", eb."schemeId", eb."surveyEnrolled"::int, eb."eligibleHouseholds"::int, s.name AS settlement_name
      FROM "EntitlementBaseline" eb
      JOIN "SettlementAssessment" sa ON sa.id = eb."assessmentId"
      JOIN "Settlement" s ON s.id = sa."settlementId"
      WHERE eb."schemeId" = 'ration-card'
        AND eb."surveyEnrolled" > 0
      LIMIT 10
    `;

    const bangaloreRation = await raw.$queryRaw`
      SELECT
        COALESCE(SUM(eb."surveyEnrolled"), 0)::int AS total_survey_enrolled,
        COALESCE(SUM(eb."enrolledHouseholds"), 0)::int AS total_ngo_enrolled,
        COALESCE(SUM(eb."eligibleHouseholds"), 0)::int AS total_eligible,
        COUNT(*)::int AS row_count
      FROM "EntitlementBaseline" eb
      JOIN "SettlementAssessment" sa ON sa.id = eb."assessmentId"
      JOIN "Settlement" s ON s.id = sa."settlementId"
      JOIN "Cluster" cl ON cl.id = s."clusterId"
      JOIN "Zone" z ON z.id = cl."zoneId"
      JOIN "City" c ON c.id = z."cityId"
      WHERE c.name = 'Bangalore'
        AND eb."schemeId" = 'ration-card'
    `;

    return Response.json({ counts, rationSample, bangaloreRation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return Response.json({ error: msg, stack }, { status: 500 });
  }
}
