import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { computeTargets, pct, trackBand } from "@/lib/seeding/funnel";
import { ownerIsGeoScoped, seedingRoleLabel } from "@/lib/seeding/roles";
import { ProgressBar, StatusChip } from "../../_components/bits";
import { weekLabel } from "@/lib/seeding/weeks";

const trackColor = { ontrack: "bg-emerald-500", warn: "bg-amber-500", behind: "bg-rose-500" } as const;
const nf = (n: number) => n.toLocaleString("en-IN");

export default async function GeoDetail({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [config, funnelCfg, geoCount, geo, tasks] = await Promise.all([
    prisma.seedingConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingFunnelConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingGeo.count(),
    prisma.seedingGeo.findUnique({
      where: { key: decodeURIComponent(key) },
      include: { funnel: true, members: { include: { user: { select: { name: true, email: true } } } } },
    }),
    prisma.seedingTask.findMany({ include: { workstream: true }, orderBy: { dueWeek: "asc" } }),
  ]);
  if (!geo) notFound();

  const week0 = config?.week0Date ?? new Date("2026-06-22T00:00:00Z");
  const targets = funnelCfg ? computeTargets(funnelCfg, geoCount) : null;
  const f = geo.funnel;
  const geoTasks = tasks.filter((t) => ownerIsGeoScoped(t.ownerRole));

  const funnelRows = targets ? [
    { label: "People reached", actual: f?.reachToDate ?? 0, target: targets.perGeo.reachTarget },
    { label: "Leads captured", actual: f?.leadsToDate ?? 0, target: targets.perGeo.leadTarget },
    { label: "Applications", actual: f?.appsReceived ?? 0, target: targets.perGeo.appFloor },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/seeding/geo" className="text-xs text-stone-400 hover:text-stone-600">← All geographies</Link>
        <h1 className="text-xl font-semibold text-stone-900 mt-1">{geo.label}</h1>
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {funnelRows.map((r) => {
          const p = pct(r.actual, r.target);
          return (
            <div key={r.label} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="text-xs text-stone-500">{r.label}</div>
              <div className="text-2xl font-semibold tabular-nums text-stone-900 mt-1">{nf(r.actual)}</div>
              <div className="text-[11px] text-stone-400">of {nf(r.target)} · {p}%</div>
              <div className="mt-2"><ProgressBar pct={p} color={trackColor[trackBand(p)]} /></div>
            </div>
          );
        })}
      </div>
      <div><Link href="/seeding/funnel" className="text-xs text-sky-600 hover:underline">Edit actuals in the funnel →</Link></div>

      {/* Team */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">Geo team ({geo.members.length})</div>
        <div className="divide-y divide-stone-100">
          {geo.members.length === 0 && <div className="px-4 py-6 text-sm text-stone-400 text-center">No one assigned to this geo yet.</div>}
          {geo.members.map((m) => (
            <div key={m.id} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-stone-800">{m.user.name ?? m.user.email}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{seedingRoleLabel(m.role)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Geo-scoped tasks (checklist items owned by geo roles — shared across geos) */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">Geo-owned tasks ({geoTasks.length})</div>
        <p className="px-4 pt-2 text-[11px] text-stone-400">Checklist tasks owned by geo roles (Geo POC, Coordinator…). Shared across geos — edit on the workstream page.</p>
        <div className="divide-y divide-stone-100 mt-1">
          {geoTasks.map((t) => (
            <div key={t.id} className="px-4 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-800 truncate">{t.title}</div>
                <div className="text-[11px] text-stone-400"><a href={`/seeding/workstream/${t.workstream.key}`} className="hover:underline">{t.workstream.label}</a> · {t.ownerRole} · due {weekLabel(week0, t.dueWeek)}</div>
              </div>
              <StatusChip status={t.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
