import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import { seedPilotSchools } from "./actions";
import {
  computeSchoolRecurringY1,
  computeStandardRecurringY1,
  computeDeviationPct,
  computeCostPerChildPerYear,
} from "@/lib/schoolPlan/rules";
import {
  STANDARD_SALARY, STANDARD_TRAVEL, STANDARD_PROGRAMME,
  STANDARD_TOTALS_Y1, DEVIATION_THRESHOLD_PCT,
} from "@/lib/schoolPlan/standards";
import { PlanStatusChip, DeviationChip, ProgressBar, inr } from "./_shared";
import { PILOT_SCHOOLS } from "@/lib/schoolPlan/stepTemplate";

// Precompute standard once per render.
const STANDARD_RECURRING = computeStandardRecurringY1(
  [...STANDARD_SALARY, ...STANDARD_TRAVEL, ...STANDARD_PROGRAMME].map((l) => ({
    itemKey: l.itemKey,
    unitCost: l.unitCost,
    scaleUnits: l.units,
  })),
);

export default async function SchoolsBoardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canAccess) redirect("/portal");

  // Central sees all; plan-scoped sees only their planIds.
  const where = access.isCentral
    ? {}
    : { id: { in: access.planIds } };

  const plans = await prisma.schoolPlan.findMany({
    where,
    orderBy: [{ name: "asc" }],
    include: {
      _count: { select: { steps: true } },
      steps: { select: { stepNo: true, status: true } },
      budget: {
        select: {
          id: true,
          lines: { select: { section: true, y1Total: true, templateKey: true } },
        },
      },
    },
  });

  const nothing = plans.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">School Plans</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            After-school centres in Moulana Azad Model Schools · Directorate of Minorities pilot
          </p>
        </div>
        {access.canManageStructure && (
          <Link href="/schools/new" className="text-xs px-3 py-1.5 rounded-full bg-sky-500 text-white hover:bg-sky-600 shrink-0">
            + New plan
          </Link>
        )}
      </div>

      {nothing && access.canManageStructure && (
        <form action={seedPilotSchools} className="border border-stone-200 rounded-2xl p-6 bg-white text-center">
          <p className="text-sm text-stone-700">No plans yet. Seed the 5 pilot schools (Yelahanka, Shikaripalya, Anekal, Vidyaranyapura, DJ Halli) with the 16-step template + defaults.</p>
          <button className="mt-3 text-xs px-3 py-1.5 rounded-full bg-sky-500 text-white hover:bg-sky-600" type="submit">Seed pilot schools</button>
          <p className="mt-2 text-[10px] text-stone-400">Or run <code>npx tsx scripts/seed-school-plan.ts</code> for full annexure + budget wiring.</p>
        </form>
      )}
      {nothing && !access.canManageStructure && (
        <p className="text-sm text-stone-500">No plans available to you yet. Ask a central lead to add you.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {plans.map((p) => {
          const doneOrNa = p.steps.filter((s) => s.status === "done" || s.status === "not_applicable").length;
          const total = p._count.steps || 16;
          const pct = total > 0 ? (doneOrNa / total) * 100 : 0;

          const lines = p.budget?.lines ?? [];
          const recurring = computeSchoolRecurringY1(lines.map((l) => ({
            section: String(l.section),
            templateKey: l.templateKey,
            y1Total: l.y1Total,
          })));
          const deviationPct = computeDeviationPct(recurring, STANDARD_RECURRING);
          const costPerChildYr = computeCostPerChildPerYear(recurring, p.targetChildrenPerDay ?? null);

          return (
            <Link
              key={p.id}
              href={`/schools/${p.id}`}
              className="block rounded-2xl bg-white border border-stone-200 hover:border-stone-300 hover:shadow-sm transition p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900 truncate">{p.name}</div>
                  <div className="text-[11px] text-stone-500 truncate">{p.officialName ?? "—"}</div>
                </div>
                <PlanStatusChip status={p.planStatus} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-stone-500">
                  <span>Steps</span>
                  <span>{doneOrNa}/{total}</span>
                </div>
                <ProgressBar pct={pct} />
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                {access.seesSensitive
                  ? <DeviationChip pct={deviationPct} />
                  : <span className="text-[10px] text-stone-400">Budget restricted</span>}
                <span className="text-stone-500">
                  {access.seesSensitive && costPerChildYr ? `${inr(costPerChildYr)}/child/yr` : ""}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {plans.length > 0 && access.seesSensitive && (
        <p className="text-[10px] text-stone-400 pt-2">
          Standard recurring Y1 = {inr(STANDARD_TOTALS_Y1.recurringRupees)} · GC re-approval threshold {DEVIATION_THRESHOLD_PCT}%
        </p>
      )}
    </div>
  );
}
