import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Shared helper — also used by cluster-needs and zone-needs
export function calcTargets(
  pop: { totalHouseholds: number; children6m3yr: number; children4to14: number; youth15to21: number; elderly60plus: number },
  formulas: Record<string, number | null>
) {
  const ceil = (v: number, d: number) => (v > 0 ? Math.ceil(v / d) : 0);
  return {
    Creche:           ceil(pop.children6m3yr,     formulas["Creche"]           ?? 20),
    ChildrenCentre:   ceil(pop.children4to14,     formulas["ChildrenCentre"]   ?? 500),
    YouthGroup:       ceil(pop.youth15to21,        formulas["YouthGroup"]       ?? 30),
    ElderlyKitchen:   ceil(pop.elderly60plus,      formulas["ElderlyKitchen"]   ?? 50),
    PalliativeSupport:ceil(pop.elderly60plus,      formulas["PalliativeSupport"]?? 100),
    CommunityToilet:  ceil(pop.totalHouseholds,    formulas["CommunityToilet"]  ?? 200),
    WaterATM:         ceil(pop.totalHouseholds,    formulas["WaterATM"]         ?? 250),
  };
}

// GET /api/map/settlement-needs?settlement=NAME&cluster=CLUSTER_NAME
export async function GET(request: Request) {
  const url = new URL(request.url);
  const settlementName = url.searchParams.get("settlement");
  const clusterName    = url.searchParams.get("cluster")?.replace(/_/g, " ");

  if (!settlementName) return NextResponse.json({ error: "settlement required" }, { status: 400 });

  // Find settlement in DB by name + optional cluster constraint
  const settlement = await prisma.settlement.findFirst({
    where: {
      name: { equals: settlementName, mode: "insensitive" },
      deletedAt: null,
      ...(clusterName ? { cluster: { name: { equals: clusterName, mode: "insensitive" } } } : {}),
    },
    include: { cluster: { include: { zone: true } } },
  });

  if (!settlement) return NextResponse.json(null);

  // Latest assessment
  const assessment = await prisma.settlementAssessment.findFirst({
    where: { settlementId: settlement.id },
    orderBy: { assessedAt: "desc" },
    include: {
      assessedBy: { select: { name: true } },
      entitlements: {
        include: { scheme: { select: { id: true, name: true, parentId: true } } },
        orderBy: { scheme: { sortOrder: "asc" } },
      },
      roads: true, water: true, sanitation: true,
      drainageSewer: true, drainageStorm: true,
      waste: true, electricity: true, facilities: true, safety: true,
    },
  });

  // Formula config
  const formulaRows = await prisma.needsFormulaConfig.findMany();
  const formulas = Object.fromEntries(formulaRows.map(f => [f.domain, f.denominator]));

  // Population (zero if no assessment)
  const pop = assessment
    ? { totalHouseholds: assessment.totalHouseholds, children6m3yr: assessment.children6m3yr, children4to14: assessment.children4to14, youth15to21: assessment.youth15to21, elderly60plus: assessment.elderly60plus }
    : { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 };

  const existing = assessment
    ? { Creche: assessment.existingCreches, ChildrenCentre: assessment.existingChildrenCentres, YouthGroup: assessment.existingYouthGroups, ElderlyKitchen: assessment.existingElderlyKitchens, PalliativeSupport: assessment.existingPalliativeUnits, CommunityToilet: assessment.existingCommunityToilets, WaterATM: assessment.existingWaterATMs }
    : { Creche: 0, ChildrenCentre: 0, YouthGroup: 0, ElderlyKitchen: 0, PalliativeSupport: 0, CommunityToilet: 0, WaterATM: 0 };

  const targets = calcTargets(pop, formulas);

  // APF actuals from goals
  const goals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      deletedAt: null,
      OR: [
        { needsSettlementId: settlement.id },
        { needsClusterId: settlement.clusterId },
      ],
    },
    select: { status: true, needsDomain: true, parameter: true, metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 } },
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

  return NextResponse.json({ settlement, assessment, pop, existing, targets, actuals, formulas });
}
