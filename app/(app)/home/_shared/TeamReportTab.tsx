"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, ChevronDown, ChevronUp, Loader2, MapPin, Target,
  CheckSquare, ListChecks, BarChart3, AlertTriangle, Filter,
} from "lucide-react";
import Avatar from "@/components/Avatar";

type WindowKey =
  | "today" | "yesterday"
  | "this_week" | "last_week"
  | "last_7d" | "last_15d" | "last_30d"
  | "this_month" | "last_month" | "this_quarter" | "custom";

type CompletionEntity = "pitstop" | "activity" | "checklist" | "goal" | "followup";

type CompletionItem = {
  entity: CompletionEntity;
  id: string;
  title: string;
  completedAt: string;
  userId: string;
  userName: string | null;
  designation: string;
  domain: string | null;
  clusterId: string | null;
  clusterName: string | null;
  cityId: string | null;
  zoneId: string | null;
  pitstopId: string | null;
  goalId: string;
  goalTitle: string;
};

type CompletionsResponse = {
  window: { from: string; to: string; label: string };
  items: CompletionItem[];
  counts: { pitstop: number; activity: number; checklist: number; goal: number; followup: number };
};

const WINDOW_OPTIONS: { key: WindowKey; label: string }[] = [
  { key: "today",        label: "Today" },
  { key: "yesterday",    label: "Yesterday" },
  { key: "this_week",    label: "This week" },
  { key: "last_week",    label: "Last week" },
  { key: "last_7d",      label: "Last 7 days" },
  { key: "last_15d",     label: "Last 15 days" },
  { key: "last_30d",     label: "Last 30 days" },
  { key: "this_month",   label: "This month" },
  { key: "last_month",   label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "custom",       label: "Custom range…" },
];

const TYPE_OPTIONS: { key: "" | CompletionEntity; label: string }[] = [
  { key: "",          label: "All types" },
  { key: "pitstop",   label: "Pitstops" },
  { key: "activity",  label: "Activities" },
  { key: "checklist", label: "Checklists" },
  { key: "goal",      label: "Goals" },
  { key: "followup",  label: "Follow-ups" },
];

const ENTITY_STYLE: Record<CompletionEntity, { icon: typeof Target; label: string; color: string }> = {
  pitstop:   { icon: Target,      label: "Pitstop",    color: "text-sky-700 bg-sky-50 border-sky-200" },
  activity:  { icon: CalendarDays, label: "Activity",  color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  checklist: { icon: CheckSquare, label: "Checklist",  color: "text-violet-700 bg-violet-50 border-violet-200" },
  goal:      { icon: Target,      label: "Goal",       color: "text-amber-700 bg-amber-50 border-amber-200" },
  followup:  { icon: ListChecks,  label: "Follow-up",  color: "text-rose-700 bg-rose-50 border-rose-200" },
};

type TeamMemberRef = { id: string; name: string | null; image: string | null };

/**
 * Team Report tab — shipped to ZL/PM/Leader/admin (not RP). Lets a supervisor
 * see what their team has actually completed in a chosen window, broken down
 * by person and type.
 *
 * Rollup rule: child checklists count alongside activities — they're shown as
 * a chip on each activity row in the per-day drilldown. Pitstops/goals/
 * follow-ups count standalone in the hero, since each represents a distinct
 * unit of work being closed.
 *
 * Data: fetches /api/team-completions on every filter change. The endpoint is
 * RBAC-scoped (caller + recursive reports), so passing a userIds subset only
 * narrows — it can't expand visibility.
 */
export function TeamReportTab({
  currentUserId, teamMembers,
}: {
  currentUserId: string;
  teamMembers: TeamMemberRef[];
}) {
  const [windowKey, setWindowKey] = useState<WindowKey>("last_7d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"" | CompletionEntity>("");
  const [domain, setDomain] = useState<string>("");
  const [clusterId, setClusterId] = useState<string>("");
  const [userIds, setUserIds] = useState<string[]>([]);   // empty = whole team
  const [resp, setResp] = useState<CompletionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedPerson, setExpandedPerson] = useState<Set<string>>(new Set());

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Custom window needs both bounds before we fire the request.
    if (windowKey === "custom" && (!customFrom || !customTo)) return;

    let abort = false;
    setLoading(true);
    setErr(null);

    const qs = new URLSearchParams();
    qs.set("window", windowKey);
    if (windowKey === "custom") { qs.set("from", customFrom); qs.set("to", customTo); }
    if (typeFilter)             qs.set("type", typeFilter);
    if (domain)                 qs.set("domain", domain);
    if (clusterId)              qs.set("clusterId", clusterId);
    if (userIds.length > 0)     qs.set("userIds", userIds.join(","));

    fetch(`/api/team-completions?${qs.toString()}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Couldn't load completions");
        return (await r.json()) as CompletionsResponse;
      })
      .then(d => { if (!abort) setResp(d); })
      .catch(e => { if (!abort) setErr(e instanceof Error ? e.message : "Couldn't load"); })
      .finally(() => { if (!abort) setLoading(false); });

    return () => { abort = true; };
  }, [windowKey, customFrom, customTo, typeFilter, domain, clusterId, userIds]);

  // ── Derived: per-person rollup ───────────────────────────────────────────
  const byPerson = useMemo(() => {
    if (!resp) return [];
    const map = new Map<string, {
      userId: string;
      userName: string | null;
      designation: string;
      counts: Record<CompletionEntity, number>;
      items: CompletionItem[];
    }>();
    for (const it of resp.items) {
      let row = map.get(it.userId);
      if (!row) {
        row = {
          userId: it.userId,
          userName: it.userName,
          designation: it.designation,
          counts: { pitstop: 0, activity: 0, checklist: 0, goal: 0, followup: 0 },
          items: [],
        };
        map.set(it.userId, row);
      }
      row.counts[it.entity] += 1;
      row.items.push(it);
    }
    // Sort: most-total first.
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [resp]);

  // ── Derived: filter universes for domain/cluster dropdowns ───────────────
  const domains = useMemo(() => {
    if (!resp) return [];
    const s = new Set<string>();
    for (const it of resp.items) if (it.domain) s.add(it.domain);
    return [...s].sort();
  }, [resp]);
  const clusters = useMemo(() => {
    if (!resp) return [];
    const m = new Map<string, string>();
    for (const it of resp.items) if (it.clusterId && it.clusterName) m.set(it.clusterId, it.clusterName);
    return [...m.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  }, [resp]);

  const togglePerson = (id: string) => {
    setExpandedPerson(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const toggleUserFilter = (id: string) => {
    setUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6">
      {/* ── Filters strip ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={windowKey}
            onChange={e => setWindowKey(e.target.value as WindowKey)}
            className="text-xs border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            {WINDOW_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>

          {windowKey === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="text-xs border border-stone-200 rounded-md px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <span className="text-[11px] text-stone-400">→</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="text-xs border border-stone-200 rounded-md px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
          )}

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as "" | CompletionEntity)}
            className="text-xs border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            {TYPE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>

          {domains.length > 0 && (
            <select
              value={domain}
              onChange={e => setDomain(e.target.value)}
              className="text-xs border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <option value="">All domains</option>
              {domains.map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
            </select>
          )}

          {clusters.length > 0 && (
            <select
              value={clusterId}
              onChange={e => setClusterId(e.target.value)}
              className="text-xs border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <option value="">All clusters</option>
              {clusters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}

          {(domain || clusterId || typeFilter || userIds.length > 0) && (
            <button
              type="button"
              onClick={() => { setDomain(""); setClusterId(""); setTypeFilter(""); setUserIds([]); }}
              className="text-[11px] text-stone-500 hover:text-stone-800 underline"
            >
              Clear
            </button>
          )}

          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400 ml-auto" />}
        </div>

        {/* Team picker — pill row. Visible-only when there's more than just self */}
        {teamMembers.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-stone-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-2.5 h-2.5" /> Who
            </span>
            {teamMembers.map(m => {
              const active = userIds.length === 0 ? false : userIds.includes(m.id);
              const isSelf = m.id === currentUserId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleUserFilter(m.id)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    active
                      ? "bg-sky-100 border-sky-300 text-sky-800"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                  }`}
                >
                  <Avatar name={m.name} image={m.image} size="xs" />
                  {(m.name ?? "—").split(" ")[0]}{isSelf && <span className="text-stone-400">·you</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {err && (
        <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {err}
        </div>
      )}

      {/* ── Hero counts ─────────────────────────────────────────────────── */}
      {resp && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <HeroTile label="Pitstops"   value={resp.counts.pitstop}   entity="pitstop"   />
          <HeroTile label="Activities" value={resp.counts.activity}  entity="activity"  sublabel={`${resp.counts.checklist} checklist${resp.counts.checklist === 1 ? "" : "s"} ↓`} />
          <HeroTile label="Goals"      value={resp.counts.goal}      entity="goal"      />
          <HeroTile label="Follow-ups" value={resp.counts.followup}  entity="followup"  />
          <HeroTile label="Total"      value={resp.items.length}     entity={null}      />
        </div>
      )}

      {/* ── By person ───────────────────────────────────────────────────── */}
      {resp && (
        byPerson.length === 0 ? (
          <div className="text-center py-12 text-sm text-stone-400">
            {loading ? "Loading…" : `No completions in the window "${resp.window.label}".`}
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">
              By person ({byPerson.length})
            </h3>
            {byPerson.map(p => {
              const open = expandedPerson.has(p.userId);
              return (
                <div key={p.userId} className="rounded-xl border border-stone-200 bg-white">
                  <button
                    onClick={() => togglePerson(p.userId)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50/50"
                    aria-expanded={open}
                  >
                    <Avatar name={p.userName} image={null} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">
                        {p.userName ?? "Unknown"}{p.userId === currentUserId && <span className="text-stone-400 font-normal"> · you</span>}
                        <span className="text-[10px] text-stone-400 ml-1.5">({p.designation})</span>
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <CountBadge count={p.items.length} label="items" tone="strong" />
                        {p.counts.pitstop  > 0 && <CountBadge count={p.counts.pitstop}  label="P" entity="pitstop" />}
                        {p.counts.activity > 0 && <CountBadge count={p.counts.activity} label="A" entity="activity" />}
                        {p.counts.checklist > 0 && <CountBadge count={p.counts.checklist} label="C" entity="checklist" />}
                        {p.counts.goal     > 0 && <CountBadge count={p.counts.goal}     label="GC" entity="goal" />}
                        {p.counts.followup > 0 && <CountBadge count={p.counts.followup} label="FU" entity="followup" />}
                      </div>
                    </div>
                    {open ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                  </button>
                  {open && (
                    <div className="px-3 pb-3 pt-1 border-t border-stone-100">
                      <PersonDrilldown items={p.items} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function HeroTile({ label, value, entity, sublabel }: {
  label: string; value: number; entity: CompletionEntity | null; sublabel?: string;
}) {
  const style = entity ? ENTITY_STYLE[entity] : null;
  const Icon = style?.icon ?? BarChart3;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${style?.color ?? "border-stone-200 bg-white"}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <p className="text-xl font-bold mt-1 tabular-nums">{value}</p>
      {sublabel && <p className="text-[10px] opacity-70 mt-0.5">{sublabel}</p>}
    </div>
  );
}

function CountBadge({ count, label, entity, tone }: {
  count: number; label: string; entity?: CompletionEntity; tone?: "strong";
}) {
  if (tone === "strong") {
    return (
      <span className="text-[10px] font-semibold text-stone-800 bg-stone-200/70 px-1.5 py-0.5 rounded">
        {count} {label}
      </span>
    );
  }
  const c = entity ? ENTITY_STYLE[entity].color : "text-stone-700 bg-stone-100 border-stone-200";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${c}`}>
      {count}{label}
    </span>
  );
}

/**
 * Drilldown for one person — flat list, grouped by day, then by type. Day
 * headers compact ("Tue Jun 4"), each item one row with entity icon + title
 * + goal + cluster + link.
 */
function PersonDrilldown({ items }: { items: CompletionItem[] }) {
  // Group by YYYY-MM-DD of completedAt.
  const byDay = useMemo(() => {
    const m = new Map<string, CompletionItem[]>();
    for (const it of items) {
      const d = new Date(it.completedAt);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!m.has(ymd)) m.set(ymd, []);
      m.get(ymd)!.push(it);
    }
    return [...m.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [items]);

  return (
    <div className="space-y-3 mt-2">
      {byDay.map(([ymd, dayItems]) => {
        const d = new Date(`${ymd}T00:00:00`);
        const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        return (
          <div key={ymd}>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 px-1">
              {label} · {dayItems.length} item{dayItems.length === 1 ? "" : "s"}
            </p>
            <div className="space-y-1">
              {dayItems.map(it => <DrilldownRow key={`${it.entity}-${it.id}`} item={it} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrilldownRow({ item }: { item: CompletionItem }) {
  const style = ENTITY_STYLE[item.entity];
  const Icon = style.icon;
  const href = item.pitstopId
    ? `/goals/${item.goalId}/pitstops/${item.pitstopId}`
    : `/goals/${item.goalId}`;
  const time = new Date(item.completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <Link
      href={href}
      className="block px-2.5 py-1.5 rounded-md border border-stone-100 hover:border-stone-200 hover:bg-stone-50/60 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 flex items-center gap-1 ${style.color}`}>
          <Icon className="w-2.5 h-2.5" />
          {style.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-stone-800 truncate">{item.title}</p>
          <p className="text-[11px] text-stone-500 truncate">
            {item.goalTitle}
            {item.clusterName && <> · <MapPin className="inline w-2.5 h-2.5 -mt-0.5" /> {item.clusterName}</>}
            {item.domain && <> · {item.domain.replace(/_/g, " ")}</>}
          </p>
        </div>
        <span className="text-[10px] text-stone-400 tabular-nums flex-shrink-0">{time}</span>
      </div>
    </Link>
  );
}
