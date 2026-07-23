import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import { StepChip } from "../_shared";
import type { SchoolPlanStepStatusValue } from "@/lib/schoolPlan/types";

// Sort order matches the pre-substep query: pending/in_progress first (by
// status enum ascending), then dueDate ascending nulls-last, then plan+step.
// Enum ordering matches Prisma's ascending on the underlying string.
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
  dueMs: number;              // for sort; Infinity when null
  status0: number;
};

export default async function MyStepsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canAccess) redirect("/portal");
  const userId = access.userId;
  if (!userId) redirect("/portal");

  // Two sources unioned:
  //   (a) SchoolPlanStep where owner=me AND has no substeps (self-owned step)
  //   (b) SchoolPlanSubstep where owner=me
  // In the substep case the parent step's own owner is deliberately NOT surfaced
  // — the substep is the atom of work.
  const [steps, substeps] = await Promise.all([
    prisma.schoolPlanStep.findMany({
      where: { ownerUserId: userId, substeps: { none: {} } },
      select: {
        id: true, stepNo: true, title: true, planSection: true, status: true,
        dueDate: true, blockingNote: true,
        planId: true, plan: { select: { name: true } },
      },
    }),
    prisma.schoolPlanSubstep.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true, title: true, status: true, dueDate: true, blockingNote: true,
        step: {
          select: {
            id: true, stepNo: true, title: true, planSection: true,
            planId: true, plan: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const rows: Row[] = [
    ...steps.map<Row>((s) => ({
      key: `step:${s.id}`,
      href: `/schools/${s.planId}/steps`,
      title: (<>{s.plan.name} <span className="text-stone-400">·</span> {s.title}</>),
      meta: `Step #${s.stepNo}${s.planSection ? ` · §${s.planSection}` : ""}${s.dueDate ? ` · due ${s.dueDate.toISOString().slice(0, 10)}` : ""}`,
      blockingNote: s.blockingNote,
      status: s.status,
      dueMs: s.dueDate ? s.dueDate.getTime() : Number.POSITIVE_INFINITY,
      status0: STATUS_ORDER[s.status],
    })),
    ...substeps.map<Row>((ss) => ({
      key: `sub:${ss.id}`,
      href: `/schools/${ss.step.planId}/steps#substep-${ss.id}`,
      title: (
        <>
          {ss.step.plan.name} <span className="text-stone-400">·</span> {ss.step.title} <span className="text-stone-400">›</span> {ss.title}
        </>
      ),
      meta: `Step #${ss.step.stepNo}${ss.step.planSection ? ` · §${ss.step.planSection}` : ""}${ss.dueDate ? ` · due ${ss.dueDate.toISOString().slice(0, 10)}` : ""}`,
      blockingNote: ss.blockingNote,
      status: ss.status,
      dueMs: ss.dueDate ? ss.dueDate.getTime() : Number.POSITIVE_INFINITY,
      status0: STATUS_ORDER[ss.status],
    })),
  ].sort((a, b) => a.status0 - b.status0 || a.dueMs - b.dueMs);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-900">My steps</h1>
        <p className="text-xs text-stone-500 mt-0.5">Steps and substeps assigned to you across all school plans.</p>
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
                <div className="text-[11px] text-stone-500 mt-0.5">{r.meta}</div>
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
