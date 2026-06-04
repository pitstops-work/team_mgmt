"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, Sparkles, Loader2,
  Target, CalendarDays, CheckSquare, ListChecks, BarChart3,
} from "lucide-react";

// ── Wire types (must match app/api/ops-progress/route.ts) ────────────────────

type OpsMetricKey = "pitstop" | "activity" | "checklist" | "goal" | "followup";

type OpsMetricRow = {
  key: OpsMetricKey;
  label: string;
  now: number;
  prior: number;
  delta: number;
  deltaPct: number | null;
  spark: number[];
  alerts: ("regression" | "below_baseline")[];
};

type OpsGroupRow = {
  id: string;
  name: string;
  metrics: Partial<Record<OpsMetricKey, { now: number; prior: number; delta: number; deltaPct: number | null; spark: number[] }>>;
  total: { now: number; prior: number; delta: number; deltaPct: number | null };
  alerts: ("regression" | "below_baseline")[];
};

type OpsResponse = {
  window:   { from: string; to: string; label: string };
  prior:    { from: string; to: string; label: string };
  baseline: { from: string; to: string; label: string };
  metrics: OpsMetricRow[];
  byDomain: OpsGroupRow[];
  byCluster: OpsGroupRow[];
  hero: {
    overallNow: number;
    overallPrior: number;
    overallDelta: number;
    overallDeltaPct: number | null;
    topGainer:    { id: string; name: string; deltaPct: number | null; kind: "domain" | "cluster" } | null;
    topRegressor: { id: string; name: string; deltaPct: number | null; kind: "domain" | "cluster" } | null;
  };
};

// ── Picker options ───────────────────────────────────────────────────────────

type PeriodKey =
  | "this_week" | "last_week"
  | "this_month" | "last_month"
  | "this_quarter"
  | "last_7d" | "last_30d"
  | "custom";

const PERIOD_OPTIONS: { key: PeriodKey; label: string; sublabel: string }[] = [
  { key: "this_week",    label: "This week",    sublabel: "vs last week" },
  { key: "last_week",    label: "Last week",    sublabel: "vs week before" },
  { key: "this_month",   label: "This month",   sublabel: "vs last month" },
  { key: "last_month",   label: "Last month",   sublabel: "vs month before" },
  { key: "this_quarter", label: "This quarter", sublabel: "vs last quarter" },
  { key: "last_7d",      label: "Last 7 days",  sublabel: "vs prior 7d" },
  { key: "last_30d",     label: "Last 30 days", sublabel: "vs prior 30d" },
  { key: "custom",       label: "Custom range", sublabel: "vs matched prior" },
];

const METRIC_ICON: Record<OpsMetricKey, typeof Target> = {
  pitstop: Target,
  activity: CalendarDays,
  checklist: CheckSquare,
  goal: Target,
  followup: ListChecks,
};

type UserRef = { id: string; name: string | null; image: string | null; designation?: string };

/**
 * Operations Progress tab for the dashboard. PM/Leader/admin only.
 *
 * Compares the chosen period against the equal-duration prior window, with a
 * trailing 90d baseline used for the "below_baseline" absolute alert. Every
 * filter (period, owner, geo, domain) applies to the hero + every panel.
 *
 * Goal/Pitstop slicers are honoured if passed via URL but no in-tab picker
 * for them — that drill-down lives on the existing goal/pitstop pages. Same
 * for settlement (centre) where a top-level dropdown isn't valuable at this
 * scale.
 */
export function OperationsTab({
  currentUserId, users,
}: {
  currentUserId: string;
  users: UserRef[];
}) {
  // ── State ────────────────────────────────────────────────────────────────
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [domain, setDomain] = useState<string>("");
  const [cityId, setCityId] = useState<string>("");
  const [zoneId, setZoneId] = useState<string>("");
  const [clusterId, setClusterId] = useState<string>("");
  const [resp, setResp] = useState<OpsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo)) return;

    let abort = false;
    setLoading(true);
    setErr(null);

    const qs = new URLSearchParams();
    qs.set("period", period);
    if (period === "custom") { qs.set("from", customFrom); qs.set("to", customTo); }
    if (ownerIds.length > 0) qs.set("userIds", ownerIds.join(","));
    if (domain)              qs.set("domain", domain);
    if (cityId)              qs.set("cityId", cityId);
    if (zoneId)              qs.set("zoneId", zoneId);
    if (clusterId)           qs.set("clusterId", clusterId);

    fetch(`/api/ops-progress?${qs.toString()}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Couldn't load operations progress");
        return (await r.json()) as OpsResponse;
      })
      .then(d => { if (!abort) setResp(d); })
      .catch(e => { if (!abort) setErr(e instanceof Error ? e.message : "Couldn't load"); })
      .finally(() => { if (!abort) setLoading(false); });

    return () => { abort = true; };
  }, [period, customFrom, customTo, ownerIds, domain, cityId, zoneId, clusterId]);

  const periodSub = PERIOD_OPTIONS.find(p => p.key === period)?.sublabel ?? "";
  const hasActiveFilters = Boolean(domain || cityId || zoneId || clusterId || ownerIds.length > 0);

  // ── Derive selector universes from response (avoids extra round trips) ───
  const domains  = useMemo(() => uniq(resp?.byDomain.map(d => d.id) ?? [], x => x !== "—"), [resp]);
  const clusters = useMemo(() => (resp?.byCluster ?? []).map(c => ({ id: c.id, name: c.name })), [resp]);

  return (
    <div className="space-y-6">
      {/* ── Filters strip ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as PeriodKey)}
            className="text-sm border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            {PERIOD_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <span className="text-[11px] text-stone-400">{periodSub}</span>

          {period === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-sm border border-stone-200 rounded-md px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300" />
              <span className="text-[11px] text-stone-400">→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-sm border border-stone-200 rounded-md px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300" />
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setOwnerPickerOpen(v => !v)}
              className={`text-sm border rounded-md px-2.5 py-1.5 transition-colors ${
                ownerIds.length > 0 ? "border-sky-300 bg-sky-50 text-sky-800" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
              }`}
            >
              {ownerIds.length === 0 ? "All owners" : `${ownerIds.length} owner${ownerIds.length === 1 ? "" : "s"}`}
            </button>
            {ownerPickerOpen && (
              <OwnerPicker
                users={users}
                selectedIds={ownerIds}
                currentUserId={currentUserId}
                onToggle={id => setOwnerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                onClear={() => setOwnerIds([])}
                onClose={() => setOwnerPickerOpen(false)}
              />
            )}
          </div>

          {domains.length > 0 && (
            <select value={domain} onChange={e => setDomain(e.target.value)}
              className="text-sm border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300">
              <option value="">All domains</option>
              {domains.map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
            </select>
          )}

          {/* City / Zone / Cluster — populate from a small dictionary fetch.
              For now expose the cluster dropdown derived from the current
              response; city/zone are URL-driven. */}
          {clusters.length > 0 && (
            <select value={clusterId} onChange={e => setClusterId(e.target.value)}
              className="text-sm border border-stone-200 rounded-md px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-300">
              <option value="">All clusters</option>
              {clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {hasActiveFilters && (
            <button type="button"
              onClick={() => { setDomain(""); setCityId(""); setZoneId(""); setClusterId(""); setOwnerIds([]); }}
              className="text-xs text-stone-500 hover:text-stone-800 underline">
              Clear
            </button>
          )}

          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400 ml-auto" />}
        </div>
      </div>

      {err && (
        <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {err}
        </div>
      )}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      {resp && <HeroLine resp={resp} />}

      {/* ── Activity (metrics) ──────────────────────────────────────────── */}
      {resp && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Activity — {resp.window.label} vs {resp.prior.label}
          </h3>
          <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-stone-50 border-b border-stone-100 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
              <div className="col-span-4">Metric</div>
              <div className="col-span-2 text-right">Now</div>
              <div className="col-span-2 text-right">Prior</div>
              <div className="col-span-2 text-right">Δ</div>
              <div className="col-span-2">Trend</div>
            </div>
            {resp.metrics.map(m => <MetricRow key={m.key} row={m} />)}
          </div>
        </section>
      )}

      {/* ── By domain ───────────────────────────────────────────────────── */}
      {resp && resp.byDomain.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
            By domain
          </h3>
          <GroupTable rows={resp.byDomain} kind="domain" />
        </section>
      )}

      {/* ── By cluster ──────────────────────────────────────────────────── */}
      {resp && resp.byCluster.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
            By cluster <span className="text-[10px] text-stone-400 font-normal normal-case">(top 5 movers + bottom 3)</span>
          </h3>
          <GroupTable rows={topMovers(resp.byCluster)} kind="cluster" />
        </section>
      )}

      {resp && resp.hero.overallNow === 0 && resp.hero.overallPrior === 0 && (
        <div className="text-center py-12 text-sm text-stone-400">
          No activity in this window. Try a wider period or clear filters.
        </div>
      )}
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function HeroLine({ resp }: { resp: OpsResponse }) {
  const dp = resp.hero.overallDeltaPct;
  const positive = dp !== null && dp > 0;
  const negative = dp !== null && dp < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Sparkles;
  const tone = positive ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
    : negative ? "border-amber-200 bg-amber-50/60 text-amber-900"
    : "border-stone-200 bg-stone-50 text-stone-700";

  // Compose the sentence.
  const overallSentence = (() => {
    if (resp.hero.overallNow === 0 && resp.hero.overallPrior === 0) return "No activity to compare yet.";
    if (dp === null) return `${resp.hero.overallNow} completions in ${resp.window.label}. Prior window had nothing to compare against.`;
    const sign = dp > 0 ? "+" : "";
    return `${resp.window.label}: ${sign}${dp.toFixed(1)}% execution vs ${resp.prior.label} (${resp.hero.overallNow} now, ${resp.hero.overallPrior} prior).`;
  })();

  const gainerSentence = resp.hero.topGainer && resp.hero.topGainer.deltaPct !== null
    ? `${resp.hero.topGainer.name} up ${resp.hero.topGainer.deltaPct.toFixed(1)}% (top gainer).`
    : null;
  const regressorSentence = resp.hero.topRegressor && resp.hero.topRegressor.deltaPct !== null
    ? `${resp.hero.topRegressor.name} down ${Math.abs(resp.hero.topRegressor.deltaPct).toFixed(1)}% (regression).`
    : null;

  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex items-start gap-2.5">
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold leading-snug">{overallSentence}</p>
          {(gainerSentence || regressorSentence) && (
            <p className="text-xs mt-1 opacity-80">
              {gainerSentence}{gainerSentence && regressorSentence && " "}{regressorSentence}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricRow({ row }: { row: OpsMetricRow }) {
  const Icon = METRIC_ICON[row.key];
  const dp = row.deltaPct;
  const positive = row.delta > 0;
  const negative = row.delta < 0;
  return (
    <div className="grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-stone-100 last:border-b-0 items-center text-sm">
      <div className="col-span-4 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-stone-400" />
        <span className="font-medium text-stone-800">{row.label}</span>
        {row.alerts.length > 0 && <AlertChips alerts={row.alerts} />}
      </div>
      <div className="col-span-2 text-right tabular-nums font-semibold text-stone-900">{row.now}</div>
      <div className="col-span-2 text-right tabular-nums text-stone-500">{row.prior}</div>
      <div className={`col-span-2 text-right tabular-nums font-medium ${
        positive ? "text-emerald-700" : negative ? "text-amber-700" : "text-stone-500"
      }`}>
        {positive ? "+" : ""}{row.delta}
        {dp !== null && <span className="text-[10px] text-stone-400 ml-1">({dp > 0 ? "+" : ""}{dp.toFixed(0)}%)</span>}
      </div>
      <div className="col-span-2"><Sparkline values={row.spark} /></div>
    </div>
  );
}

function GroupTable({ rows, kind }: { rows: OpsGroupRow[]; kind: "domain" | "cluster" }) {
  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-stone-50 border-b border-stone-100 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
        <div className="col-span-5">{kind === "domain" ? "Domain" : "Cluster"}</div>
        <div className="col-span-2 text-right">Now</div>
        <div className="col-span-2 text-right">Prior</div>
        <div className="col-span-1 text-right">Δ</div>
        <div className="col-span-2">Trend</div>
      </div>
      {rows.map(r => {
        const positive = r.total.delta > 0;
        const negative = r.total.delta < 0;
        // Pull a representative spark from the totals — sum across metrics, bucketed.
        const spark = sumSparks(r);
        return (
          <div key={r.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-stone-100 last:border-b-0 items-center text-sm">
            <div className="col-span-5 flex items-center gap-1.5 min-w-0">
              <span className="font-medium text-stone-800 truncate">{kind === "domain" ? r.name.replace(/_/g, " ") : r.name}</span>
              {r.alerts.length > 0 && <AlertChips alerts={r.alerts} />}
            </div>
            <div className="col-span-2 text-right tabular-nums font-semibold text-stone-900">{r.total.now}</div>
            <div className="col-span-2 text-right tabular-nums text-stone-500">{r.total.prior}</div>
            <div className={`col-span-1 text-right tabular-nums font-medium ${
              positive ? "text-emerald-700" : negative ? "text-amber-700" : "text-stone-500"
            }`}>
              {positive ? "+" : ""}{r.total.delta}
            </div>
            <div className="col-span-2"><Sparkline values={spark} /></div>
          </div>
        );
      })}
    </div>
  );
}

function AlertChips({ alerts }: { alerts: ("regression" | "below_baseline")[] }) {
  return (
    <span className="flex items-center gap-1">
      {alerts.includes("regression") && (
        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
          regressed
        </span>
      )}
      {alerts.includes("below_baseline") && (
        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-800" title="Current daily rate is < 50% of the trailing 90-day baseline">
          below norm
        </span>
      )}
    </span>
  );
}

/**
 * Tiny inline sparkline. Static SVG, scaled to the bucket counts. No animation;
 * the chart is descriptive, not the focus.
 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const w = 60;
  const h = 18;
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * (h - 2) - 1).toFixed(2)}`).join(" ");
  // Solid sky stroke if there's any data; muted otherwise.
  const stroke = values.some(v => v > 0) ? "#0ea5e9" : "#d6d3d1";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Owner picker — small dropdown with checkbox rows. Closes on outside click.
 */
function OwnerPicker({
  users, selectedIds, currentUserId, onToggle, onClear, onClose,
}: {
  users: UserRef[];
  selectedIds: string[];
  currentUserId: string;
  onToggle: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-owner-picker]")) onClose();
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [onClose]);

  // Show self first, then alpha.
  const ordered = [...users].sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return (
    <div data-owner-picker className="absolute left-0 top-full mt-1 z-20 min-w-[240px] bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-stone-100 bg-stone-50">
        <p className="text-[10px] text-stone-500 uppercase tracking-wider">Owners</p>
        <button onClick={onClear} className="text-[11px] text-sky-600 hover:underline">All</button>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {ordered.map(u => {
          const checked = selectedIds.includes(u.id);
          const isSelf = u.id === currentUserId;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onToggle(u.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-stone-50 text-left"
            >
              <span className={`w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center ${
                checked ? "bg-sky-500 border-sky-500" : "border-stone-300 bg-white"
              }`}>
                {checked && (
                  <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-stone-700">{u.name ?? "—"}{isSelf && <span className="text-stone-400"> (you)</span>}</span>
                {u.designation && (
                  <span className="block text-[10px] text-stone-400">{u.designation}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────

function uniq<T>(arr: T[], pred: (x: T) => boolean = () => true): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) if (!seen.has(x) && pred(x)) { seen.add(x); out.push(x); }
  return out;
}

/** Top 5 by positive delta + bottom 3 by negative delta. Deduplicates if a row appears in both. */
function topMovers(rows: OpsGroupRow[]): OpsGroupRow[] {
  const top = [...rows].sort((a, b) => b.total.delta - a.total.delta).slice(0, 5);
  const bot = [...rows].sort((a, b) => a.total.delta - b.total.delta).slice(0, 3);
  const seen = new Set<string>();
  const out: OpsGroupRow[] = [];
  for (const r of [...top, ...bot]) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
  return out;
}

/**
 * Sum sparkline buckets across metrics for a group row — gives one combined
 * trend line per row instead of cluttering with one line per metric.
 */
function sumSparks(g: OpsGroupRow): number[] {
  const keys: OpsMetricKey[] = ["pitstop", "activity", "checklist", "goal", "followup"];
  const sparks = keys.map(k => g.metrics[k]?.spark).filter(Boolean) as number[][];
  if (sparks.length === 0) return [];
  const len = Math.max(...sparks.map(s => s.length));
  const out = new Array(len).fill(0);
  for (const s of sparks) for (let i = 0; i < s.length; i++) out[i] += s[i];
  return out;
}
