// Caregiver-practice capture for a /field cadence visit — the FieldVisit sibling
// of lib/captureCaregiverPractices (which is keyed on a legacy Visit PitstopEvent).
// Resolves facility/settlement from the Goal, upserts on (fieldVisitId, practiceId),
// and raises/cancels an escalation follow-up (ActionPoint) exactly like the old path.
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";
import type { ObservationInput } from "@/lib/captureCaregiverPractices";

const FOLLOWUP_DUE_DAYS = 30;

type Ctx = { goalId: string; facilityId: string | null; settlementId: string | null };

async function resolveFieldVisitContext(fieldVisitId: string): Promise<Ctx | null> {
  const v = await prisma.fieldVisit.findUnique({
    where: { id: fieldVisitId },
    select: {
      goalId: true,
      goal: { select: { linkedFacilityId: true, needsSettlementId: true, linkedFacility: { select: { settlementId: true } } } },
    },
  });
  if (!v) return null;
  return {
    goalId: v.goalId,
    facilityId: v.goal.linkedFacilityId,
    settlementId: v.goal.needsSettlementId ?? v.goal.linkedFacility?.settlementId ?? null,
  };
}

/** Either the write happened, or it explicitly did not and says why. */
export type CaptureResult =
  | { ok: true; written: number; escalated: number }
  | { ok: false; reason: string };

export async function captureFieldCaregiverPractices({
  fieldVisitId,
  capturedById,
  observations,
}: {
  fieldVisitId: string;
  capturedById: string;
  observations: ObservationInput[];
}): Promise<CaptureResult> {
  if (!observations.length) return { ok: true, written: 0, escalated: 0 };
  const ctx = await resolveFieldVisitContext(fieldVisitId);
  // Was a silent no-op "mirroring legacy" — but silence here means the RP fills
  // in dozens of observations, gets a success, and the whole lot is discarded.
  // (Exactly the /operations failure fixed in def3684.) Say why instead.
  if (!ctx) return { ok: false, reason: "This visit no longer exists." };
  if (!ctx.facilityId) return { ok: false, reason: "No creche is linked to this intervention, so there is nowhere to record observations. An admin can link one in Backend → Geography & assignment." };
  if (!ctx.settlementId) return { ok: false, reason: "This intervention's creche has no settlement, so observations cannot be filed against a location. An admin can set one in Backend → Geography & assignment." };
  const { facilityId, settlementId, goalId } = ctx;

  const practiceIds = [...new Set(observations.map((o) => o.practiceId))];
  const practices = new Map(
    (await prisma.caregiverPractice.findMany({ where: { id: { in: practiceIds }, isActive: true }, select: { id: true, shortLabel: true } })).map((p) => [p.id, p.shortLabel]),
  );
  const rows = observations.filter((o) => practices.has(o.practiceId));
  if (!rows.length) return { ok: true, written: 0, escalated: 0 };

  const dueDate = new Date(Date.now() + FOLLOWUP_DUE_DAYS * 86_400_000);
  let escalated = 0;

  for (const r of rows) {
    const existing = await prisma.caregiverPracticeObservation.findUnique({
      where: { fieldVisitId_practiceId: { fieldVisitId, practiceId: r.practiceId } },
      select: { id: true, actionPointId: true },
    });
    const escalate = r.action === "EscalateToSupervisor";
    let actionPointId = existing?.actionPointId ?? null;

    if (escalate && !actionPointId) {
      const ap = await prisma.actionPoint.create({
        data: {
          goalId,
          source: "adhoc",
          title: `Caregiver practice: ${practices.get(r.practiceId)}`,
          detail: r.remarks?.trim() || null,
          dueDate,
          priority: "urgent",
          ownerId: capturedById,
          createdById: capturedById,
          status: "open",
        },
        select: { id: true },
      });
      actionPointId = ap.id;
      escalated++;
      auditLog({ entityType: "ActionPoint", entityId: ap.id, userId: capturedById, action: "created", newValue: "caregiver-practice escalation (/field)" });
    } else if (!escalate && actionPointId) {
      await prisma.actionPoint.updateMany({ where: { id: actionPointId, status: "open" }, data: { status: "cancelled", lastUpdatedById: capturedById } });
      actionPointId = null;
    }

    await prisma.caregiverPracticeObservation.upsert({
      where: { fieldVisitId_practiceId: { fieldVisitId, practiceId: r.practiceId } },
      create: { practiceId: r.practiceId, facilityId, settlementId, goalId, fieldVisitId, status: r.status, remarks: r.remarks?.trim() || null, action: r.action ?? null, photoUrl: r.photoUrl?.trim() || null, actionPointId, capturedById },
      update: { status: r.status, remarks: r.remarks?.trim() || null, action: r.action ?? null, photoUrl: r.photoUrl?.trim() || null, actionPointId, capturedById, capturedAt: new Date() },
    });
  }
  return { ok: true, written: rows.length, escalated };
}
