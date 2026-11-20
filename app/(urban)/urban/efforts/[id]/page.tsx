import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/urban/access";
import { loadEffort, type TaskView } from "@/lib/urban/queries";
import { formatDay, todayIST } from "@/lib/urban/time";
import { Card, PhaseChip } from "../../_ui";
import { TaskList, NewFollowupButton } from "../../_work/TaskList";
import { RoutineCard } from "../../_work/SessionControls";
import { eventLine } from "../../_work/eventLine";

export const dynamic = "force-dynamic";

export default async function EffortPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const e = await loadEffort(actor, id);
  if (!e) notFound();
  const today = todayIST();

  const phases = new Map<string, TaskView[]>();
  for (const t of e.setup) phases.set(t.phase ?? "Setup", [...(phases.get(t.phase ?? "Setup") ?? []), t]);
  const openFollowups = e.followups.filter((t) => t.status === "open");
  const closedFollowups = e.followups.filter((t) => t.status !== "open");
  const readOnly = !e.canWork;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/urban/efforts" className="text-xs text-stone-400 hover:text-stone-700">← Efforts</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">{e.title}</h1>
          <PhaseChip phase={e.status.phase} />
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {e.programme.name} · {e.placePath}
          {e.partner ? ` · ${e.partner.name}${e.partner.mis ? ` (${e.partner.mis})` : ""}` : " · spans partners"}
        </p>
        <p className="mt-0.5 text-xs text-stone-400">
          Owner {e.owner.name} · {e.startMode === "new" ? "new" : "already running"} · started {formatDay(e.startedOn, today)}
          {readOnly && " · view only"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        <Stat label="Setup" value={`${e.status.setupClosed}/${e.status.setupTotal}`} />
        <Stat label="Overdue" value={String(e.status.overdue)} tone={e.status.overdue ? "red" : undefined} />
        <Stat label="Follow-ups" value={String(e.status.followupsOpen)} />
      </div>

      {e.routines.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-800">This period</h2>
          <Card className="divide-y divide-stone-100">
            {e.routines.map((r) => <RoutineCard key={r.key} effortId={e.id} r={r} canWork={e.canWork} setupOpen={e.status.setupRequiredOpen} today={today} />)}
          </Card>
          {e.status.setupRequiredOpen > 0 && <p className="mt-1.5 text-xs text-stone-500">Routines start once the {e.status.setupRequiredOpen} required setup item{e.status.setupRequiredOpen === 1 ? " is" : "s are"} done or skipped.</p>}
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-800">Follow-ups <span className="font-normal text-stone-400">· {openFollowups.length} open{e.status.followupsPartner ? `, ${e.status.followupsPartner} with the partner` : ""}</span></h2>
          {e.canWork && <NewFollowupButton effortId={e.id} today={today} />}
        </div>
        <Card>
          <TaskList tasks={openFollowups} check={e.check} canWork={e.canWork} today={today} effortId={e.id} empty="Nothing to follow up." />
          {closedFollowups.length > 0 && (
            <details className="border-t border-stone-100">
              <summary className="cursor-pointer px-4 py-2 text-xs text-stone-500">{closedFollowups.length} closed</summary>
              <TaskList tasks={closedFollowups} check={e.check} canWork={e.canWork} today={today} effortId={e.id} />
            </details>
          )}
        </Card>
      </section>

      {e.setup.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-800">Setup</h2>
          <div className="space-y-3">
            {[...phases.entries()].map(([phase, tasks]) => {
              const closed = tasks.filter((t) => t.status !== "open").length;
              return (
                <Card key={phase}>
                  <details open={closed < tasks.length}>
                    <summary className="flex cursor-pointer items-center justify-between border-b border-stone-100 px-4 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{phase}</span>
                      <span className={`text-xs ${closed === tasks.length ? "text-emerald-600" : "text-stone-400"}`}>{closed}/{tasks.length}</span>
                    </summary>
                    <TaskList tasks={tasks} check={e.check} canWork={e.canWork} today={today} effortId={e.id} />
                  </details>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {e.readings.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-800">Figures <span className="font-normal text-stone-400">· latest, with change since the last entry — tap for history</span></h2>
          <Card className="divide-y divide-stone-50">
            {e.readings.map((r) => (
              <details key={`${r.key}|${r.dimension}`} className="group px-4 py-2 text-sm">
                <summary className={`flex items-baseline justify-between gap-3 ${r.history.length ? "cursor-pointer" : "pointer-events-none list-none"}`}>
                  <span className="text-stone-700">{r.label}{r.dimensionLabel ? <span className="text-stone-400"> · {r.dimensionLabel}</span> : null}</span>
                  <span className="shrink-0 tabular-nums text-stone-900">
                    {r.value}{r.unit ? ` ${r.unit}` : ""}
                    {r.history[0] && <span className={`ml-1 text-xs ${r.value >= r.history[0].value ? "text-emerald-600" : "text-red-600"}`}>{r.value >= r.history[0].value ? "+" : "−"}{Math.abs(Math.round((r.value - r.history[0].value) * 10) / 10)}</span>}
                    <span className="text-xs text-stone-400"> · {formatDay(r.asOf, today)}</span>
                  </span>
                </summary>
                {r.history.length > 0 && (
                  <ul className="mt-1 space-y-0.5 border-l border-stone-100 pl-3">
                    {r.history.map((h) => <li key={h.asOf} className="flex justify-between text-xs text-stone-500"><span>{formatDay(h.asOf, today)}</span><span className="tabular-nums">{h.value}</span></li>)}
                  </ul>
                )}
              </details>
            ))}
          </Card>
        </section>
      )}

      {e.pastSessions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-800">Past sessions</h2>
          <Card className="divide-y divide-stone-50">
            {e.pastSessions.map((s) => (
              <Link key={s.id} href={`/urban/efforts/${e.id}/sessions/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-stone-50">
                <span className="text-stone-700">{s.routine} <span className="text-stone-400">· {s.period}</span></span>
                <span className="text-xs text-stone-400">{s.early ? <span className="text-amber-700">closed early</span> : "complete"}</span>
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-stone-800">History</h2>
        <Card className="divide-y divide-stone-50">
          {e.events.map((ev) => (
            <p key={ev.id} className="px-4 py-2 text-xs text-stone-600">
              <span className="text-stone-400">{new Date(ev.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>{" "}
              {eventLine(ev)}
            </p>
          ))}
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <Card className="px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`text-lg font-semibold ${tone === "red" ? "text-red-600" : "text-stone-900"}`}>{value}</p>
    </Card>
  );
}
