import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSeedingAccess } from "@/lib/seeding/access";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Seeding Fellowships",
  description: "Phase-1 launch tracker for the Seeding Fellowships programme",
};

const NAV: { href: string; label: string; mobile?: boolean }[] = [
  { href: "/seeding", label: "Dashboard", mobile: true },
  { href: "/seeding/workstreams", label: "Checklist", mobile: true },
  { href: "/seeding/funnel", label: "Funnel", mobile: true },
  { href: "/seeding/geo", label: "Geographies" },
  { href: "/seeding/my", label: "My tasks", mobile: true },
  { href: "/seeding/timeline", label: "Timeline" },
  { href: "/seeding/reference", label: "Reference" },
];

export default async function SeedingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSeedingAccess(session);
  if (!access.canAccess) redirect("/portal");

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-4 py-3 flex items-center gap-3 min-w-0">
        <a href="/portal" className="text-xs text-stone-400 hover:text-stone-700 shrink-0">← Portal</a>
        <span className="text-sm font-semibold text-stone-800 tracking-wide shrink-0 hidden sm:inline">Seeding Fellowships</span>
        <nav className="ml-auto flex items-center gap-3 overflow-x-auto">
          {NAV.map((n) => (
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
              <a href="/seeding/admin/milestones" className="text-xs text-stone-400 hover:text-stone-700 shrink-0 hidden sm:inline">Milestones</a>
              <a href="/seeding/admin/members" className="text-xs text-stone-400 hover:text-stone-700 shrink-0 hidden sm:inline">Members</a>
            </>
          )}
          <SignOutButton />
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
