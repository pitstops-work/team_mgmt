import prisma from "@/lib/prisma";

type RawResult = Record<string, unknown>;
const raw = prisma as unknown as { $queryRaw: (...args: unknown[]) => Promise<RawResult[]> };

export async function GET() {
  try {
    // Mirror exactly what needs/page.tsx does:
    // 1. Get latest assessment per settlement
    const latestAssessments = await prisma.settlementAssessment.findMany({
      orderBy: [{ settlementId: "asc" }, { assessedAt: "desc" }],
      distinct: ["settlementId"] as ["settlementId"],
      select: { id: true, settlementId: true },
    });

    const latestAssessmentIdList = latestAssessments.map((a) => a.id);

    // 2. Get EntitlementBaseline rows — same query as needs page
    type EntRow = { id: string; assessmentId: string; schemeId: string; eligibleHouseholds: number; enrolledHouseholds: number; surveyEnrolled: number | null };
    const entBaselines = await prisma.entitlementBaseline.findMany({
      where: { assessmentId: { in: latestAssessmentIdList }, eligibleHouseholds: { gt: 0 } },
      include: { scheme: { select: { id: true, name: true } } },
    }) as unknown as EntRow[];

    // 3. Find all Bangalore settlement IDs
    const bangaloreSettlements = await raw.$queryRaw`
      SELECT s.id
      FROM "Settlement" s
      JOIN "Cluster" cl ON cl.id = s."clusterId"
      JOIN "Zone" z ON z.id = cl."zoneId"
      JOIN "City" c ON c.id = z."cityId"
      WHERE c.name = 'Bangalore' AND s."deletedAt" IS NULL
    `;
    const bangaloreIds = new Set((bangaloreSettlements as Array<{id: string}>).map(r => r.id));

    // 4. Build assessment→settlement map (same as needs page)
    const assessmentToSettlement = Object.fromEntries(latestAssessments.map(a => [a.id, a.settlementId]));

    // 5. Aggregate ration-card for Bangalore (mirrors aggregateEnt)
    let eligible = 0, ngoEnrolled = 0, surveyEnrolled = 0, rowCount = 0;
    let rowsWithSurvey = 0, rowsWithoutSurvey = 0;

    for (const e of entBaselines) {
      if (e.schemeId !== "ration-card") continue;
      const sId = assessmentToSettlement[e.assessmentId];
      if (!sId || !bangaloreIds.has(sId)) continue;
      eligible += e.eligibleHouseholds;
      ngoEnrolled += e.enrolledHouseholds;
      surveyEnrolled += e.surveyEnrolled ?? 0;
      rowCount++;
      if ((e.surveyEnrolled ?? 0) > 0) rowsWithSurvey++;
      else rowsWithoutSurvey++;
    }

    const pct = eligible > 0 ? Math.round((surveyEnrolled + ngoEnrolled) / eligible * 100) : 0;

    return Response.json({
      totalLatestAssessments: latestAssessmentIdList.length,
      totalEntBaselines: entBaselines.length,
      bangaloreSettlementCount: bangaloreIds.size,
      rationCard: { eligible, ngoEnrolled, surveyEnrolled, pct, rowCount, rowsWithSurvey, rowsWithoutSurvey },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return Response.json({ error: msg, stack }, { status: 500 });
  }
}
