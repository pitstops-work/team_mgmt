import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess, canViewPlan } from "@/lib/schoolPlan/access";
import { buildSchoolPlanDocx } from "@/lib/schoolPlan/docxExport";
import {
  computeSchoolRecurringY1, computeStandardRecurringY1, computeDeviationPct,
} from "@/lib/schoolPlan/rules";
import {
  STANDARD_SALARY, STANDARD_TRAVEL, STANDARD_PROGRAMME, STANDARD_TOTALS_Y1,
} from "@/lib/schoolPlan/standards";
import { SERVICE_ITEMS, PROGRAMME_COMPONENTS } from "@/lib/schoolPlan/stepTemplate";
import type { SchoolPlanStepStatusValue } from "@/lib/schoolPlan/types";

const STANDARD_RECURRING = computeStandardRecurringY1(
  [...STANDARD_SALARY, ...STANDARD_TRAVEL, ...STANDARD_PROGRAMME].map((l) => ({
    itemKey: l.itemKey, unitCost: l.unitCost, scaleUnits: l.units,
  })),
);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getSchoolPlanAccess(session);
  if (!canViewPlan(access, id)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const plan = await prisma.schoolPlan.findUnique({
    where: { id },
    include: {
      ourLead: { select: { name: true, email: true } },
      anchorPartner: { select: { name: true } },
      settlements: { orderBy: { sortOrder: "asc" } },
      spaces: { orderBy: { sortOrder: "asc" } },
      services: true,
      components: { orderBy: { sortOrder: "asc" } },
      staffing: { orderBy: { sortOrder: "asc" } },
      milestones: { orderBy: { sortOrder: "asc" } },
      risks: { orderBy: { sortOrder: "asc" } },
      signoff: true,
      budget: { select: { name: true, lines: { select: { section: true, y1Total: true, templateKey: true } } } },
      steps: {
        orderBy: { stepNo: "asc" },
        include: { owner: { select: { name: true, email: true } } },
      },
    },
  });
  if (!plan) return Response.json({ error: "Not found" }, { status: 404 });

  const lines = plan.budget?.lines ?? [];
  const y1Recurring = computeSchoolRecurringY1(
    lines.map((l) => ({ section: String(l.section), templateKey: l.templateKey, y1Total: l.y1Total })),
  );
  const y1Capex = lines.filter((l) => String(l.section) === "capex").reduce((s, l) => s + l.y1Total, 0);
  const deviationPct = computeDeviationPct(y1Recurring, STANDARD_RECURRING);
  const anchorLabel = plan.anchorPartner?.name ?? plan.anchorPartnerName;

  const svcMap = new Map(plan.services.map((s) => [s.item, s]));
  const services = SERVICE_ITEMS.map((it) => {
    const row = svcMap.get(it.key);
    return { item: it.key, label: it.label, status: row?.status ?? "unknown", details: row?.details ?? null };
  });
  const compMap = new Map(plan.components.map((c) => [c.component, c]));
  const components = PROGRAMME_COMPONENTS.map((def) => {
    const row = compMap.get(def.key);
    return {
      key: def.key, label: def.label,
      offerText: row?.offerText ?? null,
      deliveredBy: row?.deliveredBy ?? def.defaultDelivery,
      schedule: row?.schedule ?? null,
      childrenPerDay: row?.childrenPerDay ?? null,
      planVetted: row?.planVetted ?? false,
    };
  });

  const buffer = await buildSchoolPlanDocx({
    id: plan.id,
    name: plan.name,
    officialName: plan.officialName,
    diseCode: plan.diseCode,
    schoolType: plan.schoolType,
    addressText: plan.addressText,
    district: plan.district,
    ward: plan.ward,
    yearEstablished: plan.yearEstablished,
    grades: plan.grades,
    sections: plan.sections,
    mediums: plan.mediums,
    enrolmentBoys: plan.enrolmentBoys,
    enrolmentGirls: plan.enrolmentGirls,
    teachersSanctioned: plan.teachersSanctioned,
    teachersWorking: plan.teachersWorking,
    classroomsCount: plan.classroomsCount,
    otherRoomsCount: plan.otherRoomsCount,
    timings: plan.timings,
    shifts: plan.shifts,
    vacationMonths: plan.vacationMonths,
    headTeacherName: plan.headTeacherName,
    headTeacherPhone: plan.headTeacherPhone,
    sdmcStatus: plan.sdmcStatus,
    deptContactName: plan.deptContactName,
    siteAreaSqft: plan.siteAreaSqft,
    builtupAreaSqft: plan.builtupAreaSqft,
    surveyStatus: plan.surveyStatus,
    targetChildrenPerDay: plan.targetChildrenPerDay,
    capacityRead: plan.capacityRead,
    mobilisationNotes: plan.mobilisationNotes,
    campusAfterHoursUse: plan.campusAfterHoursUse,
    isInterimStructure: plan.isInterimStructure,
    interimStructureSpec: plan.interimStructureSpec,
    planStatus: String(plan.planStatus),
    planVersion: plan.planVersion,
    ourLead: plan.ourLead ? { name: plan.ourLead.name, email: plan.ourLead.email } : null,
    anchorLabel: anchorLabel,
    settlements: plan.settlements.map((s) => ({
      name: s.name, distanceMeters: s.distanceMeters, walkMinutes: s.walkMinutes,
      children0to3: s.children0to3, children3to14: s.children3to14, children14to18: s.children14to18,
      existingServices: s.existingServices,
    })),
    spaces: plan.spaces.map((s) => ({
      building: s.building, floor: s.floor, name: s.name, sizeSqm: s.sizeSqm,
      currentUse: s.currentUse, proposedUse: s.proposedUse,
      capacityPerSession: s.capacityPerSession, sessionsPerDay: s.sessionsPerDay,
      changesNeeded: s.changesNeeded, structuralFlags: s.structuralFlags,
    })),
    services,
    components,
    staffing: plan.staffing.map((r) => ({
      role: r.role, count: r.count, payroll: String(r.payroll), status: r.status, notes: r.notes,
    })),
    milestones: plan.milestones.map((m) => ({ name: m.name, targetDate: m.targetDate, status: m.status })),
    risks: plan.risks.map((r) => ({ description: r.description, mitigation: r.mitigation, status: r.status })),
    signoff: plan.signoff ? {
      preparedAt: plan.signoff.preparedAt,
      reviewedAt: plan.signoff.reviewedAt,
      approvedAt: plan.signoff.approvedAt,
      reviewerNotes: plan.signoff.reviewerNotes,
      approvalNotes: plan.signoff.approvalNotes,
    } : null,
    budget: plan.budget ? { name: plan.budget.name, y1Recurring, y1Capex } : null,
    steps: plan.steps.map((s) => ({
      stepNo: s.stepNo,
      title: s.title,
      status: s.status as SchoolPlanStepStatusValue,
      ownerLabel: s.owner ? (s.owner.name ?? s.owner.email) : null,
      dueDate: s.dueDate,
    })),
    deviationPct,
    standardRecurring: STANDARD_RECURRING,
    standardTotal: STANDARD_TOTALS_Y1.totalRupees,
    seesSensitive: access.seesSensitive,
  });

  const safeName = plan.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="school-plan-${safeName}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
