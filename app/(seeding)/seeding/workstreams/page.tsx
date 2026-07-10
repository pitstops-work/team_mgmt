import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import { ProgressBar } from "../_components/bits";
import WorkstreamManager from "./WorkstreamManager";

export default async function WorkstreamsIndex() {
  const session = await auth();
  const access = await getSeedingAccess(session);

  const [workstreams, statusRows] = await Promise.all([
    prisma.seedingWorkstream.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    prisma.seedingTask.groupBy({ by: ["workstreamId", "status"], _count: true }),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const r of statusRows) {
    const m = counts.get(r.workstreamId) ?? {};
    m[r.status] = r._count;
    counts.set(r.workstreamId, m);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Checklist</h1>
        <p className="text-sm text-stone-500 mt-0.5">Every sub-task, grouped by workstream and phase. Open a workstream to update status or add tasks.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {workstreams.map((w) => {
          const c = counts.get(w.id) ?? {};
          const total = (c.not_started ?? 0) + (c.in_progress ?? 0) + (c.blocked ?? 0) + (c.done ?? 0);
          const pct = total ? Math.round(((c.done ?? 0) / total) * 100) : 0;
          return (
            <Link key={w.id} href={`/seeding/workstream/${w.key}`} className="rounded-xl border border-stone-200 bg-white p-4 hover:border-sky-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                <span className="text-sm font-medium text-stone-900 flex-1 truncate">{w.label}</span>
                <span className="text-sm font-semibold tabular-nums text-stone-900">{pct}%</span>
              </div>
              <div className="mt-3"><ProgressBar pct={pct} hex={w.color} /></div>
              <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-stone-400">
                <span>{c.done ?? 0}/{total} done</span>
                {(c.in_progress ?? 0) > 0 && <span className="text-sky-600">{c.in_progress} in progress</span>}
                {(c.blocked ?? 0) > 0 && <span className="text-rose-600">{c.blocked} blocked</span>}
              </div>
            </Link>
          );
        })}
      </div>

      {access.canManageStructure && (
        <WorkstreamManager workstreams={workstreams.map((w) => ({ id: w.id, key: w.key, label: w.label, color: w.color, hasTasks: (counts.get(w.id)?.done ?? 0) + (counts.get(w.id)?.not_started ?? 0) + (counts.get(w.id)?.in_progress ?? 0) + (counts.get(w.id)?.blocked ?? 0) > 0 }))} />
      )}
    </div>
  );
}
