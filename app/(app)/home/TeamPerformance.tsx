"use client";

import { useEffect, useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import type { SlaEntity, SlaMode, SlaResponse, SlaRow } from "@/lib/sla";
import { SMALL_N_THRESHOLD } from "@/lib/sla";
import type { DrillResponse, DrillRow } from "../../api/team-sla/drill/route";
import type { OverdueItem, OverdueResponse } from "../../api/team-overdue/route";

// Order roles top-down. "Leader" sits above PM/ZL/RP but is the viewer
// themselves and never appears as a row group here.
const DESIGNATION_ORDER = ["PM", "ZL", "RP"] as const;
const ENTITY_ORDER: SlaEntity[] = ["goal", "pitstop", "checklist", "activity"];
const ENTITY_LABEL: Record<SlaEntity, string> = {
  goal: "Goal",
  pitstop: "Pitstop",
  checklist: "Checklist",
  activity: "Activity",
};

function designationLabel(d: string): string {
  if (d === "PM") return "Programme Managers";
  if (d === "ZL") return "Zonal Leads";
  if (d === "RP") return "Resource Persons";
  return "Others";
}

function bucketize<T extends { designation: string }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const key = (DESIGNATION_ORDER as readonly string[]).includes(it.designation) ? it.designation : "Other";
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(it);
  }
  return m;
}

function formatDays(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.05) return "0d";
  return `${n.toFixed(1)}d`;
}

function breachClass(breach: number): string {
  if (breach > 1) return "text-rose-600 bg-rose-50";
  if (breach > 0) return "text-amber-700 bg-amber-50";
  if (breach < -0.5) return "text-emerald-700 bg-emerald-50";
  return "text-stone-600 bg-stone-50";
}

// ── SLA Performance Panel ────────────────────────────────────────────────────

type PerUser = {
  userId: string;
  userName: string | null;
  designation: string;
  byEntity: Map<SlaEntity, { actual: number; target: number; breach: number; n: number; rows: SlaRow[] }>;
  worstBreach: number;
};

function aggregate(rows: SlaRow[]): PerUser[] {
  const byUser = new Map<string, PerUser>();
  for (const r of rows) {
    let u = byUser.get(r.userId);
    if (!u) {
      u = {
        userId: r.userId,
        userName: r.userName,
        designation: r.designation,
        byEntity: new Map(),
        worstBreach: -Infinity,
      };
      byUser.set(r.userId, u);
    }
    const cur = u.byEntity.get(r.entity);
    if (!cur) {
      u.byEntity.set(r.entity, {
        actual: r.actualAvgDays * r.n,
        target: r.targetAvgDays * r.n,
        breach: 0,
        n: r.n,
        rows: [r],
      });
    } else {
      cur.actual += r.actualAvgDays * r.n;
      cur.target += r.targetAvgDays * r.n;
      cur.n += r.n;
      cur.rows.push(r);
    }
  }
  // Finalize n-weighted averages and worstBreach across entities.
  for (const u of byUser.values()) {
    for (const v of u.byEntity.values()) {
      v.actual = v.n > 0 ? v.actual / v.n : 0;
      v.target = v.n > 0 ? v.target / v.n : 0;
      v.breach = v.actual - v.target;
      if (v.n >= SMALL_N_THRESHOLD && v.breach > u.worstBreach) u.worstBreach = v.breach;
    }
  }
  return [...byUser.values()];
}

export function TeamSlaPanel() {
  const [mode, setMode] = useState<SlaMode>("rolling");
  const [data, setData] = useState<SlaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillState | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/team-sla?mode=${mode}`)
      .then((r) => r.json())
      .then((d: SlaResponse) => { if (!cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode]);

  const users = useMemo(() => (data ? aggregate(data.rows) : []), [data]);
  const buckets = useMemo(() => bucketize(users), [users]);
  const orderedGroups = useMemo(
    () => [...DESIGNATION_ORDER, "Other"].filter((d) => buckets.has(d)) as string[],
    [buckets],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Team SLA Performance</h2>
          <p className="text-[11px] text-stone-400 mt-0.5">
            Avg actual vs target completion time. Breach = positive days late.
          </p>
        </div>
        <div className="flex rounded-full border border-stone-200 p-0.5 text-[11px]">
          <button
            onClick={() => setMode("rolling")}
            className={`px-2.5 py-1 rounded-full ${mode === "rolling" ? "bg-stone-900 text-white" : "text-stone-600"}`}
          >Rolling 90d</button>
          <button
            onClick={() => setMode("allTime")}
            className={`px-2.5 py-1 rounded-full ${mode === "allTime" ? "bg-stone-900 text-white" : "text-stone-600"}`}
          >All time</button>
        </div>
      </div>

      {loading && <p className="text-xs text-stone-400">Loading…</p>}
      {!loading && users.length === 0 && (
        <p className="text-xs text-stone-400">No completion data in this window yet.</p>
      )}

      {orderedGroups.map((d) => {
        const members = buckets.get(d) ?? [];
        // Breach-first sort.
        members.sort((a, b) => {
          if (b.worstBreach !== a.worstBreach) return b.worstBreach - a.worstBreach;
          return (a.userName ?? "").localeCompare(b.userName ?? "");
        });
        return (
          <section key={d} className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <header className="px-4 py-3 bg-stone-50 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-800">
                {designationLabel(d)} <span className="text-[11px] text-stone-400">({members.length})</span>
              </h3>
            </header>
            <div className="divide-y divide-stone-100">
              {members.map((u) => (
                <UserSlaRow key={u.userId} user={u} mode={mode} onDrill={setDrill} />
              ))}
            </div>
          </section>
        );
      })}

      {drill && <DrillSheet state={drill} mode={mode} onClose={() => setDrill(null)} />}
    </div>
  );
}

function UserSlaRow({
  user, mode, onDrill,
}: {
  user: PerUser;
  mode: SlaMode;
  onDrill: (state: DrillState) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-4 py-2.5">
      <button
        type="button"
        className="w-full flex items-center gap-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <Avatar name={user.userName} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-800 truncate">{user.userName ?? "Unknown"}</p>
          <p className="text-[10px] text-stone-400">{user.designation}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[60%]">
          {ENTITY_ORDER.map((entity) => {
            const v = user.byEntity.get(entity);
            if (!v || v.n === 0) {
              return (
                <span key={entity} className="text-[10px] text-stone-300 px-1.5 py-0.5">{ENTITY_LABEL[entity]} —</span>
              );
            }
            const small = v.n < SMALL_N_THRESHOLD;
            return (
              <span
                key={entity}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${breachClass(v.breach)} ${small ? "opacity-50" : ""}`}
                title={`${formatDays(v.actual)} actual vs ${formatDays(v.target)} target (n=${v.n})${small ? " — small N" : ""}`}
              >
                {ENTITY_LABEL[entity]} {v.breach >= 0 ? "+" : ""}{formatDays(v.breach)}
              </span>
            );
          })}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 ml-9 space-y-2">
          {ENTITY_ORDER.map((entity) => {
            const v = user.byEntity.get(entity);
            if (!v || v.n === 0) return null;
            return (
              <div key={entity}>
                <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide mb-1">
                  {ENTITY_LABEL[entity]} · {formatDays(v.actual)} vs {formatDays(v.target)} target (n={v.n})
                </p>
                <div className="space-y-0.5">
                  {v.rows
                    .slice()
                    .sort((a, b) => b.breachDays - a.breachDays)
                    .map((r) => {
                      const small = r.n < SMALL_N_THRESHOLD;
                      return (
                        <button
                          key={`${r.userId}_${r.entity}_${r.domain ?? "__null"}`}
                          type="button"
                          onClick={() => onDrill({
                            userId: user.userId,
                            userName: user.userName,
                            entity,
                            domain: r.domain,
                            actualAvgDays: r.actualAvgDays,
                            targetAvgDays: r.targetAvgDays,
                            n: r.n,
                          })}
                          className={`w-full flex items-center justify-between gap-2 text-[12px] px-2 py-1 rounded hover:bg-stone-50 ${small ? "opacity-60" : ""}`}
                        >
                          <span className="truncate text-stone-700">{r.domain ?? "Operational / no domain"}</span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-stone-500">{formatDays(r.actualAvgDays)} vs {formatDays(r.targetAvgDays)}</span>
                            <span className={`px-1.5 py-0.5 rounded ${breachClass(r.breachDays)}`}>
                              {r.breachDays >= 0 ? "+" : ""}{formatDays(r.breachDays)}
                            </span>
                            <span className="text-stone-400">n={r.n}{small ? "*" : ""}</span>
                            <span className="text-stone-400">›</span>
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Drill Sheet ──────────────────────────────────────────────────────────────

type DrillState = {
  userId: string;
  userName: string | null;
  entity: SlaEntity;
  domain: string | null;
  actualAvgDays: number;
  targetAvgDays: number;
  n: number;
};

function DrillSheet({
  state, mode, onClose,
}: {
  state: DrillState;
  mode: SlaMode;
  onClose: () => void;
}) {
  const [goals, setGoals] = useState<DrillRow[] | null>(null);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [pitstopsByGoal, setPitstopsByGoal] = useState<Record<string, DrillRow[]>>({});

  useEffect(() => {
    setGoals(null);
    setOpenGoalId(null);
    setPitstopsByGoal({});
    const params = new URLSearchParams({
      userId: state.userId,
      entity: state.entity,
      mode,
    });
    if (state.domain === null) {
      // no domain filter
    } else if (state.domain === "") {
      params.set("domain", "");
    } else {
      params.set("domain", state.domain);
    }
    fetch(`/api/team-sla/drill?${params}`)
      .then((r) => r.json())
      .then((d: DrillResponse) => setGoals(d.rows));
  }, [state.userId, state.entity, state.domain, mode]);

  const toggleGoal = async (goalId: string) => {
    if (openGoalId === goalId) {
      setOpenGoalId(null);
      return;
    }
    setOpenGoalId(goalId);
    if (pitstopsByGoal[goalId]) return;
    const params = new URLSearchParams({
      userId: state.userId,
      entity: state.entity,
      goalId,
      mode,
    });
    const res = await fetch(`/api/team-sla/drill?${params}`);
    const data: DrillResponse = await res.json();
    setPitstopsByGoal((m) => ({ ...m, [goalId]: data.rows }));
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-stone-900/30" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-xl overflow-y-auto">
        <header className="sticky top-0 z-10 bg-white border-b border-stone-100 px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-stone-400 uppercase tracking-wide">
              {state.userName} · {ENTITY_LABEL[state.entity]} · {state.domain ?? "Operational"}
            </p>
            <p className="text-sm font-semibold text-stone-800">
              {formatDays(state.actualAvgDays)} vs {formatDays(state.targetAvgDays)} target
              <span className="ml-2 text-stone-400 text-[11px] font-normal">n={state.n}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-800 text-sm">✕</button>
        </header>

        <div className="p-4 space-y-2">
          <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">By goal</p>
          {goals === null && <p className="text-xs text-stone-400">Loading…</p>}
          {goals !== null && goals.length === 0 && (
            <p className="text-xs text-stone-400">No data.</p>
          )}
          {goals?.map((g) => (
            <div key={g.id} className="border border-stone-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGoal(g.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-stone-50"
              >
                <span className="text-sm text-stone-800 truncate text-left">{g.label}</span>
                <span className="flex items-center gap-2 flex-shrink-0 text-[11px]">
                  <span className="text-stone-500">{formatDays(g.actualAvgDays)} vs {formatDays(g.targetAvgDays)}</span>
                  <span className={`px-1.5 py-0.5 rounded ${breachClass(g.breachDays)}`}>
                    {g.breachDays >= 0 ? "+" : ""}{formatDays(g.breachDays)}
                  </span>
                  <span className="text-stone-400">n={g.n}</span>
                  <span className="text-stone-400">{openGoalId === g.id ? "▾" : "▸"}</span>
                </span>
              </button>
              {openGoalId === g.id && (
                <div className="border-t border-stone-100 bg-stone-50 px-3 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">By pitstop</p>
                  {!pitstopsByGoal[g.id] && <p className="text-xs text-stone-400">Loading…</p>}
                  {pitstopsByGoal[g.id]?.length === 0 && (
                    <p className="text-xs text-stone-400">No pitstop data.</p>
                  )}
                  {pitstopsByGoal[g.id]?.map((p) => (
                    <a
                      key={p.id}
                      href={`/goals/${g.id}?pitstop=${p.id}`}
                      className="flex items-center justify-between gap-2 text-[12px] px-2 py-1 rounded hover:bg-white"
                    >
                      <span className="truncate text-stone-700">{p.label}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-stone-500">{formatDays(p.actualAvgDays)} vs {formatDays(p.targetAvgDays)}</span>
                        <span className={`px-1.5 py-0.5 rounded ${breachClass(p.breachDays)}`}>
                          {p.breachDays >= 0 ? "+" : ""}{formatDays(p.breachDays)}
                        </span>
                        <span className="text-stone-400">n={p.n}</span>
                        <span className="text-stone-400">→</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Overdue Panel ────────────────────────────────────────────────────────────

export function TeamOverduePanel() {
  const [items, setItems] = useState<OverdueItem[] | null>(null);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team-overdue")
      .then((r) => r.json())
      .then((d: OverdueResponse) => setItems(d.items));
  }, []);

  const userRows = useMemo(() => {
    if (!items) return [];
    const by = new Map<string, {
      userId: string; userName: string | null; designation: string;
      counts: Record<SlaEntity, number>; items: OverdueItem[];
    }>();
    for (const it of items) {
      let u = by.get(it.userId);
      if (!u) {
        u = { userId: it.userId, userName: it.userName, designation: it.designation,
              counts: { goal: 0, pitstop: 0, checklist: 0, activity: 0 }, items: [] };
        by.set(it.userId, u);
      }
      u.counts[it.entity]++;
      u.items.push(it);
    }
    return [...by.values()];
  }, [items]);

  const buckets = useMemo(() => bucketize(userRows), [userRows]);
  const orderedGroups = useMemo(
    () => [...DESIGNATION_ORDER, "Other"].filter((d) => buckets.has(d)) as string[],
    [buckets],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Overdue</h2>
        <p className="text-[11px] text-stone-400 mt-0.5">Currently open and past their scheduled/target date.</p>
      </div>

      {items === null && <p className="text-xs text-stone-400">Loading…</p>}
      {items !== null && userRows.length === 0 && (
        <p className="text-xs text-stone-400">No overdue items. ✓</p>
      )}

      {orderedGroups.map((d) => {
        const members = buckets.get(d) ?? [];
        // Sort by total overdue desc.
        members.sort((a, b) => {
          const aT = a.counts.goal + a.counts.pitstop + a.counts.checklist + a.counts.activity;
          const bT = b.counts.goal + b.counts.pitstop + b.counts.checklist + b.counts.activity;
          if (aT !== bT) return bT - aT;
          return (a.userName ?? "").localeCompare(b.userName ?? "");
        });
        return (
          <section key={d} className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <header className="px-4 py-3 bg-stone-50 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-800">
                {designationLabel(d)} <span className="text-[11px] text-stone-400">({members.length})</span>
              </h3>
            </header>
            <div className="divide-y divide-stone-100">
              {members.map((u) => (
                <div key={u.userId}>
                  <button
                    type="button"
                    onClick={() => setOpenUserId(openUserId === u.userId ? null : u.userId)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50"
                  >
                    <Avatar name={u.userName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{u.userName ?? "Unknown"}</p>
                      <p className="text-[10px] text-stone-400">{u.designation}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] flex-wrap justify-end">
                      {ENTITY_ORDER.map((e) => u.counts[e] > 0 && (
                        <span key={e} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">
                          {u.counts[e]} {ENTITY_LABEL[e].toLowerCase()}
                        </span>
                      ))}
                      <span className="text-stone-400 ml-1">{openUserId === u.userId ? "▾" : "▸"}</span>
                    </div>
                  </button>
                  {openUserId === u.userId && <UserOverdueDetail items={u.items} />}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function UserOverdueDetail({ items }: { items: OverdueItem[] }) {
  // Group by cluster then by domain.
  const groups = new Map<string, Map<string, OverdueItem[]>>();
  for (const it of items) {
    const clusterKey = it.clusterName ?? "Unassigned cluster";
    const domainKey = it.domain ?? "Operational";
    let byDomain = groups.get(clusterKey);
    if (!byDomain) { byDomain = new Map(); groups.set(clusterKey, byDomain); }
    let arr = byDomain.get(domainKey);
    if (!arr) { arr = []; byDomain.set(domainKey, arr); }
    arr.push(it);
  }
  const clusterKeys = [...groups.keys()].sort();
  return (
    <div className="ml-9 mr-4 mb-3 mt-1 space-y-3">
      {clusterKeys.map((ck) => {
        const byDomain = groups.get(ck)!;
        const domainKeys = [...byDomain.keys()].sort();
        return (
          <div key={ck}>
            <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide mb-1">{ck}</p>
            <div className="space-y-2">
              {domainKeys.map((dk) => (
                <div key={dk}>
                  <p className="text-[10px] text-stone-400 mb-0.5">{dk}</p>
                  <div className="space-y-0.5">
                    {byDomain.get(dk)!
                      .slice()
                      .sort((a, b) => b.daysOverdue - a.daysOverdue)
                      .map((it) => {
                        const href = it.pitstopId
                          ? `/goals/${it.goalId}?pitstop=${it.pitstopId}`
                          : `/goals/${it.goalId}`;
                        return (
                          <a
                            key={`${it.entity}_${it.id}`}
                            href={href}
                            className="flex items-center justify-between gap-2 text-[12px] px-2 py-1 rounded hover:bg-stone-50"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[9px] uppercase font-semibold text-stone-400 flex-shrink-0">
                                {ENTITY_LABEL[it.entity]}
                              </span>
                              <span className="text-stone-700 truncate">{it.title}</span>
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-rose-600 font-medium">{it.daysOverdue}d late</span>
                              <span className="text-stone-400">→</span>
                            </span>
                          </a>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
