"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, ChevronDown, ChevronUp, Loader2, MapPin, Target,
  CheckSquare, ListChecks, AlertTriangle, Filter, ClipboardList,
} from "lucide-react";
import Avatar from "@/components/Avatar";

// ── Types (mirror /api/team-accountability) ─────────────────────────────────

type Entity = "goal" | "pitstop" | "checklist" | "activity" | "followup";
type StatusBucket = "done_on_time" | "done_late" | "open_past_due" | "open";

type Row = {
  entity: Entity;
  id: string;
  title: string;
  dueAt: string;
  dueAt2: string | null;
  status: StatusBucket;
  rawStatus: string;
  completedAt: string | null;
  slippedPastWindow: boolean;
  daysLate: number;
  userId: string;
  userName: string | null;
  designation: string;
  domain: string | null;
  clusterId: string | null;
  clusterName: string | null;
  pitstopId: string | null;
  goalId: string;
  goalTitle: string;
  childCount: number;
};

type Summary = Record<Entity, {
  total: number;
  done_on_time: number;
  done_late: number;
  open_past_due: number;
  open: number;
  slipped_past_window: number;
}>;

type Response = {
  window: { from: string; to: string; label: string };
  goals: Row[];
  pitstops: Row[];
  checklists: Row[];
  activities: Row[];
  followUps: Row[];
  summary: Summary;
};

type WindowKey =
  | "today" | "yesterday"
  | "this_week" | "last_week"
  | "last_7d" | "last_15d" | "last_30d"
  | "this_month" | "last_month" | "this_quarter" | "custom";

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

const LAYER_OPTIONS: { key: "" | Entity; label: string }[] = [
  { key: "",          label: "All layers" },
  { key: "goal",      label: "Goals" },
  { key: "pitstop",   label: "Pitstops" },
  { key: "checklist", label: "Checklists" },
  { key: "activity",  label: "Activities" },
  { key: "followup",  label: "Follow-ups" },
];

const STATUS_OPTIONS: { key: "" | StatusBucket; label: string }[] = [
  { key: "",              label: "All statuses" },
  { key: "done_on_time",  label: "Done on time" },
  { key: "done_late",     label: "Done late" },
  { key: "open",          label: "Open (in range)" },
  { key: "open_past_due", label: "Open past due" },
];

const ENTITY_STYLE: Record<Entity, { icon: typeof Target; label: string; color: string }> = {
  goal:      { icon: Target,        label: "Goal",       color: "text-amber-700 bg-amber-50 border-amber-200" },
  pitstop:   { icon: Target,        label: "Pitstop",    color: "text-sky-700 bg-sky-50 border-sky-200" },
  checklist: { icon: CheckSquare,   label: "Checklist",  color: "text-violet-700 bg-violet-50 border-violet-200" },
  activity:  { icon: CalendarDays,  label: "Activity",   color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  followup:  { icon: ListChecks,    label: "Follow-up",  color: "text-rose-700 bg-rose-50 border-rose-200" },
};

const STATUS_STYLE: Record<StatusBucket, { label: string; color: string }> = {
  done_on_time:  { label: "Done · on time", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  done_late:     { label: "Done · late",    color: "text-amber-700 bg-amber-50 border-amber-200" },
  open_past_due: { label: "Open · overdue", color: "text-rose-700 bg-rose-50 border-rose-200" },
  open:          { label: "Open",           color: "text-stone-700 bg-stone-50 border-stone-200" },
};

type TeamMemberRef = { id: string; name: string | null; image: string | null };

/**
 * Home → Leader → Accountability tab. Due-anchored sibling to Team Report.
 * Shows what the team was SUPPOSED to do in a window across 5 layers (goal /
 * pitstop / checklist / activity / follow-up), with per-row status bucket and
 * lazy drill-down into the spine below each row.
 */
export function AccountabilityTab({
  currentUserId, teamMembers,
}: {
  currentUserId: string;
  teamMembers: TeamMemberRef[];
}) {
  const [windowKey, setWindowKey] = useState<WindowKey>("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [layer, setLayer] = useState<"" | Entity>("");
  const [statusFilter, setStatusFilter] = useState<"" | StatusBucket>("");
  const [domain, setDomain] = useState("");
  const [clusterId, setClusterId] = useState("");
  const [userIds, setUserIds] = useState<string[]>([]); // empty = whole team
  const [resp, setResp] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (windowKey === "custom" && (!customFrom || !customTo)) return;

    let abort = false;
    setLoading(true);
    setErr(null);

    const qs = new URLSearchParams();
    qs.set("window", windowKey);
    if (windowKey === "custom") { qs.set("from", customFrom); qs.set("to", customTo); }
    if (layer)         qs.set("layer", layer);
    if (statusFilter)  qs.set("status", statusFilter);
    if (domain)        qs.set("domain", domain);
    if (clusterId)     qs.set("clusterId", clusterId);
    if (userIds.length > 0) qs.set("userIds", userIds.join(","));

    fetch(`/api/team-accountability?${qs.toString()}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Couldn't load");
        return (await r.json()) as Response;
      })
      .then(d => { if (!abort) setResp(d); })
      .catch(e => { if (!abort) setErr(e instanceof Error ? e.message : "Couldn't load"); })
      .finally(() => { if (!abort) setLoading(false); });

    return () => { abort = true; };
  }, [windowKey, customFrom, customTo, layer, statusFilter, domain, clusterId, userIds]);

  // ── Derived: domain / cluster universes for the filter dropdowns ─────────
  const allRows = useMemo<Row[]>(() => {
    if (!resp) return [];
    return [...resp.goals, ...resp.pitstops, ...resp.checklists, ...resp.activities, ...resp.followUps];
  }, [resp]);

  const domains = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.domain) s.add(r.domain);
    return [...s].sort();
  }, [allRows]);

  const clusters = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) if (r.clusterId && r.clusterName) m.set(r.clusterId, r.clusterName);
    return [...m.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  }, [allRows]);

  const toggleUser = (id: string) => {
    setUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const showSection = (e: Entity) => !layer || layer === e;

  return (
    <div className="space-y-6">
      {/* ── Filter bar ───────────────────────────────────────────────── */}
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
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-xs border border-stone-200 rounded-md px-2 py-1.5 bg-white text-stone-700" />
              <span className="text-[11px] text-stone-400">→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-xs border border-stone-200 rounded-md px-2 py-1.5 bg-white text-stone-700" />
            </div>
          )}

          <select value={layer} onChange={e => setLayer(e.target.value as "" | Entity)}
            className="text-xs border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700">
            {LAYER_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as "" | StatusBucket)}
            className="text-xs border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700">
            {STATUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>

          {domains.length > 0 && (
            <select value={domain} onChange={e => setDomain(e.target.value)}
              className="text-xs border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700">
              <option value="">All domains</option>
              {domains.map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
            </select>
          )}

          {clusters.length > 0 && (
            <select value={clusterId} onChange={e => setClusterId(e.target.value)}
              className="text-xs border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700">
              <option value="">All clusters</option>
              {clusters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}

          {(layer || statusFilter || domain || clusterId || userIds.length > 0) && (
            <button type="button"
              onClick={() => { setLayer(""); setStatusFilter(""); setDomain(""); setClusterId(""); setUserIds([]); }}
              className="text-[11px] text-stone-500 hover:text-stone-800 underline">
              Clear
            </button>
          )}

          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400 ml-auto" />}
        </div>

        {teamMembers.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-stone-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-2.5 h-2.5" /> Who
            </span>
            {teamMembers.map(m => {
              const active = userIds.includes(m.id);
              const isSelf = m.id === currentUserId;
              return (
                <button key={m.id} type="button" onClick={() => toggleUser(m.id)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    active ? "bg-sky-100 border-sky-300 text-sky-800"
                           : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                  }`}>
                  <Avatar name={m.name} image={m.image} size="xs" />
                  {(m.name ?? "—").split(" ")[0]}{isSelf && <span className="text-stone-400">·you</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {err && (
        <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {err}
        </div>
      )}

      {/* ── Summary strip ───────────────────────────────────────────── */}
      {resp && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(["goal", "pitstop", "checklist", "activity", "followup"] as Entity[]).map(e => (
            <SummaryTile key={e} entity={e} s={resp.summary[e]} />
          ))}
        </div>
      )}

      {/* ── Layer sections ──────────────────────────────────────────── */}
      {resp && (
        <div className="space-y-4">
          {showSection("goal")      && <LayerSection title="Goals"       rows={resp.goals}      multiPerson={userIds.length !== 1} />}
          {showSection("pitstop")   && <LayerSection title="Pitstops"    rows={resp.pitstops}   multiPerson={userIds.length !== 1} />}
          {showSection("checklist") && <LayerSection title="Checklists"  rows={resp.checklists} multiPerson={userIds.length !== 1} />}
          {showSection("activity")  && <LayerSection title="Activities"  rows={resp.activities} multiPerson={userIds.length !== 1} />}
          {showSection("followup")  && <LayerSection title="Follow-ups"  rows={resp.followUps}  multiPerson={userIds.length !== 1} />}
        </div>
      )}
    </div>
  );
}

// ── Summary tile ────────────────────────────────────────────────────────────

function SummaryTile({ entity, s }: { entity: Entity; s: Summary[Entity] }) {
  const style = ENTITY_STYLE[entity];
  const Icon = style.icon;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${style.color}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] uppercase tracking-wider opacity-80">{style.label}s</span>
      </div>
      <p className="text-xl font-bold mt-1 tabular-nums">{s.total}</p>
      <p className="text-[10px] opacity-70 mt-0.5">
        {s.done_on_time + s.done_late} done · {s.open + s.open_past_due} open
        {s.done_late > 0 && <> · {s.done_late} late</>}
      </p>
    </div>
  );
}

// ── Layer section ───────────────────────────────────────────────────────────

function LayerSection({ title, rows, multiPerson }: {
  title: string; rows: Row[]; multiPerson: boolean;
}) {
  const [open, setOpen] = useState(true);

  // When multi-person mode, sub-group by attributed userId.
  const groups = useMemo(() => {
    if (!multiPerson) return [{ userId: "", userName: null, rows }];
    const m = new Map<string, { userId: string; userName: string | null; rows: Row[] }>();
    for (const r of rows) {
      const g = m.get(r.userId);
      if (!g) m.set(r.userId, { userId: r.userId, userName: r.userName, rows: [r] });
      else g.rows.push(r);
    }
    return [...m.values()].sort((a, b) => (a.userName ?? "").localeCompare(b.userName ?? ""));
  }, [rows, multiPerson]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold text-stone-400">{title} · 0</p>
      </div>
    );
  }

  const done = rows.filter(r => r.status === "done_on_time" || r.status === "done_late").length;
  const overdue = rows.filter(r => r.status === "open_past_due").length;

  return (
    <div className="rounded-xl border border-stone-200 bg-white">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-stone-50/50">
        <span className="text-sm font-semibold text-stone-800">{title}</span>
        <span className="text-[11px] text-stone-500">
          {rows.length} · {done} done{overdue > 0 && <> · {overdue} overdue</>}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-stone-400 ml-auto" />
              : <ChevronDown className="w-4 h-4 text-stone-400 ml-auto" />}
      </button>
      {open && (
        <div className="border-t border-stone-100 p-2 space-y-1">
          {groups.map(g => (
            <div key={g.userId}>
              {multiPerson && (
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-2 py-1">
                  {g.userName ?? "—"} · {g.rows.length}
                </p>
              )}
              {g.rows.map(r => <ItemRow key={`${r.entity}-${r.id}`} row={r} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── One row + its drill-down ────────────────────────────────────────────────

function ItemRow({ row }: { row: Row }) {
  const [expanded, setExpanded] = useState(false);
  const drillable = row.entity === "goal" || row.entity === "pitstop"
    || (row.entity === "activity" && row.childCount > 0);

  const style = ENTITY_STYLE[row.entity];
  const Icon = style.icon;
  const due = formatShortDate(row.dueAt);
  const due2 = row.dueAt2 ? formatShortDate(row.dueAt2) : null;
  const reschedule = row.entity === "activity" && due2 && row.dueAt2 !== row.dueAt;
  const completed = row.completedAt ? formatShortDate(row.completedAt) : null;

  const href = row.pitstopId
    ? `/goals/${row.goalId}/pitstops/${row.pitstopId}`
    : `/goals/${row.goalId}`;

  return (
    <div className="rounded-md border border-stone-100 bg-white">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 flex items-center gap-1 mt-0.5 ${style.color}`}>
          <Icon className="w-2.5 h-2.5" />
          {style.label}
        </span>
        <div className="flex-1 min-w-0">
          <Link href={href} className="text-xs font-medium text-stone-800 truncate hover:text-sky-700 block">
            {row.title}
          </Link>
          <p className="text-[11px] text-stone-500 truncate">
            {row.userName ?? "—"}
            {row.designation && <span className="text-stone-400"> · {row.designation}</span>}
            {row.entity !== "goal" && <> · {row.goalTitle}</>}
            {row.clusterName && <> · <MapPin className="inline w-2.5 h-2.5 -mt-0.5" /> {row.clusterName}</>}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] text-stone-500">
              Due {due}{reschedule && <> <span className="text-stone-400">→ now {due2}</span></>}
            </span>
            {completed && (
              <span className="text-[10px] text-stone-500">· Done {completed}</span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[row.status].color}`}>
              {STATUS_STYLE[row.status].label}
              {row.daysLate > 0 && <> · {row.daysLate}d</>}
            </span>
            {row.slippedPastWindow && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border text-amber-700 bg-amber-50 border-amber-200">
                slipped past window
              </span>
            )}
            {drillable && row.childCount > 0 && (
              <span className="text-[10px] text-stone-400">· {row.childCount} {childCountLabel(row.entity)}</span>
            )}
          </div>
        </div>
        {drillable && (
          <button onClick={() => setExpanded(e => !e)}
            className="text-stone-400 hover:text-stone-700 flex-shrink-0 mt-0.5"
            aria-label="Expand">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>
      {expanded && drillable && (
        <div className="border-t border-stone-100 bg-stone-50/40 px-2 py-2">
          {row.entity === "goal" && <GoalDrill goalId={row.id} />}
          {row.entity === "pitstop" && <PitstopDrill pitstopId={row.id} />}
          {row.entity === "activity" && <ActivityDrill eventId={row.id} />}
        </div>
      )}
    </div>
  );
}

function childCountLabel(e: Entity): string {
  if (e === "goal")     return "pitstops";
  if (e === "pitstop")  return "activities";
  if (e === "activity") return "follow-ups";
  return "";
}

// ── Drill-downs (lazy fetch on expand) ──────────────────────────────────────

type PitstopChild = {
  id: string;
  title: string;
  dueAt: string | null;
  rawStatus: string;
  status: StatusBucket | null;
  completedAt: string | null;
  daysLate: number;
  ownerName: string | null;
  activityCount: number;
  checklistCount: number;
  doneActivities: number;
  doneChecklists: number;
};

function GoalDrill({ goalId }: { goalId: string }) {
  const [data, setData] = useState<{ pitstops: PitstopChild[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    fetch(`/api/goals/${goalId}/accountability-pitstops`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Couldn't load"); return r.json(); })
      .then(d => { if (!abort) setData(d); })
      .catch(e => { if (!abort) setErr(e instanceof Error ? e.message : "Couldn't load"); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [goalId]);

  if (loading) return <p className="text-[11px] text-stone-400 px-2 py-1"><Loader2 className="inline w-3 h-3 animate-spin" /> Loading pitstops…</p>;
  if (err) return <p className="text-[11px] text-rose-600 px-2 py-1">{err}</p>;
  if (!data || data.pitstops.length === 0) return <p className="text-[11px] text-stone-400 px-2 py-1">No pitstops under this goal.</p>;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider px-1">
        Pitstops ({data.pitstops.length}) · all under this goal
      </p>
      {data.pitstops.map(p => (
        <div key={p.id} className="px-2 py-1.5 rounded border border-stone-100 bg-white">
          <div className="flex items-start gap-2">
            <ClipboardList className="w-3 h-3 text-sky-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-stone-800 truncate">{p.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[10px] text-stone-500">
                  Due {p.dueAt ? formatShortDate(p.dueAt) : "—"}
                </span>
                {p.completedAt && (
                  <span className="text-[10px] text-stone-500">· Done {formatShortDate(p.completedAt)}</span>
                )}
                {p.status && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[p.status].color}`}>
                    {STATUS_STYLE[p.status].label}
                    {p.daysLate > 0 && <> · {p.daysLate}d</>}
                  </span>
                )}
                <span className="text-[10px] text-stone-400">
                  · {p.doneActivities}/{p.activityCount} activities · {p.doneChecklists}/{p.checklistCount} checklists
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type PitstopChildRow = {
  entity: "activity" | "checklist";
  id: string;
  title: string;
  dueAt: string | null;
  dueAt2: string | null;
  rawStatus: string;
  status: StatusBucket | null;
  completedAt: string | null;
  daysLate: number;
  userName: string | null;
  actionPointCount: number;
};

function PitstopDrill({ pitstopId }: { pitstopId: string }) {
  const [data, setData] = useState<{ checklists: PitstopChildRow[]; activities: PitstopChildRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    fetch(`/api/pitstops/${pitstopId}/accountability-children`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Couldn't load"); return r.json(); })
      .then(d => { if (!abort) setData(d); })
      .catch(e => { if (!abort) setErr(e instanceof Error ? e.message : "Couldn't load"); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [pitstopId]);

  if (loading) return <p className="text-[11px] text-stone-400 px-2 py-1"><Loader2 className="inline w-3 h-3 animate-spin" /> Loading…</p>;
  if (err) return <p className="text-[11px] text-rose-600 px-2 py-1">{err}</p>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {data.activities.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider px-1">
            Activities ({data.activities.length})
          </p>
          {data.activities.map(a => <DrillRow key={a.id} row={a} kind="activity" />)}
        </div>
      )}
      {data.checklists.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider px-1">
            Checklists ({data.checklists.length})
          </p>
          {data.checklists.map(c => <DrillRow key={c.id} row={c} kind="checklist" />)}
        </div>
      )}
      {data.activities.length === 0 && data.checklists.length === 0 && (
        <p className="text-[11px] text-stone-400 px-2 py-1">No activities or checklists under this pitstop.</p>
      )}
    </div>
  );
}

function DrillRow({ row, kind }: { row: PitstopChildRow; kind: "activity" | "checklist" }) {
  const Icon = kind === "activity" ? CalendarDays : CheckSquare;
  const color = kind === "activity" ? "text-emerald-500" : "text-violet-500";
  const reschedule = row.dueAt2 && row.dueAt2 !== row.dueAt;
  return (
    <div className="px-2 py-1.5 rounded border border-stone-100 bg-white">
      <div className="flex items-start gap-2">
        <Icon className={`w-3 h-3 flex-shrink-0 mt-0.5 ${color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-stone-800 truncate">{row.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] text-stone-500">
              Due {row.dueAt ? formatShortDate(row.dueAt) : "—"}
              {reschedule && row.dueAt2 && <> <span className="text-stone-400">→ now {formatShortDate(row.dueAt2)}</span></>}
            </span>
            {row.completedAt && (
              <span className="text-[10px] text-stone-500">· Done {formatShortDate(row.completedAt)}</span>
            )}
            {row.status && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[row.status].color}`}>
                {STATUS_STYLE[row.status].label}
                {row.daysLate > 0 && <> · {row.daysLate}d</>}
              </span>
            )}
            {row.userName && <span className="text-[10px] text-stone-400">· {row.userName}</span>}
            {row.actionPointCount > 0 && (
              <span className="text-[10px] text-stone-400">· {row.actionPointCount} follow-up{row.actionPointCount === 1 ? "" : "s"}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type APChild = {
  id: string;
  title: string;
  dueAt: string;
  rawStatus: string;
  status: StatusBucket;
  completedAt: string | null;
  daysLate: number;
  ownerName: string | null;
  priority: string;
};

function ActivityDrill({ eventId }: { eventId: string }) {
  const [data, setData] = useState<{ actionPoints: APChild[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    fetch(`/api/pitstop-events/${eventId}/accountability-aps`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Couldn't load"); return r.json(); })
      .then(d => { if (!abort) setData(d); })
      .catch(e => { if (!abort) setErr(e instanceof Error ? e.message : "Couldn't load"); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [eventId]);

  if (loading) return <p className="text-[11px] text-stone-400 px-2 py-1"><Loader2 className="inline w-3 h-3 animate-spin" /> Loading follow-ups…</p>;
  if (err) return <p className="text-[11px] text-rose-600 px-2 py-1">{err}</p>;
  if (!data || data.actionPoints.length === 0) return <p className="text-[11px] text-stone-400 px-2 py-1">No follow-ups under this activity.</p>;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider px-1">
        Follow-ups ({data.actionPoints.length})
      </p>
      {data.actionPoints.map(ap => (
        <div key={ap.id} className="px-2 py-1.5 rounded border border-stone-100 bg-white">
          <div className="flex items-start gap-2">
            <ListChecks className="w-3 h-3 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-stone-800 truncate">{ap.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[10px] text-stone-500">Due {formatShortDate(ap.dueAt)}</span>
                {ap.completedAt && <span className="text-[10px] text-stone-500">· Done {formatShortDate(ap.completedAt)}</span>}
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[ap.status].color}`}>
                  {STATUS_STYLE[ap.status].label}
                  {ap.daysLate > 0 && <> · {ap.daysLate}d</>}
                </span>
                {ap.ownerName && <span className="text-[10px] text-stone-400">· {ap.ownerName}</span>}
                {ap.priority === "urgent" && (
                  <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">urgent</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Date formatting (avoids the iso.slice(0,10) IST/UTC bug) ───────────────

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
