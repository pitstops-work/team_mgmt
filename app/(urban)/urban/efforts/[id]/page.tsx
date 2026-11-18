import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/urban/access";
import { loadEffort, type TaskView } from "@/lib/urban/queries";
import { formatDay, relativeDue, todayIST, isOverdue } from "@/lib/urban/time";
import { Card, CheckChip, PhaseChip } from "../../_ui";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  created: "created the effort",
  added_by_programme: "— a setup item was added by a programme change",
  updated_by_programme: "— a setup item changed with the programme",
  skipped: "— a setup item was skipped",
};

export default async function EffortPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const e = await loadEffort(actor, id);
  if (!e) notFound();
  const today = todayIST();

  const phases = new Map<string, TaskView[]>();
  for (const t of e.setup) phases.set(t.phase ?? "Setup", [...(phases.get(t.phase ?? "Setup") ?? []), t]);
  const routines = e.programme.settings?.routines ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/urban" className="text-xs text-stone-400 hover:text-stone-700">← Efforts</Link>
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
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        <Stat label="Setup" value={`${e.status.setupClosed}/${e.status.setupTotal}`} />
        <Stat label="Overdue" value={String(e.status.overdue)} tone={e.status.overdue ? "red" : undefined} />
        <Stat label="Follow-ups" value={String(e.status.followupsOpen)} />
      </div>

      {e.setup.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-800">Setup</h2>
          <div className="space-y-3">
            {[...phases.entries()].map(([phase, tasks]) => {
              const closed = tasks.filter((t) => t.status !== "open").length;
              return (
                <Card key={phase}>
                  <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{phase}</span>
                    <span className="text-xs text-stone-400">{closed}/{tasks.length}</span>
                  </div>
                  <ul className="divide-y divide-stone-50">
                    {tasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${t.status === "done" ? "bg-emerald-500" : t.status === "skipped" ? "bg-stone-300" : isOverdue(t.due, today) ? "bg-red-500" : "border border-stone-300"}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${t.status === "open" ? "text-stone-800" : "text-stone-400 line-through"}`}>
                            {t.title}{!t.required && <span className="ml-1.5 text-[10px] text-stone-400">optional</span>}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                            <CheckChip type={t.checkType} />
                            {t.status === "open" && t.due && (
                              <span className={isOverdue(t.due, today) ? "font-medium text-red-600" : "text-stone-500"}>
                                {formatDay(t.due, today)} · {relativeDue(t.due, today)}{t.dueSource === "manual" ? " · rescheduled" : ""}
                              </span>
                            )}
                            {t.status === "skipped" && <span className="text-stone-400">skipped</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-stone-400">Completing setup tasks — tick, voice note, photo, rating, number, note — arrives in Phase 2.</p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-stone-800">Once running</h2>
        {routines.length ? (
          <Card className="divide-y divide-stone-100">
            {routines.map((r) => (
              <div key={r.key} className="px-4 py-2.5">
                <p className="text-sm text-stone-800">{r.name}</p>
                <p className="text-xs text-stone-500">{r.cadence} · {r.mode} · {r.items.length} items</p>
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-stone-500">No routine — this is a time-boxed drive that closes with a written review.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-stone-800">History</h2>
        <Card className="divide-y divide-stone-50">
          {e.events.map((ev) => (
            <p key={ev.id} className="px-4 py-2 text-xs text-stone-600">
              <span className="text-stone-400">{new Date(ev.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>{" "}
              {ev.actor} {ACTION_LABEL[ev.action] ?? `${ev.action} (${ev.entity})`}{ev.reason ? ` — ${ev.reason}` : ""}
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
