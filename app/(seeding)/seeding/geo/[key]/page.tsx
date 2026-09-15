import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { computeTargets, pct, trackBand } from "@/lib/seeding/funnel";
import { ownerIsGeoScoped, seedingRoleLabel } from "@/lib/seeding/roles";
import { ProgressBar, StatusChip, Chip } from "../../_components/bits";
import { weekLabel } from "@/lib/seeding/weeks";
import { CHANNEL_KIND_META, CHANNEL_STAGE_META, SESSION_KIND_META, SESSION_STATUS_META } from "@/lib/seeding/outreach";

const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

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
      include: {
        funnel: true,
        members: { include: { user: { select: { name: true, email: true } } } },
        subGeos: {
          where: { archivedAt: null },
          orderBy: { sortOrder: "asc" },
          include: { _count: { select: { channels: true, sessions: true } } },
        },
      },
    }),
    prisma.seedingTask.findMany({ include: { workstream: true }, orderBy: { dueWeek: "asc" } }),
  ]);
  if (!geo) notFound();

  // Outreach for this geo: the channels doing the most work, and what's recent.
  const [topChannels, recentSessions, channelTotal] = await Promise.all([
    prisma.seedingChannel.findMany({
      where: { geoId: geo.id, archivedAt: null },
      orderBy: [{ reachToDate: "desc" }, { name: "asc" }],
      take: 10,
      select: { id: true, name: true, kind: true, stage: true, sessionsHeld: true, reachToDate: true },
    }),
    prisma.seedingSession.findMany({
      where: { geoId: geo.id, archivedAt: null },
      orderBy: [{ scheduledAt: "desc" }],
      take: 8,
      include: { channel: { select: { name: true } } },
    }),
    prisma.seedingChannel.count({ where: { geoId: geo.id, archivedAt: null } }),
  ]);

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
      <div className="flex flex-wrap items-center gap-4">
        <Link href={`/seeding/outreach/sessions?geo=${geo.id}`} className="text-xs text-sky-600 hover:underline">Log outreach →</Link>
        <Link href="/seeding/funnel" className="text-xs text-stone-400 hover:text-stone-600">Funnel →</Link>
      </div>

      {/* Sub-geographies */}
      {geo.subGeos.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-2">Sub-geographies</div>
          <div className="flex flex-wrap gap-2">
            {geo.subGeos.map((s) => (
              <span key={s.id} className="text-[11px] px-2 py-1 rounded-full bg-stone-100 text-stone-600">
                {s.label} · {s._count.channels} channel{s._count.channels === 1 ? "" : "s"} · {s._count.sessions} session{s._count.sessions === 1 ? "" : "s"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Outreach channels */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700 flex items-baseline justify-between">
          <span>Outreach channels ({channelTotal})</span>
          <Link href={`/seeding/outreach/channels?geo=${geo.id}`} className="text-xs font-normal text-sky-600 hover:underline">Open directory →</Link>
        </div>
        <div className="divide-y divide-stone-100">
          {topChannels.length === 0 && (
            <div className="px-4 py-6 text-sm text-stone-400 text-center">
              No channels yet. The directory is where institutions, alumni networks, partners and forums live.
            </div>
          )}
          {topChannels.map((c) => (
            <div key={c.id} className="px-4 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-800 truncate">{c.name}</div>
                <div className="text-[11px] text-stone-400">
                  {CHANNEL_KIND_META[c.kind].label}
                  {c.sessionsHeld > 0 ? ` · ${c.sessionsHeld} session${c.sessionsHeld === 1 ? "" : "s"} · ${nf(c.reachToDate)} reached` : ""}
                </div>
              </div>
              <Chip meta={CHANNEL_STAGE_META[c.stage]} />
            </div>
          ))}
        </div>
      </div>

      {/* Recent sessions */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700 flex items-baseline justify-between">
          <span>Recent sessions</span>
          <Link href={`/seeding/outreach/sessions?geo=${geo.id}`} className="text-xs font-normal text-sky-600 hover:underline">Log a session →</Link>
        </div>
        <div className="divide-y divide-stone-100">
          {recentSessions.length === 0 && (
            <div className="px-4 py-6 text-sm text-stone-400 text-center">Nothing logged yet — this is where the reach number comes from.</div>
          )}
          {recentSessions.map((s) => (
            <div key={s.id} className="px-4 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-800 truncate">{s.title}</div>
                <div className="text-[11px] text-stone-400 truncate">
                  {SESSION_KIND_META[s.kind].label}{s.channel ? ` · ${s.channel.name}` : ""} · {fmtDate(s.scheduledAt)}
                  {s.status === "held" ? ` · ${nf(s.reachCount)} reached, ${nf(s.leadsCaptured)} leads` : ""}
                </div>
              </div>
              <Chip meta={SESSION_STATUS_META[s.status]} />
            </div>
          ))}
        </div>
      </div>

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
