import prisma from "@/lib/prisma";
import { STATUS_META } from "../_lib/status";
import { weekToDate, fmtDate } from "@/lib/seeding/weeks";

const PX = 30; // px per week
const LABEL_W = 220;

export default async function TimelinePage() {
  const [config, workstreams] = await Promise.all([
    prisma.seedingConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingWorkstream.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: "asc" },
      include: { tasks: { orderBy: [{ startWeek: "asc" }, { sortOrder: "asc" }] } },
    }),
  ]);
  const week0 = config?.week0Date ?? new Date("2026-06-22T00:00:00Z");
  const launchWeek = config?.launchWeek ?? 14;

  const allWeeks = workstreams.flatMap((w) => w.tasks.flatMap((t) => [t.startWeek ?? 0, t.dueWeek ?? 0]));
  const maxWeek = Math.max(launchWeek, ...allWeeks, 1) + 1;
  const trackW = (maxWeek + 1) * PX;
  const ticks = Array.from({ length: maxWeek + 1 }, (_, i) => i);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Timeline</h1>
        <p className="text-sm text-stone-500 mt-0.5">Every task as a weekly bar. Week 0 = {fmtDate(week0)}. The blue line is launch (W{launchWeek}).</p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
        <div style={{ width: LABEL_W + trackW }}>
          {/* Week axis */}
          <div className="flex sticky top-0 bg-white border-b border-stone-100 z-10">
            <div style={{ width: LABEL_W }} className="shrink-0" />
            <div className="relative" style={{ width: trackW, height: 28 }}>
              {ticks.filter((w) => w % 2 === 0).map((w) => (
                <div key={w} className="absolute top-0 text-[10px] text-stone-400" style={{ left: w * PX }}>W{w}</div>
              ))}
              <div className="absolute top-0 bottom-0 border-l-2 border-sky-400" style={{ left: launchWeek * PX }} />
            </div>
          </div>

          {workstreams.map((w) => (
            <div key={w.id}>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 border-b border-stone-100">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: w.color }} />
                <span className="text-xs font-medium text-stone-600">{w.label}</span>
              </div>
              {w.tasks.map((t) => {
                const s = t.startWeek ?? t.dueWeek ?? 0;
                const e = t.dueWeek ?? t.startWeek ?? s;
                const left = Math.min(s, e) * PX;
                const width = Math.max(PX * 0.7, (Math.abs(e - s) + 1) * PX);
                return (
                  <div key={t.id} className="flex items-center border-b border-stone-50 hover:bg-stone-50/50">
                    <div style={{ width: LABEL_W }} className="shrink-0 px-3 py-1.5 text-[11px] text-stone-600 truncate" title={t.title}>{t.title}</div>
                    <div className="relative" style={{ width: trackW, height: 24 }}>
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full flex items-center"
                        style={{ left, width, backgroundColor: t.status === "done" ? "#10b981" : t.status === "blocked" ? "#f43f5e" : w.color, opacity: t.status === "not_started" ? 0.35 : 0.9 }}
                        title={`${t.title} · W${s}–W${e} · ${STATUS_META[t.status].label} · ${fmtDate(weekToDate(week0, s))}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
