"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getSchoolPlanAccess,
  canEditPlan,
  type SchoolPlanAccess,
} from "@/lib/schoolPlan/access";
import { bootstrapSchoolPlan } from "@/lib/schoolPlan/instantiate";
import { PILOT_SCHOOLS } from "@/lib/schoolPlan/stepTemplate";
import { planCompleteness, type PlanForCompleteness } from "@/lib/schoolPlan/completeness";
import { SCHOOL_PLAN_ROLES } from "@/lib/schoolPlan/roles";
import type {
  SchoolPlanStepStatusValue,
  SchoolServiceStatusValue,
  SchoolComponentDeliveryValue,
  SchoolStaffPayrollValue,
  SchoolPlanStatusValue,
} from "@/lib/schoolPlan/types";

// ---------- Auth helper ----------

async function requireAccess(): Promise<SchoolPlanAccess> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const a = await getSchoolPlanAccess(session);
  if (!a.canAccess) redirect("/portal");
  return a;
}

async function requireEditPlan(planId: string): Promise<SchoolPlanAccess> {
  const a = await requireAccess();
  if (!canEditPlan(a, planId)) {
    throw new Error("Not authorised to edit this plan.");
  }
  return a;
}

async function requireStructure() {
  const a = await requireAccess();
  if (!a.canManageStructure) {
    throw new Error("Not authorised — central lead only.");
  }
  return a;
}

function refreshPlan(planId: string) {
  revalidatePath(`/schools/${planId}`, "layout");
  revalidatePath("/schools");
}

// ---------- Plan CRUD ----------

export async function createPlan(formData: FormData) {
  await requireStructure();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required.");
  const officialName = String(formData.get("officialName") ?? "").trim() || null;
  const district = String(formData.get("district") ?? "").trim() || null;
  const taluk = String(formData.get("taluk") ?? "").trim() || null;
  const cpd = Number(formData.get("targetChildrenPerDay"));
  const plan = await prisma.schoolPlan.create({
    data: {
      name,
      officialName,
      district,
      taluk,
      targetChildrenPerDay: Number.isFinite(cpd) && cpd > 0 ? Math.round(cpd) : null,
    },
    select: { id: true },
  });
  await bootstrapSchoolPlan(plan.id);
  revalidatePath("/schools");
  redirect(`/schools/${plan.id}`);
}

export async function seedPilotSchools() {
  await requireStructure();
  for (const p of PILOT_SCHOOLS) {
    const exists = await prisma.schoolPlan.findFirst({
      where: { name: p.name, officialName: p.officialName },
      select: { id: true },
    });
    if (exists) continue;
    const plan = await prisma.schoolPlan.create({
      data: {
        name: p.name,
        officialName: p.officialName,
        taluk: p.taluk ?? null,
        district: p.district ?? null,
        targetChildrenPerDay: p.targetChildrenPerDay,
      },
      select: { id: true },
    });
    await bootstrapSchoolPlan(plan.id);
  }
  revalidatePath("/schools");
}

export async function updatePlan(planId: string, patch: Record<string, unknown>) {
  await requireEditPlan(planId);
  // Whitelist only editable fields to avoid mass-assignment.
  const editable = new Set([
    "name","officialName","diseCode","schoolType","addressText","geoLat","geoLng",
    "taluk","district","ward","yearEstablished","grades","sections","mediums",
    "enrolmentBoys","enrolmentGirls","teachersSanctioned","teachersWorking",
    "classroomsCount","otherRoomsCount","timings","shifts","vacationMonths",
    "headTeacherName","headTeacherPhone","sdmcStatus","deptContactName","ourLeadUserId",
    "anchorPartnerName","campusAfterHoursUse","siteAreaSqft","builtupAreaSqft",
    "surveyStatus","targetChildrenPerDay","capacityRead","mobilisationNotes",
  ]);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (editable.has(k)) data[k] = v;
  }
  await prisma.schoolPlan.update({ where: { id: planId }, data });
  refreshPlan(planId);
}

export async function deletePlan(planId: string) {
  await requireStructure();
  await prisma.schoolPlan.delete({ where: { id: planId } });
  revalidatePath("/schools");
  redirect("/schools");
}

export async function setPlanStatus(planId: string, status: SchoolPlanStatusValue) {
  await requireEditPlan(planId);
  if (status === "for_review" || status === "approved") {
    const c = await loadPlanForCompleteness(planId);
    const check = planCompleteness(c);
    if (!check.ready) {
      throw new Error(
        `Cannot move to ${status}: ${check.readyCount}/10 sections ready. Missing: ` +
          check.sections.filter((s) => !s.ready).map((s) => `§${s.section} (${s.missing.join(", ")})`).join(" · "),
      );
    }
  }
  await prisma.schoolPlan.update({ where: { id: planId }, data: { planStatus: status } });
  refreshPlan(planId);
}

// ---------- Catchment settlements ----------

export async function addCatchment(planId: string, input: {
  name: string; distanceMeters?: number | null; walkMinutes?: number | null;
  children0to3?: number | null; children3to14?: number | null; children14to18?: number | null;
  existingServices?: string | null;
}) {
  await requireEditPlan(planId);
  const name = input.name?.trim();
  if (!name) throw new Error("Settlement name required.");
  const max = await prisma.schoolPlanCatchment.aggregate({ where: { planId }, _max: { sortOrder: true } });
  await prisma.schoolPlanCatchment.create({
    data: {
      planId,
      name,
      distanceMeters: input.distanceMeters ?? null,
      walkMinutes: input.walkMinutes ?? null,
      children0to3: input.children0to3 ?? null,
      children3to14: input.children3to14 ?? null,
      children14to18: input.children14to18 ?? null,
      existingServices: input.existingServices?.trim() || null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  refreshPlan(planId);
}

export async function updateCatchment(id: string, patch: Record<string, unknown>) {
  const row = await prisma.schoolPlanCatchment.findUnique({ where: { id }, select: { planId: true } });
  if (!row) throw new Error("Not found.");
  await requireEditPlan(row.planId);
  const editable = new Set(["name","distanceMeters","walkMinutes","children0to3","children3to14","children14to18","existingServices"]);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (editable.has(k)) data[k] = v;
  await prisma.schoolPlanCatchment.update({ where: { id }, data });
  refreshPlan(row.planId);
}

export async function deleteCatchment(id: string) {
  const row = await prisma.schoolPlanCatchment.findUnique({ where: { id }, select: { planId: true } });
  if (!row) return;
  await requireEditPlan(row.planId);
  await prisma.schoolPlanCatchment.delete({ where: { id } });
  refreshPlan(row.planId);
}

// ---------- Spaces ----------

export async function addSpace(planId: string, input: {
  name: string; building?: string | null; floor?: string | null;
  sizeSqm?: number | null; currentUse?: string | null; proposedUse?: string | null;
  capacityPerSession?: number | null; sessionsPerDay?: number | null;
  changesNeeded?: string | null; structuralFlags?: string | null;
}) {
  await requireEditPlan(planId);
  const name = input.name?.trim();
  if (!name) throw new Error("Space name required.");
  const max = await prisma.schoolPlanSpace.aggregate({ where: { planId }, _max: { sortOrder: true } });
  await prisma.schoolPlanSpace.create({
    data: {
      planId,
      name,
      building: input.building?.trim() || null,
      floor: input.floor?.trim() || null,
      sizeSqm: input.sizeSqm ?? null,
      currentUse: input.currentUse?.trim() || null,
      proposedUse: input.proposedUse?.trim() || null,
      capacityPerSession: input.capacityPerSession ?? null,
      sessionsPerDay: input.sessionsPerDay ?? 1,
      changesNeeded: input.changesNeeded?.trim() || null,
      structuralFlags: input.structuralFlags?.trim() || null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  refreshPlan(planId);
}

export async function updateSpace(id: string, patch: Record<string, unknown>) {
  const row = await prisma.schoolPlanSpace.findUnique({ where: { id }, select: { planId: true } });
  if (!row) throw new Error("Not found.");
  await requireEditPlan(row.planId);
  const editable = new Set(["name","building","floor","sizeSqm","currentUse","proposedUse","capacityPerSession","sessionsPerDay","changesNeeded","structuralFlags"]);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (editable.has(k)) data[k] = v;
  await prisma.schoolPlanSpace.update({ where: { id }, data });
  refreshPlan(row.planId);
}

export async function deleteSpace(id: string) {
  const row = await prisma.schoolPlanSpace.findUnique({ where: { id }, select: { planId: true } });
  if (!row) return;
  await requireEditPlan(row.planId);
  await prisma.schoolPlanSpace.delete({ where: { id } });
  refreshPlan(row.planId);
}

// ---------- Services ----------

export async function setServiceStatus(planId: string, item: string, status: SchoolServiceStatusValue, details?: string | null) {
  await requireEditPlan(planId);
  await prisma.schoolPlanService.upsert({
    where: { planId_item: { planId, item } },
    create: { planId, item, status, details: details?.trim() || null },
    update: { status, details: details?.trim() || null },
  });
  refreshPlan(planId);
}

// ---------- Programme components ----------

export async function updateComponent(planId: string, componentKey: string, patch: {
  offerText?: string | null;
  deliveredBy?: SchoolComponentDeliveryValue;
  schedule?: string | null;
  childrenPerDay?: number | null;
  specialistPartnerId?: string | null;
  planVetted?: boolean;
}) {
  await requireEditPlan(planId);
  const existing = await prisma.schoolPlanComponent.findUnique({
    where: { planId_component: { planId, component: componentKey } },
  });
  if (!existing) throw new Error("Component not found — reseed the plan.");
  await prisma.schoolPlanComponent.update({
    where: { id: existing.id },
    data: {
      offerText: patch.offerText !== undefined ? (patch.offerText?.trim() || null) : undefined,
      deliveredBy: patch.deliveredBy,
      schedule: patch.schedule !== undefined ? (patch.schedule?.trim() || null) : undefined,
      childrenPerDay: patch.childrenPerDay,
      specialistPartnerId: patch.specialistPartnerId !== undefined ? (patch.specialistPartnerId?.trim() || null) : undefined,
      planVetted: patch.planVetted,
    },
  });
  refreshPlan(planId);
}

// ---------- Staffing ----------

export async function addStaffing(planId: string, input: {
  role: string; count: number; payroll: SchoolStaffPayrollValue; notes?: string | null;
}) {
  await requireEditPlan(planId);
  const role = input.role?.trim();
  if (!role) throw new Error("Role required.");
  const max = await prisma.schoolPlanStaffing.aggregate({ where: { planId }, _max: { sortOrder: true } });
  await prisma.schoolPlanStaffing.create({
    data: {
      planId, role, count: input.count, payroll: input.payroll,
      notes: input.notes?.trim() || null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  refreshPlan(planId);
}

export async function updateStaffing(id: string, patch: Record<string, unknown>) {
  const row = await prisma.schoolPlanStaffing.findUnique({ where: { id }, select: { planId: true } });
  if (!row) throw new Error("Not found.");
  await requireEditPlan(row.planId);
  const editable = new Set(["role","count","payroll","status","notes"]);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (editable.has(k)) data[k] = v;
  await prisma.schoolPlanStaffing.update({ where: { id }, data });
  refreshPlan(row.planId);
}

export async function deleteStaffing(id: string) {
  const row = await prisma.schoolPlanStaffing.findUnique({ where: { id }, select: { planId: true } });
  if (!row) return;
  await requireEditPlan(row.planId);
  await prisma.schoolPlanStaffing.delete({ where: { id } });
  refreshPlan(row.planId);
}

// ---------- Milestones ----------

export async function addMilestone(planId: string, input: {
  name: string; targetDate?: string | null; dependsOn?: string | null;
}) {
  await requireEditPlan(planId);
  const name = input.name?.trim();
  if (!name) throw new Error("Milestone name required.");
  const max = await prisma.schoolPlanMilestone.aggregate({ where: { planId }, _max: { sortOrder: true } });
  await prisma.schoolPlanMilestone.create({
    data: {
      planId, name,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      dependsOn: input.dependsOn?.trim() || null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  refreshPlan(planId);
}

export async function updateMilestone(id: string, patch: { name?: string; targetDate?: string | null; dependsOn?: string | null; status?: string }) {
  const row = await prisma.schoolPlanMilestone.findUnique({ where: { id }, select: { planId: true } });
  if (!row) throw new Error("Not found.");
  await requireEditPlan(row.planId);
  await prisma.schoolPlanMilestone.update({
    where: { id },
    data: {
      name: patch.name?.trim(),
      targetDate: patch.targetDate === undefined ? undefined : (patch.targetDate ? new Date(patch.targetDate) : null),
      dependsOn: patch.dependsOn === undefined ? undefined : (patch.dependsOn?.trim() || null),
      status: patch.status,
    },
  });
  refreshPlan(row.planId);
}

export async function deleteMilestone(id: string) {
  const row = await prisma.schoolPlanMilestone.findUnique({ where: { id }, select: { planId: true } });
  if (!row) return;
  await requireEditPlan(row.planId);
  await prisma.schoolPlanMilestone.delete({ where: { id } });
  refreshPlan(row.planId);
}

// ---------- Risks ----------

export async function addRisk(planId: string, input: {
  description: string; mitigation?: string | null; ownerUserId?: string | null;
}) {
  await requireEditPlan(planId);
  const description = input.description?.trim();
  if (!description) throw new Error("Description required.");
  const max = await prisma.schoolPlanRisk.aggregate({ where: { planId }, _max: { sortOrder: true } });
  await prisma.schoolPlanRisk.create({
    data: {
      planId, description,
      mitigation: input.mitigation?.trim() || null,
      ownerUserId: input.ownerUserId || null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  refreshPlan(planId);
}

export async function updateRisk(id: string, patch: Record<string, unknown>) {
  const row = await prisma.schoolPlanRisk.findUnique({ where: { id }, select: { planId: true } });
  if (!row) throw new Error("Not found.");
  await requireEditPlan(row.planId);
  const editable = new Set(["description","mitigation","ownerUserId","status"]);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (editable.has(k)) data[k] = v;
  await prisma.schoolPlanRisk.update({ where: { id }, data });
  refreshPlan(row.planId);
}

export async function deleteRisk(id: string) {
  const row = await prisma.schoolPlanRisk.findUnique({ where: { id }, select: { planId: true } });
  if (!row) return;
  await requireEditPlan(row.planId);
  await prisma.schoolPlanRisk.delete({ where: { id } });
  refreshPlan(row.planId);
}

// ---------- Steps ----------

export async function setStepStatus(stepId: string, status: SchoolPlanStepStatusValue, blockingNote?: string) {
  const step = await prisma.schoolPlanStep.findUnique({ where: { id: stepId }, select: { planId: true } });
  if (!step) throw new Error("Step not found.");
  const a = await requireEditPlan(step.planId);
  const completed = status === "done"
    ? { completedAt: new Date(), completedById: a.userId ?? null }
    : { completedAt: null, completedById: null };
  await prisma.schoolPlanStep.update({
    where: { id: stepId },
    data: {
      status,
      blockingNote: status === "blocked" ? (blockingNote?.trim() || null) : null,
      ...completed,
    },
  });
  refreshPlan(step.planId);
}

export async function setStepOwner(stepId: string, ownerUserId: string | null) {
  const step = await prisma.schoolPlanStep.findUnique({ where: { id: stepId }, select: { planId: true } });
  if (!step) throw new Error("Step not found.");
  await requireEditPlan(step.planId);
  await prisma.schoolPlanStep.update({ where: { id: stepId }, data: { ownerUserId: ownerUserId || null } });
  refreshPlan(step.planId);
}

export async function setStepDueDate(stepId: string, iso: string | null) {
  const step = await prisma.schoolPlanStep.findUnique({ where: { id: stepId }, select: { planId: true } });
  if (!step) throw new Error("Step not found.");
  await requireEditPlan(step.planId);
  await prisma.schoolPlanStep.update({ where: { id: stepId }, data: { dueDate: iso ? new Date(iso) : null } });
  refreshPlan(step.planId);
}

// ---------- Signoff ----------

export async function upsertSignoff(planId: string, patch: {
  markPrepared?: boolean;
  markReviewed?: boolean;
  markApproved?: boolean;
  reviewerNotes?: string | null;
  approvalNotes?: string | null;
}) {
  const a = await requireEditPlan(planId);
  const now = new Date();
  await prisma.schoolPlanSignoff.upsert({
    where: { planId },
    create: {
      planId,
      preparedAt: patch.markPrepared ? now : null,
      preparedById: patch.markPrepared ? a.userId : null,
      reviewedAt: patch.markReviewed ? now : null,
      reviewedById: patch.markReviewed ? a.userId : null,
      reviewerNotes: patch.reviewerNotes?.trim() || null,
      approvedAt: patch.markApproved ? now : null,
      approvedById: patch.markApproved ? a.userId : null,
      approvalNotes: patch.approvalNotes?.trim() || null,
    },
    update: {
      preparedAt: patch.markPrepared ? now : undefined,
      preparedById: patch.markPrepared ? a.userId : undefined,
      reviewedAt: patch.markReviewed ? now : undefined,
      reviewedById: patch.markReviewed ? a.userId : undefined,
      reviewerNotes: patch.reviewerNotes === undefined ? undefined : (patch.reviewerNotes?.trim() || null),
      approvedAt: patch.markApproved ? now : undefined,
      approvedById: patch.markApproved ? a.userId : undefined,
      approvalNotes: patch.approvalNotes === undefined ? undefined : (patch.approvalNotes?.trim() || null),
    },
  });
  refreshPlan(planId);
}

// ---------- Members (admin) ----------

export async function addMember(input: { userEmail: string; role: string; planId: string | null }) {
  await requireStructure();
  const email = input.userEmail?.trim().toLowerCase();
  if (!email) throw new Error("Email required.");
  if (!SCHOOL_PLAN_ROLES.some((r) => r.key === input.role)) throw new Error("Unknown role.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}.`);
  const planId = input.planId ?? null;
  // Compound-unique reference doesn't work through Prisma when one key is
  // nullable — use findFirst + create instead.
  const existing = await prisma.schoolPlanMember.findFirst({
    where: { userId: user.id, role: input.role, planId },
    select: { id: true },
  });
  if (!existing) {
    await prisma.schoolPlanMember.create({ data: { userId: user.id, role: input.role, planId } });
  }
  revalidatePath("/schools/admin/members");
}

export async function removeMember(id: string) {
  await requireStructure();
  await prisma.schoolPlanMember.delete({ where: { id } });
  revalidatePath("/schools/admin/members");
}

// ---------- Completeness helper (shared by pages) ----------

export async function loadPlanForCompleteness(planId: string): Promise<PlanForCompleteness> {
  const plan = await prisma.schoolPlan.findUnique({
    where: { id: planId },
    include: {
      steps: { select: { stepNo: true, status: true } },
      _count: {
        select: {
          settlements: true, spaces: true, staffing: true, milestones: true, risks: true,
        },
      },
      services: { select: { status: true } },
      components: { select: { offerText: true } },
      artifacts: { select: { kind: true } },
      signoff: { select: { approvedAt: true } },
    },
  });
  if (!plan) throw new Error("Plan not found.");
  const artifactsByKind: Record<string, number> = {};
  for (const a of plan.artifacts) artifactsByKind[a.kind] = (artifactsByKind[a.kind] ?? 0) + 1;
  return {
    id: plan.id,
    name: plan.name,
    officialName: plan.officialName,
    district: plan.district,
    headTeacherName: plan.headTeacherName,
    enrolmentBoys: plan.enrolmentBoys,
    enrolmentGirls: plan.enrolmentGirls,
    targetChildrenPerDay: plan.targetChildrenPerDay,
    siteAreaSqft: plan.siteAreaSqft,
    builtupAreaSqft: plan.builtupAreaSqft,
    surveyStatus: plan.surveyStatus,
    capacityRead: plan.capacityRead,
    mobilisationNotes: plan.mobilisationNotes,
    budgetId: plan.budgetId,
    ourLeadUserId: plan.ourLeadUserId,
    anchorPartnerName: plan.anchorPartnerName,
    steps: plan.steps.map((s) => ({ stepNo: s.stepNo, status: s.status as SchoolPlanStepStatusValue })),
    settlementsCount: plan._count.settlements,
    spacesCount: plan._count.spaces,
    servicesAssessedCount: plan.services.filter((s) => s.status !== "unknown").length,
    componentsWithOfferCount: plan.components.filter((c) => (c.offerText ?? "").trim().length > 0).length,
    staffingCount: plan._count.staffing,
    milestonesCount: plan._count.milestones,
    risksCount: plan._count.risks,
    artifactsByKind,
    signoffApproved: !!plan.signoff?.approvedAt,
  };
}
