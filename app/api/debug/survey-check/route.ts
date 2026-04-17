import prisma from "@/lib/prisma";

type RawResult = Record<string, unknown>;
const raw = prisma as unknown as { $queryRaw: (...args: unknown[]) => Promise<RawResult[]> };

export async function GET() {
  try {
    // 1. Overall counts
    const counts = await raw.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM "EntitlementBaseline")::int AS total,
        (SELECT COUNT(*) FROM "EntitlementBaseline" WHERE "surveyEnrolled" > 0)::int AS with_survey
    `;

    // 2. Bangalore ration-card using LATEST assessment per settlement (same logic as needs page)
    const bangaloreLatest = await raw.$queryRaw`
      WITH latest AS (
        SELECT DISTINCT ON ("settlementId") id AS assessment_id, "settlementId"
        FROM "SettlementAssessment"
        ORDER BY "settlementId", "assessedAt" DESC
      )
      SELECT
        COALESCE(SUM(eb."surveyEnrolled"), 0)::int AS survey_enrolled,
        COALESCE(SUM(eb."enrolledHouseholds"), 0)::int AS ngo_enrolled,
        COALESCE(SUM(eb."eligibleHouseholds"), 0)::int AS eligible,
        COUNT(eb.id)::int AS row_count,
        COUNT(CASE WHEN eb."surveyEnrolled" > 0 THEN 1 END)::int AS rows_with_survey
      FROM latest l
      JOIN "Settlement" s ON s.id = l."settlementId"
      JOIN "Cluster" cl ON cl.id = s."clusterId"
      JOIN "Zone" z ON z.id = cl."zoneId"
      JOIN "City" c ON c.id = z."cityId"
      JOIN "EntitlementBaseline" eb ON eb."assessmentId" = l.assessment_id
      WHERE c.name = 'Bangalore'
        AND eb."schemeId" = 'ration-card'
    `;

    // 3. Sample latest assessments for Bangalore — show assessedAt to check freshness
    const sampleAssessments = await raw.$queryRaw`
      SELECT DISTINCT ON (s.id) sa.id, s.name AS settlement_name, sa."assessedAt"
      FROM "SettlementAssessment" sa
      JOIN "Settlement" s ON s.id = sa."settlementId"
      JOIN "Cluster" cl ON cl.id = s."clusterId"
      JOIN "Zone" z ON z.id = cl."zoneId"
      JOIN "City" c ON c.id = z."cityId"
      WHERE c.name = 'Bangalore'
      ORDER BY s.id, sa."assessedAt" DESC
      LIMIT 5
    `;

    // 4. For those sample assessments, show their ration-card row
    const sampleIds = (sampleAssessments as Array<{id: string}>).map(r => r.id);
    const sampleEntitlements = sampleIds.length > 0 ? await raw.$queryRaw`
      SELECT eb."assessmentId", eb."surveyEnrolled"::int, eb."eligibleHouseholds"::int, s.name AS settlement_name
      FROM "EntitlementBaseline" eb
      JOIN "SettlementAssessment" sa ON sa.id = eb."assessmentId"
      JOIN "Settlement" s ON s.id = sa."settlementId"
      WHERE eb."assessmentId" = ANY(${sampleIds})
        AND eb."schemeId" = 'ration-card'
    ` : [];

    return Response.json({ counts, bangaloreLatest, sampleAssessments, sampleEntitlements });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return Response.json({ error: msg, stack }, { status: 500 });
  }
}
