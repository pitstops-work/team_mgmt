"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Calendar, User as UserIcon, MapPin, Target, TrendingUp } from "lucide-react";
import Avatar from "@/components/Avatar";
import type { LeaderActivityCreated } from "../_lib/types";
import { fmtDomain } from "../_lib/helpers";
import { EmptyState } from "../_shared/Primitives";

type Window = 7 | 30 | 90;
type GroupBy = "person" | "day" | "cluster" | "goal" | "domain";

const TYPE_STYLE: Record<string, string> = {
  Meeting: "bg-sky-100 text-sky-700",
  Visit:   "bg-violet-100 text-violet-700",
  Event:   "bg-amber-100 text-amber-700",
};

function ymd(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDayLabel(yyyymmdd: string) {
  const d = new Date(yyyymmdd + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function LeaderActivityTab({ activities }: { activities: LeaderActivityCreated[] }) {
  const [windowDays, setWindowDays] = useState<Window>(30);
  const [groupBy, setGroupBy] = useState<GroupBy>("person");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const cutoff = useMemo(
    () => Date.now() - windowDays * 24 * 60 * 60 * 1000,
    [windowDays],
  );
  const inWindow = useMemo(
    () => activities.filter(a => new Date(a.createdAt).getTime() >= cutoff),
    [activities, cutoff],
  );

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const totalCount = inWindow.length;
  const uniqueCreators = new Set(inWindow.map(a => a.creator.id)).size;

  const byDayCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of inWindow) {
      const k = ymd(a.createdAt);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [inWindow]);
  const peakDay = useMemo(() => {
    let best: { day: string; n: number } | null = null;
    for (const [day, n] of byDayCount) {
      if (!best || n > best.n) best = { day, n };
    }
    return best;
  }, [byDayCount]);

  const byClusterCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of inWindow) {
      const k = a.goal?.needsCluster?.name ?? "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [inWindow]);
  const topCluster = useMemo(() => {
    let best: { name: string; n: number } | null = null;
    for (const [name, n] of byClusterCount) {
      if (name === "—") continue;
      if (!best || n > best.n) best = { name, n };
    }
    return best;
  }, [byClusterCount]);

  // ── Groups ────────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; sort: string; items: LeaderActivityCreated[] }>();
    for (const a of inWindow) {
      let key: string, label: string, sort: string;
      switch (groupBy) {
        case "person":
          key = a.creator.id;
          label = a.creator.name ?? "Unknown";
          sort = label.toLowerCase();
          break;
        case "day": {
          const k = ymd(a.createdAt);
          key = k;
          label = fmtDayLabel(k);
          // Sort by day descending — newest first reads naturally.
          sort = `￿${k}`.split("").reverse().join("");
          break;
        }
        case "cluster":
          key = a.goal?.needsCluster?.id ?? "_none";
          label = a.goal?.needsCluster?.name ?? "No cluster";
          sort = label.toLowerCase();
          break;
        case "goal":
          key = a.goal?.id ?? "_none";
          label = a.goal?.title ?? "No goal";
          sort = label.toLowerCase();
          break;
        case "domain":
          key = a.goal?.needsDomain ?? "_none";
          label = a.goal?.needsDomain ? fmtDomain(a.goal.needsDomain) : "No domain";
          sort = label.toLowerCase();
          break;
      }
      if (!m.has(key)) m.set(key, { key, label, sort, items: [] });
      m.get(key)!.items.push(a);
    }
    const arr = [...m.values()];
    // Day grouping: chronological newest→oldest. Others: by count desc, label asc.
    if (groupBy === "day") arr.sort((a, b) => b.key.localeCompare(a.key));
    else arr.sort((a, b) => b.items.length - a.items.length || a.sort.localeCompare(b.sort));
    return arr;
  }, [inWindow, groupBy]);

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header strip: window + group-by */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-stone-100 rounded-full p-0.5">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setWindowDays(d as Window)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                windowDays === d ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              Last {d}d
            </button>
          ))}
        </div>
        <select
          value={groupBy}
          onChange={e => { setGroupBy(e.target.value as GroupBy); setExpanded(new Set()); }}
          className="text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white text-stone-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
          aria-label="Group by"
        >
          <option value="person">Group: Person</option>
          <option value="day">Group: Day</option>
          <option value="cluster">Group: Cluster</option>
          <option value="goal">Group: Goal</option>
          <option value="domain">Group: Domain</option>
        </select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={TrendingUp} label="Created" value={totalCount.toString()} sub={`last ${windowDays}d`} />
        <KpiCard icon={UserIcon} label="Creators" value={uniqueCreators.toString()} sub="distinct" />
        <KpiCard
          icon={Calendar}
          label="Peak day"
          value={peakDay ? peakDay.n.toString() : "—"}
          sub={peakDay ? fmtDayLabel(peakDay.day) : ""}
        />
        <KpiCard
          icon={MapPin}
          label="Top cluster"
          value={topCluster ? topCluster.n.toString() : "—"}
          sub={topCluster?.name ?? ""}
        />
      </div>

      {/* Groups */}
      {totalCount === 0 ? (
        <EmptyState message={`No activities created in the last ${windowDays} days.`} />
      ) : (
        <div className="space-y-2">
          {groups.map(g => {
            const isOpen = expanded.has(g.key);
            const firstRow = g.items[0];
            const lastRow = g.items[g.items.length - 1];
            return (
              <div key={g.key} className="rounded-xl border border-stone-200 overflow-hidden">
                <button
                  onClick={() => toggle(g.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/70 transition-colors text-left"
                >
                  {/* Avatar for person-grouping; icon for everything else */}
                  {groupBy === "person" && firstRow ? (
                    <Avatar name={firstRow.creator.name} image={firstRow.creator.image} size="xs" />
                  ) : (
                    <GroupIcon kind={groupBy} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">{g.label}</p>
                    <p className="text-[11px] text-stone-400">
                      {g.items.length} {g.items.length === 1 ? "activity" : "activities"}
                      {firstRow && lastRow && (
                        <> · {fmtDateTime(lastRow.createdAt)} → {fmtDateTime(firstRow.createdAt)}</>
                      )}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                </button>
                {isOpen && (
                  <div className="divide-y divide-stone-100 bg-white">
                    {g.items.map(a => <Row key={a.auditId} row={a} hideField={groupBy} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-stone-200 px-4 py-3 bg-white">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <p className="text-xl font-semibold text-stone-900 mt-1 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-stone-400 mt-1 truncate">{sub}</p>}
    </div>
  );
}

function GroupIcon({ kind }: { kind: GroupBy }) {
  const cls = "w-5 h-5 p-1 rounded-full bg-stone-200 text-stone-500";
  switch (kind) {
    case "day":     return <Calendar className={cls} />;
    case "cluster": return <MapPin className={cls} />;
    case "goal":    return <Target className={cls} />;
    case "domain":  return <Target className={cls} />;
    default:        return <UserIcon className={cls} />;
  }
}

function Row({ row, hideField }: { row: LeaderActivityCreated; hideField: GroupBy }) {
  const cluster = row.goal?.needsCluster?.name ?? null;
  const settlement = row.goal?.needsSettlement?.name ?? null;
  const domain = row.goal?.needsDomain ? fmtDomain(row.goal.needsDomain) : null;
  // Inside the active grouping panel, hiding the redundant dimension keeps
  // rows scannable (e.g. inside "Adugodi" panel, no point repeating Adugodi
  // on every row).
  const showPerson  = hideField !== "person";
  const showCluster = hideField !== "cluster";
  const showGoal    = hideField !== "goal";
  const showDomain  = hideField !== "domain";

  const metaParts: string[] = [];
  if (showGoal && row.goal?.title)  metaParts.push(row.goal.title);
  if (showDomain && domain)         metaParts.push(domain);
  if (showCluster && cluster)       metaParts.push(cluster);
  if (settlement && settlement !== cluster) metaParts.push(settlement);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-stone-800 truncate">{row.title}</p>
          {row.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${TYPE_STYLE[row.type] ?? "bg-stone-100 text-stone-600"}`}>
              {row.type}
            </span>
          )}
        </div>
        <p className="text-[11px] text-stone-400 mt-0.5 flex items-center gap-1 flex-wrap">
          <span>Created {fmtDateTime(row.createdAt)}</span>
          <span className="text-stone-300">·</span>
          <span>Scheduled {fmtDateTime(row.scheduledAt)}</span>
          {showPerson && (
            <>
              <span className="text-stone-300">·</span>
              <span>by {row.creator.name ?? "Unknown"}</span>
            </>
          )}
        </p>
        {metaParts.length > 0 && (
          <p className="text-[11px] text-stone-400 truncate mt-0.5">{metaParts.join(" · ")}</p>
        )}
      </div>
      {row.goal?.id && (
        <Link
          href={`/goals/${row.goal.id}`}
          className="text-[11px] text-sky-600 hover:text-sky-700 hover:underline flex-shrink-0"
        >
          View goal
        </Link>
      )}
    </div>
  );
}
