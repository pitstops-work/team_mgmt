import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireActor } from "@/lib/urban/access";
import { loadToday, type TodayItem, type TodayRoutine } from "@/lib/urban/queries";
import { CHECK_LABEL, type CheckType } from "@/lib/urban/settings";
import { formatDay, relativeDue, todayIST } from "@/lib/urban/time";
import { Card, Empty, PageTitle } from "./_ui";

export const dynamic = "force-dynamic";

const MODE: Record<string, string> = { visit: "Visit", meeting: "Meeting", call: "Call" };

// Today (spec §7): one list of MY work — overdue first, then today, then this
// week; routines due this period; and what's waiting on partners. Rescheduled
// items stay here (rule R7); they just carry their new date.
export default async function TodayPage() {
  const actor = await requireActor();
  const today = todayIST();
  const [t, effortCount] = await Promise.all([loadToday(actor), prisma.uoEffort.count({ where: { ownerId: actor.id, closedAt: null } })]);
  const nothing = !t.overdue.length && !t.today.length && !t.week.length && !t.routines.length && !t.partner.length;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Today"
        sub={`${formatDay(today, today)} · ${effortCount} effort${effortCount === 1 ? "" : "s"} you own`}
        action={<Link href="/urban/efforts" className="text-sm font-medium text-stone-600 hover:text-stone-900">All efforts →</Link>}
      />

      {nothing && <Empty>Nothing due this week.{effortCount === 0 ? " You don't own any efforts yet." : ""}</Empty>}

      {t.overdue.length > 0 && <Section title="Overdue" tone="red" items={t.overdue} today={today} />}

      {t.routines.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Due this period · {t.routines.length}</h2>
          <Card className="divide-y divide-stone-100">
            {t.routines.map((r) => <RoutineLine key={`${r.effortId}:${r.routineKey}`} r={r} today={today} />)}
          </Card>
        </section>
      )}

      {t.today.length > 0 && <Section title="Today" items={t.today} today={today} />}
      {t.week.length > 0 && <Section title="This week" items={t.week} today={today} />}
      {t.partner.length > 0 && <Section title="Waiting on partner" items={t.partner} today={today} muted />}
    </div>
  );
}

function Section({ title, items, today, tone, muted }: { title: string; items: TodayItem[]; today: string; tone?: "red"; muted?: boolean }) {
  return (
    <section>
      <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${tone === "red" ? "text-red-600" : "text-stone-400"}`}>{title} · {items.length}</h2>
      <Card className="divide-y divide-stone-100">
        {items.map((i) => (
          <Link key={i.id} href={`/urban/efforts/${i.effort.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-stone-50">
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${muted ? "text-stone-600" : "text-stone-800"}`}>{i.title}</p>
              <p className="mt-0.5 truncate text-xs text-stone-500">
                {i.effort.title} · {i.kind === "followup" ? "follow-up" : i.phase ?? "setup"} · {CHECK_LABEL[i.checkType as CheckType] ?? i.checkType}
              </p>
            </div>
            {i.due && <span className={`shrink-0 text-xs ${tone === "red" ? "font-medium text-red-600" : "text-stone-500"}`}>{relativeDue(i.due, today)}</span>}
          </Link>
        ))}
      </Card>
    </section>
  );
}

function RoutineLine({ r, today }: { r: TodayRoutine; today: string }) {
  return (
    <Link href={r.sessionId ? `/urban/efforts/${r.effortId}/sessions/${r.sessionId}` : `/urban/efforts/${r.effortId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-stone-800">{r.name}</p>
        <p className="truncate text-xs text-stone-500">{r.effortTitle} · {MODE[r.mode] ?? r.mode}</p>
      </div>
      <span className="shrink-0 text-xs text-stone-500">{r.sessionId ? `in progress · ${r.open} open` : `by ${formatDay(r.periodEnd, today)}`}</span>
    </Link>
  );
}
