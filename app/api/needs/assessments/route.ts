import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";

// Convert empty strings / undefined to null for Float? schema fields
function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

type Rec = Record<string, unknown>;

function sanitizeSanitation(s: Rec): Rec {
  return { ...s, toiletFee: toFloat(s.toiletFee) };
}
function sanitizeElectricity(e: Rec): Rec {
  return { ...e, avgHoursPerDay: toFloat(e.avgHoursPerDay) };
}
function sanitizeFacilities(f: Rec): Rec {
  return { ...f, distanceToSchool: toFloat(f.distanceToSchool), distanceToHealth: toFloat(f.distanceToHealth), distanceToBusStop: toFloat(f.distanceToBusStop) };
}

// GET /api/needs/assessments?settlementId=xxx  → history list for a settlement
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settlementId = req.nextUrl.searchParams.get("settlementId");
  if (!settlementId) return Response.json({ error: "settlementId required" }, { status: 400 });

  const assessments = await prisma.settlementAssessment.findMany({
    where: { settlementId },
    include: {
      assessedBy: { select: { id: true, name: true } },
      roads: true,
      water: true,
      sanitation: true,
      drainageSewer: true,
      drainageStorm: true,
      waste: true,
      electricity: true,
      facilities: true,
      safety: true,
      entitlements: { include: { scheme: { select: { id: true, name: true, parentId: true } } } },
    },
    orderBy: { assessedAt: "desc" },
  });

  return Response.json(assessments);
}

// POST /api/needs/assessments  → create new assessment (new survey / new year)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const body = await req.json();
  const { settlementId, assessmentYear, ...rest } = body;

  if (!settlementId || !assessmentYear) {
    return Response.json({ error: "settlementId and assessmentYear required" }, { status: 400 });
  }

  const {
    // Population
    totalHouseholds, children6m3yr, children4to14, youth15to21, elderly60plus,
    // Existing infrastructure
    existingCreches, existingChildrenCentres, existingYouthGroups,
    existingElderlyKitchens, existingPalliativeUnits, existingCommunityToilets, existingWaterATMs,
    // Profile
    settlementType, composition, predominantGroups, languages, yearsEstablished,
    // Land & Tenure
    landOwnership, legalStatus, hakkupatraEligible,
    // Priority issues
    priorityIssues, enumeratorNotes,
    // Sections
    roads, water, sanitation, drainageSewer, drainageStorm, waste, electricity, facilities, safety,
    // Entitlements
    entitlements,
  } = rest;

  const assessment = await prisma.settlementAssessment.create({
    data: {
      settlementId,
      assessmentYear: Number(assessmentYear),
      assessedById: session.user.id,
      assessedAt: new Date(),
      // Population
      totalHouseholds: totalHouseholds ?? 0,
      children6m3yr: children6m3yr ?? 0,
      children4to14: children4to14 ?? 0,
      youth15to21: youth15to21 ?? 0,
      elderly60plus: elderly60plus ?? 0,
      // Existing
      existingCreches: existingCreches ?? 0,
      existingChildrenCentres: existingChildrenCentres ?? 0,
      existingYouthGroups: existingYouthGroups ?? 0,
      existingElderlyKitchens: existingElderlyKitchens ?? 0,
      existingPalliativeUnits: existingPalliativeUnits ?? 0,
      existingCommunityToilets: existingCommunityToilets ?? 0,
      existingWaterATMs: existingWaterATMs ?? 0,
      // Profile
      settlementType, composition, predominantGroups, languages,
      yearsEstablished: yearsEstablished ? Number(yearsEstablished) : null,
      // Land
      landOwnership, legalStatus,
      hakkupatraEligible: hakkupatraEligible ? Number(hakkupatraEligible) : null,
      // Notes
      priorityIssues, enumeratorNotes,
      // Sections (upsert inline via nested create)
      roads: roads ? { create: roads } : undefined,
      water: water ? { create: water } : undefined,
      sanitation: sanitation ? { create: sanitizeSanitation(sanitation) } : undefined,
      drainageSewer: drainageSewer ? { create: drainageSewer } : undefined,
      drainageStorm: drainageStorm ? { create: drainageStorm } : undefined,
      waste: waste ? { create: waste } : undefined,
      electricity: electricity ? { create: sanitizeElectricity(electricity) } : undefined,
      facilities: facilities ? { create: sanitizeFacilities(facilities) } : undefined,
      safety: safety ? { create: safety } : undefined,
      // Entitlements
      entitlements: entitlements?.length ? {
        create: entitlements.map((e: { schemeId: string; eligibleHouseholds: number; enrolledHouseholds: number; notes?: string }) => ({
          schemeId: e.schemeId,
          eligibleHouseholds: e.eligibleHouseholds ?? 0,
          enrolledHouseholds: e.enrolledHouseholds ?? 0,
          notes: e.notes ?? null,
        })),
      } : undefined,
    },
    include: {
      assessedBy: { select: { id: true, name: true } },
      roads: true, water: true, sanitation: true,
      drainageSewer: true, drainageStorm: true,
      waste: true, electricity: true, facilities: true, safety: true,
      entitlements: { include: { scheme: { select: { id: true, name: true, parentId: true } } } },
    },
  });

  // Keep SettlementProfile in sync with the latest assessment
  await prisma.settlementProfile.upsert({
    where: { settlementId },
    create: {
      settlementId,
      totalHouseholds: assessment.totalHouseholds,
      children6m3yr: assessment.children6m3yr,
      children4to14: assessment.children4to14,
      youth15to21: assessment.youth15to21,
      elderly60plus: assessment.elderly60plus,
      settlementType: assessment.settlementType ?? null,
      priorityIssues: assessment.priorityIssues ?? null,
      lastAssessmentId: assessment.id,
      lastSyncedAt: new Date(),
    },
    update: {
      totalHouseholds: assessment.totalHouseholds,
      children6m3yr: assessment.children6m3yr,
      children4to14: assessment.children4to14,
      youth15to21: assessment.youth15to21,
      elderly60plus: assessment.elderly60plus,
      settlementType: assessment.settlementType ?? null,
      priorityIssues: assessment.priorityIssues ?? null,
      lastAssessmentId: assessment.id,
      lastSyncedAt: new Date(),
    },
  });

  return Response.json(assessment, { status: 201 });
}
