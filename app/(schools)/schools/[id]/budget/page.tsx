import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";

/** Thin redirector — the actual budget editor lives at /budget/[budgetId]. */
export default async function SchoolBudgetRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await prisma.schoolPlan.findUnique({
    where: { id },
    select: { budgetId: true },
  });
  if (!plan) notFound();
  if (!plan.budgetId) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-3">
        <h1 className="text-lg font-semibold text-stone-900">No budget attached</h1>
        <p className="text-xs text-stone-500">Run the seed script (or ask a central lead to attach one) — <code>npx tsx scripts/seed-school-plan.ts</code>.</p>
        <a href={`/schools/${id}`} className="inline-block text-xs px-3 py-1.5 rounded-full border border-stone-200 text-stone-700 hover:bg-stone-50">← Back to plan</a>
      </div>
    );
  }
  redirect(`/budget/${plan.budgetId}`);
}
