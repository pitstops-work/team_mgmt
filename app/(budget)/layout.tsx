import { auth } from "@/lib/auth";
import { isBudgetAdmin } from "@/lib/roleGuard";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Budget Builder",
  description: "Grant proposal budget generator for partners",
};

export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const budgetOnly = isBudgetAdmin(session);
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-4 py-3 flex items-center gap-3">
        {!budgetOnly && (
          <a href="/portal" className="text-xs text-stone-400 hover:text-stone-700">← Portal</a>
        )}
        <span className="text-sm font-semibold text-stone-800 tracking-wide">Budget Builder</span>
        <div className="ml-auto flex items-center gap-4">
          <a href="/budget" className="text-xs text-stone-500 hover:text-stone-800">My Budgets</a>
          <a href="/admin" className="text-xs text-stone-400 hover:text-stone-700">Admin</a>
          {budgetOnly && <SignOutButton />}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
