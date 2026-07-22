import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import { StepChip } from "../_shared";

export default async function MyStepsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canAccess) redirect("/portal");
  const userId = access.userId;

  const steps = await prisma.schoolPlanStep.findMany({
    where: { ownerUserId: userId ?? undefined },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { stepNo: "asc" }],
    include: { plan: { select: { id: true, name: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-900">My steps</h1>
        <p className="text-xs text-stone-500 mt-0.5">Steps assigned to you across all school plans.</p>
      </div>
      {steps.length === 0 && (
        <p className="text-xs text-stone-400 italic">Nothing assigned to you yet.</p>
      )}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        {steps.map((s) => (
          <Link key={s.id} href={`/schools/${s.planId}/steps`} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 last:border-b-0 hover:bg-stone-50">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-stone-800 truncate">
                {s.plan.name} <span className="text-stone-400">·</span> {s.title}
              </div>
              <div className="text-[11px] text-stone-500 mt-0.5">
                Step #{s.stepNo}{s.planSection ? ` · §${s.planSection}` : ""}
                {s.dueDate && ` · due ${s.dueDate.toISOString().slice(0, 10)}`}
              </div>
              {s.blockingNote && <div className="text-[11px] text-rose-700 mt-1">⚠ {s.blockingNote}</div>}
            </div>
            <StepChip status={s.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
