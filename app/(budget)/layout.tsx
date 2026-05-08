import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Budget Builder – APF",
  description: "Grant proposal budget generator for partners",
};

export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-3 flex items-center gap-3">
        <span className="text-sm font-semibold text-stone-800 tracking-wide">APF Budget Builder</span>
        <span className="text-stone-300">|</span>
        <span className="text-xs text-stone-500">Bangalore · Partner Grant Proposals</span>
        <div className="ml-auto flex items-center gap-4">
          <a href="/budget" className="text-xs text-stone-500 hover:text-stone-800">My Budgets</a>
          <a href="/budget/admin" className="text-xs text-stone-400 hover:text-stone-700">Cost Registry</a>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
