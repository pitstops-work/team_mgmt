import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess, canEditPlan } from "@/lib/schoolPlan/access";
import EditClient from "../_components/EditClient";
import { SERVICE_ITEMS, PROGRAMME_COMPONENTS } from "@/lib/schoolPlan/stepTemplate";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!canEditPlan(access, id)) redirect(`/schools/${id}`);

  const plan = await prisma.schoolPlan.findUnique({
    where: { id },
    include: {
      settlements: { orderBy: { sortOrder: "asc" } },
      spaces: { orderBy: { sortOrder: "asc" } },
      services: true,
      components: { orderBy: { sortOrder: "asc" } },
      staffing: { orderBy: { sortOrder: "asc" } },
      milestones: { orderBy: { sortOrder: "asc" } },
      risks: { orderBy: { sortOrder: "asc" } },
      signoff: true,
    },
  });
  if (!plan) notFound();

  const [users, grantPartners] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["member", "admin", "super-admin"] } },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, email: true },
      take: 200,
    }),
    prisma.grantPartner.findMany({
      where: { isActive: true },
      orderBy: [{ city: "asc" }, { name: "asc" }],
      select: { id: true, name: true, city: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Link href={`/schools/${id}`} className="hover:text-stone-700">← {plan.name}</Link>
      </div>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">Edit plan</h1>
        <p className="text-xs text-stone-500 mt-0.5">Fill any section. The plan page updates immediately.</p>
      </div>
      <EditClient
        plan={{
          id: plan.id,
          name: plan.name,
          officialName: plan.officialName,
          diseCode: plan.diseCode,
          schoolType: plan.schoolType,
          addressText: plan.addressText,
          taluk: plan.taluk,
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
          ourLeadUserId: plan.ourLeadUserId,
          anchorPartnerId: plan.anchorPartnerId,
          anchorPartnerName: plan.anchorPartnerName,
          campusAfterHoursUse: plan.campusAfterHoursUse,
          siteAreaSqft: plan.siteAreaSqft,
          builtupAreaSqft: plan.builtupAreaSqft,
          surveyStatus: plan.surveyStatus,
          targetChildrenPerDay: plan.targetChildrenPerDay,
          geoLat: plan.geoLat,
          geoLng: plan.geoLng,
          capacityRead: plan.capacityRead,
          mobilisationNotes: plan.mobilisationNotes,
          isInterimStructure: plan.isInterimStructure,
          interimStructureSpec: plan.interimStructureSpec,
          publicSlug: plan.publicSlug,
          planStatus: plan.planStatus,
        }}
        settlements={plan.settlements}
        spaces={plan.spaces.map((s) => ({ ...s, sizeSqm: s.sizeSqm }))}
        services={plan.services.map((s) => ({ id: s.id, item: s.item, status: s.status, details: s.details }))}
        components={plan.components.map((c) => ({
          id: c.id, component: c.component, offerText: c.offerText,
          deliveredBy: c.deliveredBy, schedule: c.schedule,
          childrenPerDay: c.childrenPerDay, planVetted: c.planVetted,
          specialistPartnerId: c.specialistPartnerId,
        }))}
        staffing={plan.staffing.map((s) => ({
          id: s.id, role: s.role, count: s.count, payroll: s.payroll,
          status: s.status, notes: s.notes,
        }))}
        milestones={plan.milestones.map((m) => ({
          id: m.id, name: m.name,
          targetDate: m.targetDate?.toISOString() ?? null,
          dependsOn: m.dependsOn, status: m.status,
        }))}
        risks={plan.risks.map((r) => ({
          id: r.id, description: r.description, mitigation: r.mitigation,
          ownerUserId: r.ownerUserId, status: r.status,
        }))}
        signoff={plan.signoff ? {
          preparedAt: plan.signoff.preparedAt?.toISOString() ?? null,
          reviewedAt: plan.signoff.reviewedAt?.toISOString() ?? null,
          approvedAt: plan.signoff.approvedAt?.toISOString() ?? null,
          reviewerNotes: plan.signoff.reviewerNotes,
          approvalNotes: plan.signoff.approvalNotes,
        } : null}
        users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
        grantPartners={grantPartners.map((g) => ({ id: g.id, label: `${g.name} (${g.city})` }))}
        canManageStructure={access.canManageStructure}
        serviceItems={SERVICE_ITEMS}
        componentDefs={PROGRAMME_COMPONENTS}
      />
    </div>
  );
}
