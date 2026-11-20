import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor, can } from "@/lib/urban/access";
import { loadTeam, STUCK_DAYS } from "@/lib/urban/team";
import { formatDay, relativeDue, todayIST } from "@/lib/urban/time";
import { Card, PageTitle } from "../_ui";

export const dynamic = "force-dynamic";

// Team (spec §7): exceptions only, for the people under me. Each line opens the effort.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const actor = await requireActor();
  if (!(await can(actor, "team.view"))) redirect("/urban");
  const { person } = await searchParams;
  const t = await loadTeam(actor, person ?? null);
  const today = todayIST();
  const total = t.stuck.length + t.missed.length + t.followups.us.length + t.followups.partner.length + t.reschedules.length + t.failing.length;
  const who = person ? t.people.find((p) => p.id === person)?.name : null;

  return (
    <div className="space-y-6">
      <PageTitle title="Team" sub={`${who ? `${who} · ` : ""}${t.effortCount} open effort${t.effortCount === 1 ? "" : "s"} · ${total} exception${total === 1 ? "" : "s"}`} />

      {t.people.length > 1 && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          <Chip href="/urban/team" on={!person}>Everyone</Chip>
          {t.people.map((p) => (
            <Chip key={p.id} href={`/urban/team?person=${p.id}`} on={person === p.id}>
              {p.name}{!person && p.exceptions > 0 ? <span className="ml-1 text-red-600">{p.exceptions}</span> : null}
            </Chip>
          ))}
        </div>
      )}

      {total === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-800">Nothing needs you. Setup is moving, routines are on time and no follow-up is overdue.</div>
      )}

      {t.failing.length > 0 && (
        <Block title="Non-negotiables failing" count={t.failing.length} tone="red">
          {t.failing.map((f) => (
            <Line key={`${f.id}:${f.rating}`} href={`/urban/efforts/${f.id}`} title={f.title} meta={`${f.owner} · ${f.rating} · ${formatDay(f.on, today)}`}>
              <ul className="mt-1 space-y-0.5">
                {f.points.map((p) => (
                  <li key={p.text} className="text-xs text-red-700">✕ {p.text} <span className="text-stone-400">· {p.followupOpen ? "fix open" : "fix closed — re-check"}</span></li>
                ))}
              </ul>
            </Line>
          ))}
        </Block>
      )}

      {t.stuck.length > 0 && (
        <Block title="Stuck in setup" count={t.stuck.length} tone="amber" note={`next required item overdue, or nothing closed in ${STUCK_DAYS} days`}>
          {t.stuck.map((s) => (
            <Line key={s.id} href={`/urban/efforts/${s.id}`} title={s.title} meta={`${s.owner} · ${s.programme}`}
              right={s.why === "overdue" && s.itemDue ? <span className="text-red-600">{relativeDue(s.itemDue, today)}</span> : <span>{s.idleDays} days idle</span>}>
              {s.item && <p className="mt-0.5 text-xs text-stone-600">Next: {s.item}</p>}
            </Line>
          ))}
        </Block>
      )}

      {t.missed.length > 0 && (
        <Block title="Routines missed" count={t.missed.length} tone="amber" note="periods that ended with no closed session">
          {t.missed.map((m) => (
            <Line key={`${m.id}:${m.routine}`} href={`/urban/efforts/${m.id}`} title={m.title} meta={`${m.owner} · ${m.routine}`}
              right={<span className="text-red-600">missed {m.periods.length} of {m.of}</span>}>
              <p className="mt-0.5 text-xs text-stone-500">{m.periods.join(", ")}</p>
            </Line>
          ))}
        </Block>
      )}

      {(t.followups.us.length > 0 || t.followups.partner.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          <FollowupBlock title="Overdue follow-ups · ours" rows={t.followups.us} today={today} />
          <FollowupBlock title="Overdue follow-ups · partner" rows={t.followups.partner} today={today} />
        </div>
      )}

      {t.reschedules.length > 0 && (
        <Block title="Moved again and again" count={t.reschedules.length} note="open items rescheduled twice or more">
          {t.reschedules.map((r) => (
            <Line key={r.taskId} href={`/urban/efforts/${r.id}`} title={r.task} meta={`${r.owner} · ${r.title}`}
              right={<span>{r.times}× {r.due ? `· ${formatDay(r.due, today)}` : ""}</span>} />
          ))}
        </Block>
      )}
    </div>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${on ? "bg-stone-900 text-white ring-stone-900" : "bg-white text-stone-600 ring-stone-200 hover:ring-stone-400"}`}>{children}</Link>;
}

function Block({ title, count, tone, note, children }: { title: string; count: number; tone?: "red" | "amber"; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-700" : "text-stone-500"}`}>
        {title} · {count}{note && <span className="ml-2 font-normal normal-case tracking-normal text-stone-400">{note}</span>}
      </h2>
      <Card className="divide-y divide-stone-100">{children}</Card>
    </section>
  );
}

function Line({ href, title, meta, right, children }: { href: string; title: string; meta: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-start gap-3 px-4 py-2.5 hover:bg-stone-50">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-stone-800">{title}</p>
        <p className="truncate text-xs text-stone-500">{meta}</p>
        {children}
      </div>
      {right && <span className="shrink-0 text-xs text-stone-500">{right}</span>}
    </Link>
  );
}

function FollowupBlock({ title, rows, today }: { title: string; rows: { taskId: string; id: string; title: string; owner: string; due: string; daysOver: number; programme: string }[]; today: string }) {
  if (!rows.length) return <section><h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">{title} · 0</h2><Card className="px-4 py-3 text-sm text-stone-400">None overdue.</Card></section>;
  return (
    <Block title={title} count={rows.length} tone="red">
      {rows.map((r) => (
        <Line key={r.taskId} href={`/urban/efforts/${r.id}`} title={r.title} meta={`${r.owner} · ${r.programme}`} right={<span className="text-red-600">{relativeDue(r.due, today)}</span>} />
      ))}
    </Block>
  );
}
