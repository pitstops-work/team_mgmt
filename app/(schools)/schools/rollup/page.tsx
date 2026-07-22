import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import {
  computeSchoolRecurringY1, computeStandardRecurringY1,
  computeDeviationPct, computeSpaceCapacity,
} from "@/lib/schoolPlan/rules";
import {
  STANDARD_CAPEX, STANDARD_SALARY, STANDARD_TRAVEL, STANDARD_PROGRAMME,
  STANDARD_TOTALS_Y1, DEVIATION_THRESHOLD_PCT,
} from "@/lib/schoolPlan/standards";
import { inr, PlanStatusChip, DeviationChip, ProgressBar } from "../_shared";
import type { SchoolPlanStepStatusValue } from "@/lib/schoolPlan/types";

const STANDARD_RECURRING = computeStandardRecurringY1(
  [...STANDARD_SALARY, ...STANDARD_TRAVEL, ...STANDARD_PROGRAMME].map((l) => ({
    itemKey: l.itemKey, unitCost: l.unitCost, scaleUnits: l.units,
  })),
);

export default async function RollupPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canAccess) redirect("/portal");

  // Rollup is a QRM view; hide from non-central roles for now.
  if (!access.isCentral) redirect("/schools");

  const plans = await prisma.schoolPlan.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      _count: { select: { steps: true } },
      steps: { select: { status: true, dueDate: true } },
      spaces: { select: { capacityPerSession: true, sessionsPerDay: true } },
      budget: { select: { lines: { select: { section: true, y1Total: true, templateKey: true } } } },
    },
  });

  const rows = plans.map((p) => {
    const done = p.steps.filter((s) => s.status === "done" || s.status === "not_applicable").length;
    const total = p._count.steps || 16;
    const blocked = p.steps.filter((s) => s.status === "blocked").length;
    const now = new Date();
    const overdueOpen = p.steps.filter((s) => {
      if (s.status === "done" || s.status === "not_applicable") return false;
      return s.dueDate && s.dueDate < now;
    }).length;
    const lines = p.budget?.lines ?? [];
    const recurring = computeSchoolRecurringY1(
      lines.map((l) => ({ section: String(l.section), templateKey: l.templateKey, y1Total: l.y1Total })),
    );
    const capex = lines
      .filter((l) => String(l.section) === "capex")
      .reduce((s, l) => s + l.y1Total, 0);
    const deviation = computeDeviationPct(recurring, STANDARD_RECURRING);
    const dailyCapacity = computeSpaceCapacity(p.spaces);
    return {
      id: p.id, name: p.name, officialName: p.officialName, planStatus: p.planStatus,
      isInterim: p.isInterimStructure,
      done, total, blocked, overdueOpen,
      target: p.targetChildrenPerDay ?? 0,
      dailyCapacity, capex, recurring, deviation,
    };
  });

  const tot = {
    target: rows.reduce((s, r) => s + r.target, 0),
    dailyCapacity: rows.reduce((s, r) => s + r.dailyCapacity, 0),
    capex: rows.reduce((s, r) => s + r.capex, 0),
    recurring: rows.reduce((s, r) => s + r.recurring, 0),
    stdCapex: STANDARD_TOTALS_Y1.capexRupees * plans.length,
    stdRecurring: STANDARD_RECURRING * plans.length,
    flags: rows.filter((r) => r.deviation !== null && Math.abs(r.deviation) > DEVIATION_THRESHOLD_PCT).length,
    blocked: rows.reduce((s, r) => s + r.blocked, 0),
    overdue: rows.reduce((s, r) => s + r.overdueOpen, 0),
    doneSteps: rows.reduce((s, r) => s + r.done, 0),
    totalSteps: rows.reduce((s, r) => s + r.total, 0),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Link href="/schools" className="hover:text-stone-700">← All plans</Link>
      </div>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">Cross-school rollup</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          QRM view · {rows.length} plans · standard reference {inr(STANDARD_TOTALS_Y1.recurringRupees)}/school recurring
        </p>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Children/day committed" value={tot.target.toLocaleString("en-IN")} />
        <StatCard label="Daily capacity built"    value={tot.dailyCapacity.toLocaleString("en-IN")} sub={tot.target > tot.dailyCapacity ? `Short by ${(tot.target - tot.dailyCapacity).toLocaleString("en-IN")}` : "OK"} />
        <StatCard label="Capex committed"         value={inr(tot.capex)}      sub={`Std ${inr(tot.stdCapex)}`} />
        <StatCard label="Recurring Y1 committed"  value={inr(tot.recurring)}  sub={`Std ${inr(tot.stdRecurring)}`} />
        <StatCard label="Steps done"              value={`${tot.doneSteps}/${tot.totalSteps}`} sub={`${Math.round((tot.doneSteps / Math.max(1, tot.totalSteps)) * 100)}%`} />
        <StatCard label="Blocked steps"           value={tot.blocked}   sub="across all plans" />
        <StatCard label="Overdue open"            value={tot.overdue}   sub="past due date" />
        <StatCard label="GC-flag plans"           value={tot.flags}     sub={`|deviation| > ${DEVIATION_THRESHOLD_PCT}%`} />
      </div>

      {/* Per-plan table */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="text-[10px] uppercase tracking-widest text-stone-500 px-4 py-2 bg-stone-50">Per plan</div>
        <table className="w-full text-xs">
          <thead className="text-stone-500 text-[10px]">
            <tr>
              <th className="text-left px-4 py-2">Plan</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Steps</th>
              <th className="text-right px-4 py-2">Target</th>
              <th className="text-right px-4 py-2">Capacity</th>
              <th className="text-right px-4 py-2">Capex</th>
              <th className="text-right px-4 py-2">Recurring</th>
              <th className="text-left px-4 py-2">Deviation</th>
              <th className="text-right px-4 py-2">Blocked/overdue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-stone-100">
                <td className="px-4 py-2">
                  <Link href={`/schools/${r.id}`} className="text-stone-800 hover:text-sky-700">
                    {r.name}
                    {r.isInterim && <span className="ml-1 text-[9px] text-amber-700">(interim)</span>}
                  </Link>
                </td>
                <td className="px-4 py-2"><PlanStatusChip status={r.planStatus} /></td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2 min-w-[160px]">
                    <ProgressBar pct={(r.done / Math.max(1, r.total)) * 100} />
                    <span className="text-stone-500 whitespace-nowrap">{r.done}/{r.total}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right">{r.target || "—"}</td>
                <td className={`px-4 py-2 text-right ${r.dailyCapacity < r.target && r.target ? "text-amber-700" : ""}`}>{r.dailyCapacity || "—"}</td>
                <td className="px-4 py-2 text-right">{r.capex ? inr(r.capex) : "—"}</td>
                <td className="px-4 py-2 text-right">{r.recurring ? inr(r.recurring) : "—"}</td>
                <td className="px-4 py-2"><DeviationChip pct={r.deviation} /></td>
                <td className="px-4 py-2 text-right text-stone-600">
                  {r.blocked > 0 && <span className="text-rose-700">{r.blocked} blocked</span>}
                  {r.blocked > 0 && r.overdueOpen > 0 && <span className="mx-1 text-stone-300">·</span>}
                  {r.overdueOpen > 0 && <span className="text-amber-700">{r.overdueOpen} overdue</span>}
                  {!r.blocked && !r.overdueOpen && "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-stone-400">
        Deviation threshold {DEVIATION_THRESHOLD_PCT}% · plans above threshold require GC re-approval.
      </p>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-white border border-stone-200 px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">{label}</div>
      <div className="text-lg font-semibold text-stone-900 mt-0.5">{value ?? "—"}</div>
      {sub && <div className="text-[10px] text-stone-500 mt-0.5">{sub}</div>}
    </div>
  );
}
