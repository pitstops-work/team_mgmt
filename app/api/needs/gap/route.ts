import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTargets } from "../../map/settlement-needs/route";

// GET /api/needs/gap?zoneId=&clusterId=&settlementId=
// Returns pop + existing + targets + actuals for the given geography (by ID).
// Used by the goal-creation wizard to show domain gap cards.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const zoneId       = url.searchParams.get("zoneId");
  const clusterId    = url.searchParams.get("clusterId");
  const settlementId = url.searchParams.get("settlementId");

  if (!zoneId && !clusterId && !settlementId) {
    return NextResponse.json({ error: "zoneId, clusterId, or settlementId required" }, { status: 400 });
  }

  // ── Collect settlement IDs ──────────────────────────────────────────────────

  let allSettlementIds: string[] = [];
  let allClusterIds: string[]    = [];

  if (settlementId) {
    allSettlementIds = [settlementId];
    const s = await prisma.settlement.findUnique({ where: { id: settlementId }, select: { clusterId: true } });
    if (s?.clusterId) allClusterIds = [s.clusterId];
  } else if (clusterId) {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: { settlements: { where: { deletedAt: null }, select: { id: true } } },
    });
    if (!cluster) return NextResponse.json(null);
    allSettlementIds = cluster.settlements.map(s => s.id);
    allClusterIds    = [clusterId];
  } else if (zoneId) {
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      include: {
        clusters: {
          where: { deletedAt: null },
          include: { settlements: { where: { deletedAt: null }, select: { id: true } } },
        },
      },
    });
    if (!zone) return NextResponse.json(null);
    allSettlementIds = zone.clusters.flatMap(c => c.settlements.map(s => s.id));
    allClusterIds    = zone.clusters.map(c => c.id);
  }

  // ── Latest assessment per settlement ───────────────────────────────────────

  const assessments = await prisma.settlementAssessment.findMany({
    where: { settlementId: { in: allSettlementIds } },
    orderBy: { assessedAt: "desc" },
    distinct: ["settlementId"],
    select: {
      totalHouseholds: true,
      children6m3yr: true, children4to14: true, youth15to21: true, elderly60plus: true,
      existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
      existingElderlyKitchens: true, existingPalliativeUnits: true,
      existingCommunityToilets: true, existingWaterATMs: true,
    },
  });

  const pop = assessments.reduce(
    (acc, a) => ({
      totalHouseholds: acc.totalHouseholds + a.totalHouseholds,
      children6m3yr:   acc.children6m3yr   + a.children6m3yr,
      children4to14:   acc.children4to14   + a.children4to14,
      youth15to21:     acc.youth15to21     + a.youth15to21,
      elderly60plus:   acc.elderly60plus   + a.elderly60plus,
    }),
    { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 }
  );

  const existing = assessments.reduce(
    (acc, a) => ({
      Creche:           acc.Creche           + a.existingCreches,
      ChildrenCentre:   acc.ChildrenCentre   + a.existingChildrenCentres,
      YouthGroup:       acc.YouthGroup       + a.existingYouthGroups,
      ElderlyKitchen:   acc.ElderlyKitchen   + a.existingElderlyKitchens,
      PalliativeSupport:acc.PalliativeSupport+ a.existingPalliativeUnits,
      CommunityToilet:  acc.CommunityToilet  + a.existingCommunityToilets,
      WaterATM:         acc.WaterATM         + a.existingWaterATMs,
    }),
    { Creche: 0, ChildrenCentre: 0, YouthGroup: 0, ElderlyKitchen: 0, PalliativeSupport: 0, CommunityToilet: 0, WaterATM: 0 }
  );

  const formulaRows = await prisma.needsFormulaConfig.findMany();
  const formulas    = Object.fromEntries(formulaRows.map(f => [f.domain, f.denominator]));
  const targets     = calcTargets(pop, formulas);

  // ── Actuals from goals ─────────────────────────────────────────────────────

  const goals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      deletedAt: null,
      OR: [
        ...(zoneId       ? [{ needsZoneId: zoneId }]           : []),
        ...(clusterId    ? [{ needsClusterId: clusterId }]      : []),
        ...(settlementId ? [{ needsSettlementId: settlementId }]: []),
        { needsClusterId: { in: allClusterIds } },
        { needsSettlementId: { in: allSettlementIds } },
      ],
    },
    select: {
      status: true, needsDomain: true, parameter: true,
      metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 },
    },
  });

  const actuals: Record<string, { done: number; inProgress: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    const d = g.needsDomain as string;
    if (!actuals[d]) actuals[d] = { done: 0, inProgress: 0 };
    const val = g.parameter ?? g.metrics[0]?.current ?? 0;
    if (g.status === "Complete") actuals[d].done += val;
    else if (g.status === "Active") actuals[d].inProgress += val;
  }

  return NextResponse.json({ pop, existing, targets, actuals });
}
