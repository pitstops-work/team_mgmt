import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess, canSeeLeads } from "@/lib/seeding/access";
import { computeTargets, pct, trackBand } from "@/lib/seeding/funnel";
import {
  CHANNEL_STAGE_META, CHANNEL_KIND_META, SESSION_STATUS_META,
  CHANNEL_KIND_ORDER, ACTIVE_STAGES, CENTRAL_LABEL,
} from "@/lib/seeding/outreach";
import type { SeedingChannelStage } from "@/app/generated/prisma/client";
import { ProgressBar, Stat } from "../_components/bits";

const nf = (n: number) => n.toLocaleString("en-IN");
const trackColor = { ontrack: "bg-emerald-500", warn: "bg-amber-500", behind: "bg-rose-500" } as const;
const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default async function OutreachOverview() {
  const session = await auth();
  const access = await getSeedingAccess(session);

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 864e5);

  const [funnelCfg, geos, stageGroups, kindGroups, sessionAgg, upcoming, needsAction, recent, leadCount] =
    await Promise.all([
      prisma.seedingFunnelConfig.findUnique({ where: { id: 1 } }),
      prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" }, include: { funnel: true } }),
      prisma.seedingChannel.groupBy({ by: ["geoId", "stage"], where: { archivedAt: null }, _count: true }),
      prisma.seedingChannel.groupBy({ by: ["kind"], where: { archivedAt: null }, _count: true }),
      prisma.seedingSession.groupBy({
        by: ["geoId", "status"],
        where: { archivedAt: null },
        _count: true,
        _sum: { reachCount: true, leadsCaptured: true },
      }),
      prisma.seedingSession.findMany({
        where: { archivedAt: null, status: "planned", scheduledAt: { lte: weekAhead } },
        orderBy: { scheduledAt: "asc" },
        take: 12,
        include: { channel: { select: { name: true } }, geo: { select: { label: true } } },
      }),
      prisma.seedingChannel.findMany({
        where: { archivedAt: null, nextActionAt: { lte: now }, stage: { notIn: ["active", "dropped"] } },
        orderBy: { nextActionAt: "asc" },
        take: 10,
        include: { geo: { select: { label: true } } },
      }),
      prisma.seedingSession.findMany({
        where: { archivedAt: null, status: "held" },
        orderBy: { heldAt: "desc" },
        take: 8,
        include: { channel: { select: { name: true } }, geo: { select: { label: true } } },
      }),
      prisma.seedingLead.count({ where: { archivedAt: null } }),
    ]);

  const targets = funnelCfg ? computeTargets(funnelCfg, geos.length) : null;

  const stageTotal = (stage: SeedingChannelStage) =>
    stageGroups.filter((g) => g.stage === stage).reduce((n, g) => n + g._count, 0);
  const channelsActive = ACTIVE_STAGES.reduce((n, s) => n + stageTotal(s), 0);
  const channelsFound = stageGroups.filter((g) => g.stage !== "dropped").reduce((n, g) => n + g._count, 0);
  const sessionsHeld = sessionAgg.filter((g) => g.status === "held").reduce((n, g) => n + g._count, 0);
  const sessionsPlanned = sessionAgg.filter((g) => g.status === "planned").reduce((n, g) => n + g._count, 0);
  const reachLogged = sessionAgg.filter((g) => g.status === "held").reduce((n, g) => n + (g._sum.reachCount ?? 0), 0);
  const leadsLogged = sessionAgg.filter((g) => g.status === "held").reduce((n, g) => n + (g._sum.leadsCaptured ?? 0), 0);

  const bands = targets
    ? [
        { label: "Channels found", actual: channelsFound, target: targets.channelsToIdentify, href: "/seeding/outreach/channels" },
        { label: "Channels active", actual: channelsActive, target: targets.activeChannelsNeeded, href: "/seeding/outreach/channels?stage=active" },
        { label: "Sessions held", actual: sessionsHeld, target: targets.sessionsNeeded, href: "/seeding/outreach/sessions?status=held" },
        { label: "People reached", actual: reachLogged, target: targets.peopleToReach, href: "/seeding/funnel" },
        { label: "Leads captured", actual: leadsLogged, target: targets.leadsToCapture, href: "/seeding/funnel" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Outreach</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            The engine under the funnel. Build a directory of channels, run sessions against them, and the funnel&apos;s
            reach and lead numbers follow — nothing is typed by hand.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link href="/seeding/outreach/channels" className="text-sky-600 hover:underline">Channels</Link>
          <Link href="/seeding/outreach/sessions" className="text-sky-600 hover:underline">Sessions</Link>
          <Link href="/seeding/outreach/leads" className="text-sky-600 hover:underline">Leads ({nf(leadCount)})</Link>
        </div>
      </div>

      {/* The chain */}
      {targets && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-3">Channels → sessions → reach → leads</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {bands.map((b) => {
              const p = pct(b.actual, b.target);
              return (
                <Link key={b.label} href={b.href} className="block group">
                  <div className="text-xs text-stone-500 group-hover:text-stone-700">{b.label}</div>
                  <div className="text-lg font-semibold tabular-nums text-stone-900">{nf(b.actual)}</div>
                  <div className="text-[11px] text-stone-400">of {nf(b.target)} · {p}%</div>
                  <div className="mt-1"><ProgressBar pct={p} color={trackColor[trackBand(p)]} /></div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-geo */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">By geography</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-[11px] uppercase tracking-wide text-stone-400">
              {["Geography", "Channels", "Active", "Sessions held", "Planned", "Reached", "Leads"].map((h, i) => (
                <th key={h} className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {geos.map((g) => {
                const mine = stageGroups.filter((s) => s.geoId === g.id);
                const total = mine.filter((s) => s.stage !== "dropped").reduce((n, s) => n + s._count, 0);
                const active = mine.filter((s) => ACTIVE_STAGES.includes(s.stage)).reduce((n, s) => n + s._count, 0);
                return (
                  <tr key={g.id} className="border-t border-stone-100">
                    <td className="px-3 py-2 text-sm text-stone-700">
                      <Link href={`/seeding/outreach/channels?geo=${g.id}`} className="hover:underline">{g.label}</Link>
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-800">{nf(total)}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-800">{nf(active)}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-800">{nf(g.funnel?.sessionsHeld ?? 0)}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{nf(g.funnel?.sessionsPlanned ?? 0)}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-800">{nf(g.funnel?.reachToDate ?? 0)}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-800">{nf(g.funnel?.leadsToDate ?? 0)}</td>
                  </tr>
                );
              })}
              {(() => {
                const central = stageGroups.filter((s) => s.geoId === null);
                const centralSessions = sessionAgg.filter((s) => s.geoId === null);
                if (central.length === 0 && centralSessions.length === 0) return null;
                const held = centralSessions.filter((s) => s.status === "held");
                return (
                  <tr className="border-t border-stone-100 bg-stone-50/60">
                    <td className="px-3 py-2 text-sm text-stone-500 italic">{CENTRAL_LABEL}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-600">{nf(central.filter((s) => s.stage !== "dropped").reduce((n, s) => n + s._count, 0))}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-600">{nf(central.filter((s) => ACTIVE_STAGES.includes(s.stage)).reduce((n, s) => n + s._count, 0))}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-600">{nf(held.reduce((n, s) => n + s._count, 0))}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{nf(centralSessions.filter((s) => s.status === "planned").reduce((n, s) => n + s._count, 0))}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-600">{nf(held.reduce((n, s) => n + (s._sum.reachCount ?? 0), 0))}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-600">{nf(held.reduce((n, s) => n + (s._sum.leadsCaptured ?? 0), 0))}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stage + kind mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-3">Where the directory sits</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CHANNEL_STAGE_META) as SeedingChannelStage[]).map((s) => (
              <Link key={s} href={`/seeding/outreach/channels?stage=${s}`}
                className={`text-[11px] px-2 py-1 rounded-full ${CHANNEL_STAGE_META[s].chip}`}>
                {CHANNEL_STAGE_META[s].label} · {stageTotal(s)}
              </Link>
            ))}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-stone-400 mt-4 mb-2">What kind</div>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_KIND_ORDER.map((k) => (
              <Link key={k} href={`/seeding/outreach/channels?kind=${k}`}
                className={`text-[11px] px-2 py-1 rounded-full ${CHANNEL_KIND_META[k].chip}`}>
                {CHANNEL_KIND_META[k].label} · {kindGroups.find((g) => g.kind === k)?._count ?? 0}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-3">This fortnight</div>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Held" value={nf(sessionsHeld)} sub="sessions to date" />
            <Stat label="Planned" value={nf(sessionsPlanned)} sub="on the calendar" tone="sky" />
            <Stat label="Named leads" value={canSeeLeads(access) ? nf(leadCount) : "—"} sub={canSeeLeads(access) ? "on the register" : "team only"} />
          </div>
        </div>
      </div>

      {/* Work queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">
            Coming up ({upcoming.length})
          </div>
          <div className="divide-y divide-stone-100 max-h-72 overflow-auto">
            {upcoming.length === 0 && <div className="px-4 py-6 text-sm text-stone-400 text-center">Nothing scheduled in the next week.</div>}
            {upcoming.map((s) => {
              const overdue = s.scheduledAt < now;
              return (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-800 truncate">{s.title}</div>
                    <div className="text-[11px] text-stone-400 truncate">
                      {s.geo?.label ?? CENTRAL_LABEL}{s.channel ? ` · ${s.channel.name}` : ""} · {fmtDate(s.scheduledAt)}
                    </div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${overdue ? "bg-amber-100 text-amber-700" : SESSION_STATUS_META.planned.chip}`}>
                    {overdue ? "Overdue" : "Planned"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 border-t border-stone-100">
            <Link href="/seeding/outreach/sessions?status=planned" className="text-xs text-sky-600 hover:underline">All planned sessions →</Link>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">
            Channels waiting on us ({needsAction.length})
          </div>
          <div className="divide-y divide-stone-100 max-h-72 overflow-auto">
            {needsAction.length === 0 && <div className="px-4 py-6 text-sm text-stone-400 text-center">Nothing chasing. Set a next action on a channel to see it here.</div>}
            {needsAction.map((c) => (
              <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-stone-800 truncate">{c.name}</div>
                  <div className="text-[11px] text-stone-400 truncate">
                    {c.geo?.label ?? CENTRAL_LABEL} · {CHANNEL_KIND_META[c.kind].label}
                    {c.nextActionAt ? ` · due ${fmtDate(c.nextActionAt)}` : ""}
                  </div>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${CHANNEL_STAGE_META[c.stage].chip}`}>{CHANNEL_STAGE_META[c.stage].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">Recently held</div>
        <div className="divide-y divide-stone-100">
          {recent.length === 0 && <div className="px-4 py-6 text-sm text-stone-400 text-center">No sessions logged yet.</div>}
          {recent.map((s) => (
            <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-800 truncate">{s.title}</div>
                <div className="text-[11px] text-stone-400 truncate">
                  {s.geo?.label ?? CENTRAL_LABEL}{s.channel ? ` · ${s.channel.name}` : ""}
                  {s.heldAt ? ` · ${fmtDate(s.heldAt)}` : ""}
                </div>
              </div>
              <div className="text-[11px] text-stone-500 tabular-nums shrink-0">
                {nf(s.reachCount)} reached · {nf(s.leadsCaptured)} leads
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
