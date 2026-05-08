import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { deleteBudget } from "./actions";

const DOMAIN_LABELS: Record<string, string> = {
  Children: "Children", Youth: "Youth", Elderly: "Elderly + Kitchen",
  WelfareRights: "Welfare Rights", Creche: "Creche",
};

const fmt = (n: number) => `₹${(n / 100000).toFixed(1)}L`;

export default async function BudgetListPage() {
  const session = await auth();
  const budgets = await prisma.budget.findMany({
    where: { partnerId: session!.user!.id! },
    include: { lines: { select: { y1Total: true, y2Total: true, y3Total: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-stone-900">Budgets</h1>
        <Link href="/budget/new" className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-sky-700">
          + New Budget
        </Link>
      </div>

      {budgets.length === 0 && (
        <div className="text-center py-20 text-stone-400">
          <p className="text-sm">No budgets yet.</p>
          <Link href="/budget/new" className="mt-3 inline-block text-sky-600 text-sm hover:underline">Create your first budget →</Link>
        </div>
      )}

      <div className="grid gap-3">
        {budgets.map(b => {
          const y1 = b.lines.reduce((s, l) => s + l.y1Total, 0);
          const y3 = b.lines.reduce((s, l) => s + l.y1Total + l.y2Total + l.y3Total, 0);
          return (
            <Link key={b.id} href={`/budget/${b.id}`}
              className="block bg-white border border-stone-200 rounded-xl px-5 py-4 hover:border-sky-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-stone-900">{b.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === "final" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {b.status === "final" ? "Finalized" : "Draft"}
                    </span>
                    <span className="text-xs text-stone-400">{b.years === 3 ? "3-year" : "1-year"}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {b.domains.map(d => (
                      <span key={d} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">{DOMAIN_LABELS[d] ?? d}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-stone-900">{fmt(y1)}<span className="text-stone-400 font-normal">/yr</span></div>
                  {b.years === 3 && <div className="text-xs text-stone-400">{fmt(y3)} total (3yr)</div>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
