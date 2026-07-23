import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import { SCHOOL_PLAN_ROLE_BY_KEY } from "@/lib/schoolPlan/roles";
import { StepChip } from "../_shared";
import { weekLabel } from "@/lib/seeding/weeks";
import type { SchoolPlanStepStatusValue } from "@/lib/schoolPlan/types";

// Sort key by status: blocked / in_progress surface first, done / n/a last.
const STATUS_ORDER: Record<SchoolPlanStepStatusValue, number> = {
  blocked: 0, in_progress: 1, pending: 2, done: 3, not_applicable: 4,
};

type Row = {
  key: string;
  href: string;
  title: React.ReactNode;
  meta: string;
  blockingNote: string | null;
  status: SchoolPlanStepStatusValue;
  dueMs: number;
  status0: number;
  viaRole: string | null;
};

export default async function MyStepsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canAccess) redirect("/portal");
  const userId = access.userId;
  if (!userId) redirect("/portal");

  // Partition memberships into (a) global grants (planId=null, match every plan)
  // and (b) plan-scoped grants (match only that planId). Super-admin sees every
  // ownerRole-tagged row on every plan.
  const isSuper = access.isSuperAdmin;
  const globalRoles = isSuper
    ? Object.keys(SCHOOL_PLAN_ROLE_BY_KEY)
    : [...new Set(access.memberships.filter(m => m.planId === null).map(m => m.role))];
  const planScoped = access.memberships
    .filter(m => m.planId !== null)
    .reduce<Map<string, Set<string>>>((acc, m) => {
      const set = acc.get(m.planId!) ?? new Set<string>();
      set.add(m.role);
      acc.set(m.planId!, set);
      return acc;
    }, new Map());

  // Prisma OR clauses for role-owned rows: global roles filter on ownerRole only;
  // plan-scoped roles filter on (planId + ownerRole).
  const roleStepFilters: object[] = [];
  const roleSubstepFilters: object[] = [];
  if (globalRoles.length > 0) {
    roleStepFilters.push({ ownerRole: { in: globalRoles } });
    roleSubstepFilters.push({ ownerRole: { in: globalRoles } });
  }
  for (const [planId, roles] of planScoped) {
    const rolesArr = [...roles];
    if (rolesArr.length === 0) continue;
    roleStepFilters.push({ planId, ownerRole: { in: rolesArr } });
    roleSubstepFilters.push({ step: { planId }, ownerRole: { in: rolesArr } });
  }

  const [personSteps, personSubsteps, roleSteps, roleSubsteps] = await Promise.all([
    // Person-owned steps with 0 substeps (self-owned mode).
    prisma.schoolPlanStep.findMany({
      where: { ownerUserId: userId, substeps: { none: {} } },
      select: {
        id: true, stepNo: true, title: true, planSection: true, status: true,
        dueDate: true, dueWeek: true, blockingNote: true,
        planId: true, plan: { select: { name: true, launchDate: true } },
      },
    }),
    // Person-owned substeps.
    prisma.schoolPlanSubstep.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true, title: true, status: true, dueDate: true, dueWeek: true, blockingNote: true,
        step: {
          select: {
            stepNo: true, title: true, planSection: true,
            planId: true, plan: { select: { name: true, launchDate: true } },
          },
        },
      },
    }),
    // Role-owned steps (still self-owned mode — substeps=0).
    roleStepFilters.length > 0
      ? prisma.schoolPlanStep.findMany({
          where: {
            substeps: { none: {} },
            ownerRole: { not: null },
            OR: roleStepFilters,
            // Don't double-count person-owned rows also tagged with my role.
            NOT: { ownerUserId: userId },
          },
          select: {
            id: true, stepNo: true, title: true, planSection: true, status: true,
            dueDate: true, dueWeek: true, blockingNote: true, ownerRole: true,
            planId: true, plan: { select: { name: true, launchDate: true } },
          },
        })
      : Promise.resolve([]),
    // Role-owned substeps.
    roleSubstepFilters.length > 0
      ? prisma.schoolPlanSubstep.findMany({
          where: {
            ownerRole: { not: null },
            OR: roleSubstepFilters,
            NOT: { ownerUserId: userId },
          },
          select: {
            id: true, title: true, status: true, dueDate: true, dueWeek: true,
            blockingNote: true, ownerRole: true,
            step: {
              select: {
                stepNo: true, title: true, planSection: true,
                planId: true, plan: { select: { name: true, launchDate: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const fmtDue = (dueDate: Date | null, dueWeek: number | null, launchDate: Date | null): string | null => {
    if (dueWeek !== null && launchDate) return weekLabel(launchDate, dueWeek);
    if (dueDate) return dueDate.toISOString().slice(0, 10);
    return null;
  };

  const rows: Row[] = [
    ...personSteps.map<Row>((s) => ({
      key: `step:${s.id}`,
      href: `/schools/${s.planId}/steps`,
      title: (<>{s.plan.name} <span className="text-stone-400">·</span> {s.title}</>),
      meta: [
        `Step #${s.stepNo}${s.planSection ? ` · §${s.planSection}` : ""}`,
        (() => { const d = fmtDue(s.dueDate, s.dueWeek, s.plan.launchDate); return d ? `due ${d}` : ""; })(),
      ].filter(Boolean).join(" · "),
      blockingNote: s.blockingNote,
      status: s.status,
      dueMs: s.dueDate ? s.dueDate.getTime() : Number.POSITIVE_INFINITY,
      status0: STATUS_ORDER[s.status],
      viaRole: null,
    })),
    ...personSubsteps.map<Row>((ss) => ({
      key: `sub:${ss.id}`,
      href: `/schools/${ss.step.planId}/steps#substep-${ss.id}`,
      title: (
        <>
          {ss.step.plan.name} <span className="text-stone-400">·</span> {ss.step.title} <span className="text-stone-400">›</span> {ss.title}
        </>
      ),
      meta: [
        `Step #${ss.step.stepNo}${ss.step.planSection ? ` · §${ss.step.planSection}` : ""}`,
        (() => { const d = fmtDue(ss.dueDate, ss.dueWeek, ss.step.plan.launchDate); return d ? `due ${d}` : ""; })(),
      ].filter(Boolean).join(" · "),
      blockingNote: ss.blockingNote,
      status: ss.status,
      dueMs: ss.dueDate ? ss.dueDate.getTime() : Number.POSITIVE_INFINITY,
      status0: STATUS_ORDER[ss.status],
      viaRole: null,
    })),
    ...roleSteps.map<Row>((s) => ({
      key: `role-step:${s.id}`,
      href: `/schools/${s.planId}/steps`,
      title: (<>{s.plan.name} <span className="text-stone-400">·</span> {s.title}</>),
      meta: [
        `Step #${s.stepNo}${s.planSection ? ` · §${s.planSection}` : ""}`,
        (() => { const d = fmtDue(s.dueDate, s.dueWeek, s.plan.launchDate); return d ? `due ${d}` : ""; })(),
      ].filter(Boolean).join(" · "),
      blockingNote: s.blockingNote,
      status: s.status,
      dueMs: s.dueDate ? s.dueDate.getTime() : Number.POSITIVE_INFINITY,
      status0: STATUS_ORDER[s.status],
      viaRole: s.ownerRole,
    })),
    ...roleSubsteps.map<Row>((ss) => ({
      key: `role-sub:${ss.id}`,
      href: `/schools/${ss.step.planId}/steps#substep-${ss.id}`,
      title: (
        <>
          {ss.step.plan.name} <span className="text-stone-400">·</span> {ss.step.title} <span className="text-stone-400">›</span> {ss.title}
        </>
      ),
      meta: [
        `Step #${ss.step.stepNo}${ss.step.planSection ? ` · §${ss.step.planSection}` : ""}`,
        (() => { const d = fmtDue(ss.dueDate, ss.dueWeek, ss.step.plan.launchDate); return d ? `due ${d}` : ""; })(),
      ].filter(Boolean).join(" · "),
      blockingNote: ss.blockingNote,
      status: ss.status,
      dueMs: ss.dueDate ? ss.dueDate.getTime() : Number.POSITIVE_INFINITY,
      status0: STATUS_ORDER[ss.status],
      viaRole: ss.ownerRole,
    })),
  ].sort((a, b) => a.status0 - b.status0 || a.dueMs - b.dueMs);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-900">My steps</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Steps + substeps assigned to you, either as the named person or via a role you hold.
        </p>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-stone-400 italic">Nothing assigned to you yet.</p>
      )}
      {rows.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          {rows.map((r) => (
            <Link key={r.key} href={r.href} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 last:border-b-0 hover:bg-stone-50">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-stone-800 truncate">{r.title}</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  {r.meta}
                  {r.viaRole && (
                    <span className="ml-2 text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5">
                      role: {SCHOOL_PLAN_ROLE_BY_KEY[r.viaRole]?.label ?? r.viaRole}
                    </span>
                  )}
                </div>
                {r.blockingNote && <div className="text-[11px] text-rose-700 mt-1">⚠ {r.blockingNote}</div>}
              </div>
              <StepChip status={r.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
