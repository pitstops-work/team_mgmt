import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "School Plans — After-School Centres",
  description: "Plans for the Directorate-of-Minorities after-school centres pilot",
};

const NAV: { href: string; label: string; mobile?: boolean; centralOnly?: boolean }[] = [
  { href: "/schools",        label: "Plans",     mobile: true },
  { href: "/schools/my",     label: "My steps",  mobile: true },
  { href: "/schools/rollup", label: "Rollup",    centralOnly: true },
];

export default async function SchoolsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canAccess) redirect("/portal");

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-4 py-3 flex items-center gap-3 min-w-0">
        <a href="/portal" className="text-xs text-stone-400 hover:text-stone-700 shrink-0">← Portal</a>
        <span className="text-sm font-semibold text-stone-800 tracking-wide shrink-0 hidden sm:inline">
          After-School Centres
        </span>
        <nav className="ml-auto flex items-center gap-3 overflow-x-auto">
          {NAV.filter((n) => !n.centralOnly || access.isCentral).map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={`text-xs text-stone-500 hover:text-stone-800 shrink-0 ${n.mobile ? "" : "hidden sm:inline"}`}
            >
              {n.label}
            </a>
          ))}
          {access.canManageStructure && (
            <>
              <a href="/schools/new" className="text-xs text-stone-400 hover:text-stone-700 shrink-0 hidden sm:inline">+ School</a>
              <a href="/schools/admin/standards" className="text-xs text-stone-400 hover:text-stone-700 shrink-0 hidden sm:inline">Standards</a>
              <a href="/schools/admin/members" className="text-xs text-stone-400 hover:text-stone-700 shrink-0 hidden sm:inline">Members</a>
            </>
          )}
          <a href="/settings" className="text-xs text-stone-400 hover:text-stone-700 shrink-0">Account</a>
          <SignOutButton />
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
