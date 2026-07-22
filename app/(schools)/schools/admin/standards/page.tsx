import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import {
  STANDARD_CAPEX, STANDARD_SALARY, STANDARD_TRAVEL, STANDARD_PROGRAMME,
  STANDARD_TOTALS_Y1, STANDARD_UNIT_COST_PER_CHILD_PER_YEAR, DEVIATION_THRESHOLD_PCT,
} from "@/lib/schoolPlan/standards";
import { inr } from "../../_shared";

export default async function StandardsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canManageStructure) redirect("/schools");

  const groups = [
    { title: "Capex (Y1 one-time)",    rows: STANDARD_CAPEX,     total: STANDARD_TOTALS_Y1.capexRupees },
    { title: "Salary / honorarium",    rows: STANDARD_SALARY,    total: STANDARD_TOTALS_Y1.salaryRupees },
    { title: "Travel",                 rows: STANDARD_TRAVEL,    total: STANDARD_TOTALS_Y1.travelRupees },
    { title: "Programme expenses",     rows: STANDARD_PROGRAMME, total: STANDARD_TOTALS_Y1.programmeRupees },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Link href="/schools" className="hover:text-stone-700">← Plans</Link>
      </div>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">Standard cost (per school, Y1)</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Read-only reference from the annexure. Each school's budget is compared against these figures. Deviation &gt;{DEVIATION_THRESHOLD_PCT}% flags GC re-approval. Unit-cost benchmark: ₹{STANDARD_UNIT_COST_PER_CHILD_PER_YEAR.toLocaleString("en-IN")}/child/year.
        </p>
      </div>

      {groups.map((g) => (
        <div key={g.title} className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <div className="text-[10px] uppercase tracking-widest text-stone-500 px-4 py-2 bg-stone-50">{g.title}</div>
          <table className="w-full text-xs">
            <thead className="text-stone-500 text-[10px]">
              <tr>
                <th className="text-left px-4 py-1.5">Line</th>
                <th className="text-right px-4 py-1.5">Unit cost</th>
                <th className="text-left px-4 py-1.5">Unit</th>
                <th className="text-right px-4 py-1.5">Units Y1</th>
                <th className="text-right px-4 py-1.5">Total Y1</th>
                <th className="text-left px-4 py-1.5">Inflation</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.itemKey} className="border-t border-stone-100">
                  <td className="px-4 py-1.5">{r.description}
                    {r.notes && <div className="text-[10px] text-stone-400">{r.notes}</div>}
                  </td>
                  <td className="px-4 py-1.5 text-right">{inr(r.unitCost)}</td>
                  <td className="px-4 py-1.5 text-stone-500">{r.unit}</td>
                  <td className="px-4 py-1.5 text-right">{r.units}</td>
                  <td className="px-4 py-1.5 text-right">{inr(r.unitCost * r.units)}</td>
                  <td className="px-4 py-1.5 text-stone-500">{r.inflation}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-200 font-medium">
                <td colSpan={4} className="px-4 py-1.5 text-right">Sub-total</td>
                <td className="px-4 py-1.5 text-right">{inr(g.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      <div className="rounded-xl bg-[#E9EEF6] px-4 py-3 text-xs text-stone-700 flex items-center gap-3">
        <span className="text-stone-500">Y1 total</span>
        <b>{inr(STANDARD_TOTALS_Y1.totalRupees)}</b>
        <span className="mx-2 text-stone-300">·</span>
        <span className="text-stone-500">Y1 recurring (opex)</span>
        <b>{inr(STANDARD_TOTALS_Y1.recurringRupees)}</b>
      </div>
    </div>
  );
}
