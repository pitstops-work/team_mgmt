import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

// GET /api/needs/assessments/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assessment = await prisma.settlementAssessment.findUnique({
    where: { id },
    include: {
      assessedBy: { select: { id: true, name: true } },
      settlement: { select: { id: true, name: true, cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } } } },
      roads: true, water: true, sanitation: true,
      drainageSewer: true, drainageStorm: true,
      waste: true, electricity: true, facilities: true, safety: true,
      entitlements: { include: { scheme: { select: { id: true, name: true, parentId: true } } } },
    },
  });

  if (!assessment) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(assessment);
}

// PATCH /api/needs/assessments/[id]  → mid-year update (updates in place, preserves record)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const {
    totalHouseholds, children6m3yr, children4to14, youth15to21, elderly60plus,
    existingCreches, existingChildrenCentres, existingYouthGroups,
    existingYouthResourceCentres, existingElderlyKitchens, existingElderlyCentres,
    existingPalliativeUnits, existingPalliativeCareServices, existingReferralSystems,
    existingCommunityToilets, existingWaterATMs,
    settlementType, composition, predominantGroups, languages, yearsEstablished,
    landOwnership, legalStatus, hakkupatraEligible,
    priorityIssues, enumeratorNotes,
    roads, water, sanitation, drainageSewer, drainageStorm, waste, electricity, facilities, safety,
    entitlements,
  } = body;

  // Update top-level fields + mark assessedAt to now
  const updated = await prisma.settlementAssessment.update({
    where: { id },
    data: {
      assessedById: session.user.id,
      assessedAt: new Date(),
      totalHouseholds: totalHouseholds ?? undefined,
      children6m3yr: children6m3yr ?? undefined,
      children4to14: children4to14 ?? undefined,
      youth15to21: youth15to21 ?? undefined,
      elderly60plus: elderly60plus ?? undefined,
      existingCreches: existingCreches ?? undefined,
      existingChildrenCentres: existingChildrenCentres ?? undefined,
      existingYouthGroups: existingYouthGroups ?? undefined,
      existingYouthResourceCentres: existingYouthResourceCentres ?? undefined,
      existingElderlyKitchens: existingElderlyKitchens ?? undefined,
      existingElderlyCentres: existingElderlyCentres ?? undefined,
      existingPalliativeUnits: existingPalliativeUnits ?? undefined,
      existingPalliativeCareServices: existingPalliativeCareServices ?? undefined,
      existingReferralSystems: existingReferralSystems ?? undefined,
      existingCommunityToilets: existingCommunityToilets ?? undefined,
      existingWaterATMs: existingWaterATMs ?? undefined,
      settlementType, composition, predominantGroups, languages,
      yearsEstablished: yearsEstablished ? Number(yearsEstablished) : undefined,
      landOwnership, legalStatus,
      hakkupatraEligible: hakkupatraEligible ? Number(hakkupatraEligible) : undefined,
      priorityIssues, enumeratorNotes,
    },
  });

  // Upsert each section (delete + recreate is simplest given 1-to-1 PK = assessmentId)
  if (roads !== undefined) {
    await prisma.roadBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...roads }, update: roads });
  }
  if (water !== undefined) {
    await prisma.waterBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...water }, update: water });
  }
  if (sanitation !== undefined) {
    const s = sanitizeSanitation(sanitation);
    await prisma.sanitationBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...s }, update: s });
  }
  if (drainageSewer !== undefined) {
    await prisma.drainageSewerBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...drainageSewer }, update: drainageSewer });
  }
  if (drainageStorm !== undefined) {
    await prisma.drainageStormBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...drainageStorm }, update: drainageStorm });
  }
  if (waste !== undefined) {
    await prisma.wasteBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...waste }, update: waste });
  }
  if (electricity !== undefined) {
    const e = sanitizeElectricity(electricity);
    await prisma.electricityBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...e }, update: e });
  }
  if (facilities !== undefined) {
    const f = sanitizeFacilities(facilities);
    await prisma.facilitiesBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...f }, update: f });
  }
  if (safety !== undefined) {
    await prisma.safetyBaseline.upsert({ where: { assessmentId: id }, create: { assessmentId: id, ...safety }, update: safety });
  }

  // Entitlements: upsert each scheme row
  if (entitlements?.length) {
    for (const e of entitlements as { schemeId: string; eligibleHouseholds: number; enrolledHouseholds: number; notes?: string }[]) {
      await prisma.entitlementBaseline.upsert({
        where: { assessmentId_schemeId: { assessmentId: id, schemeId: e.schemeId } },
        create: { assessmentId: id, schemeId: e.schemeId, eligibleHouseholds: e.eligibleHouseholds ?? 0, enrolledHouseholds: e.enrolledHouseholds ?? 0, notes: e.notes ?? null },
        update: { eligibleHouseholds: e.eligibleHouseholds ?? 0, enrolledHouseholds: e.enrolledHouseholds ?? 0, notes: e.notes ?? null },
      });
    }
  }

  return Response.json(updated);
}
