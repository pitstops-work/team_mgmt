import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { calcTargets } from "../settlement-needs/route";

// GET /api/map/zone-needs?zone=NAME
export async function GET(request: Request) {
  const rawZone = new URL(request.url).searchParams.get("zone");
  if (!rawZone) return NextResponse.json({ error: "zone required" }, { status: 400 });

  const zoneInclude = {
    clusters: {
      where: { deletedAt: null },
      include: {
        settlements: { where: { deletedAt: null }, select: { id: true, name: true } },
      },
    },
  };

  let zone = null;

  // Always try cluster-based lookup first using zone_cluster_index.json.
  // This avoids ambiguity when Bangalore and Chennai share zone names like "North" or "Central".
  // For Chennai clusters: use the `display` field (en-dash names match DB).
  // For Bangalore clusters: convert underscore key to spaces (matches DB cluster names).
  try {
    const indexPath = path.join(process.cwd(), "public/data/zone_cluster_index.json");
    const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    const clusterNames = Object.entries(index.clusters as Record<string, { zone: string; display?: string }>)
      .filter(([, c]) => c.zone === rawZone)
      .map(([key, c]) => c.display ?? key.replace(/_/g, " "))
      .filter(Boolean);

    if (clusterNames.length > 0) {
      zone = await prisma.zone.findFirst({
        where: {
          deletedAt: null,
          clusters: {
            some: { name: { in: clusterNames, mode: "insensitive" }, deletedAt: null },
          },
        },
        include: zoneInclude,
      });
    }
  } catch {
    // fall through to name-based lookup
  }

  // Fallback: exact match, then strip city prefix
  if (!zone) {
    const stripped = rawZone.replace(/^.+?[–\-]\s*/u, "").trim();
    const namesToTry = stripped && stripped !== rawZone ? [rawZone, stripped] : [rawZone];
    for (const name of namesToTry) {
      zone = await prisma.zone.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, deletedAt: null },
        include: zoneInclude,
      });
      if (zone) break;
    }
  }

  if (!zone) return NextResponse.json(null);

  const allSettlementIds = zone.clusters.flatMap(c => c.settlements.map(s => s.id));
  const allClusterIds = zone.clusters.map(c => c.id);

  // Latest assessment per settlement
  const assessments = await prisma.settlementAssessment.findMany({
    where: { settlementId: { in: allSettlementIds } },
    orderBy: { assessedAt: "desc" },
    distinct: ["settlementId"],
    select: {
      settlementId: true, totalHouseholds: true,
      children6m3yr: true, children4to14: true, youth15to21: true, elderly60plus: true,
      existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
      existingElderlyKitchens: true, existingPalliativeUnits: true,
      existingCommunityToilets: true, existingWaterATMs: true,
      entitlements: {
        include: { scheme: { select: { id: true, name: true, parentId: true } } },
      },
    },
  });

  // Aggregate
  const pop = assessments.reduce(
    (acc, a) => ({
      totalHouseholds: acc.totalHouseholds + a.totalHouseholds,
      children6m3yr: acc.children6m3yr + a.children6m3yr,
      children4to14: acc.children4to14 + a.children4to14,
      youth15to21: acc.youth15to21 + a.youth15to21,
      elderly60plus: acc.elderly60plus + a.elderly60plus,
    }),
    { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 }
  );

  const existing = assessments.reduce(
    (acc, a) => ({
      Creche: acc.Creche + a.existingCreches,
      ChildrenCentre: acc.ChildrenCentre + a.existingChildrenCentres,
      YouthGroup: acc.YouthGroup + a.existingYouthGroups,
      ElderlyKitchen: acc.ElderlyKitchen + a.existingElderlyKitchens,
      PalliativeSupport: acc.PalliativeSupport + a.existingPalliativeUnits,
      CommunityToilet: acc.CommunityToilet + a.existingCommunityToilets,
      WaterATM: acc.WaterATM + a.existingWaterATMs,
    }),
    { Creche: 0, ChildrenCentre: 0, YouthGroup: 0, ElderlyKitchen: 0, PalliativeSupport: 0, CommunityToilet: 0, WaterATM: 0 }
  );

  const entitlementMap: Record<string, { name: string; parentId: string | null; eligible: number; enrolled: number }> = {};
  for (const a of assessments) {
    for (const e of a.entitlements) {
      const key = e.scheme.id;
      if (!entitlementMap[key]) entitlementMap[key] = { name: e.scheme.name, parentId: e.scheme.parentId, eligible: 0, enrolled: 0 };
      entitlementMap[key].eligible += e.eligibleHouseholds;
      entitlementMap[key].enrolled += e.enrolledHouseholds;
    }
  }

  const formulaRows = await prisma.needsFormulaConfig.findMany();
  const formulas = Object.fromEntries(formulaRows.map(f => [f.domain, f.denominator]));
  const targets = calcTargets(pop, formulas);

  const goals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      deletedAt: null,
      OR: [
        { needsZoneId: zone.id },
        { needsClusterId: { in: allClusterIds } },
        { needsSettlementId: { in: allSettlementIds } },
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

  return NextResponse.json({
    zone: { id: zone.id, name: zone.name },
    clusterCount: zone.clusters.length,
    settlementCount: allSettlementIds.length,
    assessedCount: assessments.length,
    pop, existing, targets, actuals,
    entitlements: Object.entries(entitlementMap).map(([id, v]) => ({ id, ...v })),
  });
}
