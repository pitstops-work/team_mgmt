import type { Metadata } from "next";
import Link from "next/link";
import { requireActor, can, ROLE_LABEL } from "@/lib/urban/access";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Urban Operations",
  description: "Set up partner programmes and review them on a rhythm.",
};

export default async function UrbanLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [admin, team, numbers] = await Promise.all([can(actor, "setup.edit"), can(actor, "team.view"), can(actor, "programme.view")]);
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link href="/portal" className="shrink-0 text-xs text-stone-400 hover:text-stone-700">← Portal</Link>
          <Link href="/urban" className="shrink-0 text-sm font-semibold tracking-tight text-stone-900">Urban Operations</Link>
          <nav className="ml-auto flex items-center gap-4 overflow-x-auto text-sm">
            <Link href="/urban" className="shrink-0 text-stone-600 hover:text-stone-900">Today</Link>
            <Link href="/urban/efforts" className="shrink-0 text-stone-600 hover:text-stone-900">Efforts</Link>
            {team && <Link href="/urban/team" className="shrink-0 text-stone-600 hover:text-stone-900">Team</Link>}
            {numbers && <Link href="/urban/numbers" className="shrink-0 text-stone-600 hover:text-stone-900">Numbers</Link>}
            {admin && <Link href="/urban/admin/programmes" className="shrink-0 text-stone-600 hover:text-stone-900">Programmes</Link>}
            {admin && <Link href="/urban/admin/people" className="shrink-0 text-stone-600 hover:text-stone-900">People &amp; places</Link>}
            <span className="hidden shrink-0 text-xs text-stone-400 sm:inline">{actor.name} · {ROLE_LABEL[actor.role]}</span>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
