"use client";

import { useState } from "react";
import { BarChart2, ChevronDown, ChevronRight, Plus, Trash2, TrendingUp } from "lucide-react";

type MetricFrequency = "Daily" | "Weekly" | "Monthly" | "Quarterly";
type DataPoint = { id: string; value: number; note: string | null; date: string };
type Metric = {
  id: string;
  name: string;
  description: string | null;
  target: number;
  current: number;
  unit: string | null;
  frequency: MetricFrequency;
  dataPoints: DataPoint[];
};

export default function MetricsSection({ goalId }: { goalId: string }) {
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [frequency, setFrequency] = useState<MetricFrequency>("Monthly");
  const [saving, setSaving] = useState(false);
  const [logMetricId, setLogMetricId] = useState<string | null>(null);
  const [logValue, setLogValue] = useState("");
  const [logNote, setLogNote] = useState("");
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const toggle = async () => {
    if (!open && metrics === null) {
      setLoading(true);
      const res = await fetch(`/api/goals/${goalId}/metrics`);
      if (res.ok) setMetrics(await res.json());
      else setMetrics([]);
      setLoading(false);
    }
    setOpen((v) => !v);
  };

  const handleCreate = async () => {
    if (!name.trim() || !target) return;
    setSaving(true);
    const res = await fetch(`/api/goals/${goalId}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), target: parseFloat(target), unit: unit.trim() || null, frequency }),
    });
    if (res.ok) {
      const m = await res.json();
      setMetrics((prev) => [...(prev ?? []), m]);
      setName(""); setTarget(""); setUnit(""); setFrequency("Monthly"); setShowForm(false);
    }
    setSaving(false);
  };

  const handleLog = async (metricId: string) => {
    if (!logValue) return;
    setLoggingId(metricId);
    const res = await fetch(`/api/goals/${goalId}/metrics/${metricId}/data-points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: parseFloat(logValue), note: logNote.trim() || null, date: new Date().toISOString() }),
    });
    if (res.ok) {
      const dp = await res.json();
      setMetrics((prev) => (prev ?? []).map((m) =>
        m.id === metricId
          ? { ...m, current: parseFloat(logValue), dataPoints: [dp, ...m.dataPoints].slice(0, 5) }
          : m
      ));
      setLogMetricId(null); setLogValue(""); setLogNote("");
    }
    setLoggingId(null);
  };

  const handleDelete = async (metricId: string) => {
    setMetrics((prev) => (prev ?? []).filter((m) => m.id !== metricId));
    await fetch(`/api/goals/${goalId}/metrics/${metricId}`, { method: "DELETE" });
  };

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <button onClick={toggle} className="flex items-center justify-between w-full px-4 py-3 bg-white hover:bg-stone-50 transition-colors">
        <span className="text-sm font-medium text-stone-700 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-stone-400" />
          Metrics / KPIs
          {metrics && metrics.length > 0 && (
            <span className="text-xs text-stone-400">({metrics.length})</span>
          )}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
      </button>

      {open && (
        <div className="border-t border-stone-200 divide-y divide-stone-100">
          <div className="px-4 py-3">
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
                <Plus className="w-3.5 h-3.5" />
                Add metric
              </button>
            ) : (
              <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Metric name…"
                  className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                <div className="flex gap-2">
                  <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target"
                    className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                  <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (e.g. %)"
                    className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value as MetricFrequency)}
                    className="flex-1 px-2 py-1.5 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-400">
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreate} disabled={!name.trim() || !target || saving}
                    className="px-3 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors">
                    {saving ? "Saving…" : "Add"}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-2 py-1 text-xs text-stone-400 hover:text-stone-600">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {loading && <div className="px-4 py-3"><p className="text-xs text-stone-400">Loading…</p></div>}
          {metrics && metrics.length === 0 && !showForm && (
            <div className="px-4 py-3"><p className="text-xs text-stone-400">No metrics yet.</p></div>
          )}
          {metrics && metrics.map((m) => {
            const pct = Math.min(100, Math.round((m.current / m.target) * 100));
            const isLogging = logMetricId === m.id;
            return (
              <div key={m.id} className="px-4 py-3 group">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-stone-800">{m.name}</span>
                      <span className="text-[10px] text-stone-400">{m.frequency}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-semibold text-stone-900">{m.current}{m.unit ? ` ${m.unit}` : ""}</span>
                      <span className="text-xs text-stone-400">/ {m.target}{m.unit ? ` ${m.unit}` : ""}</span>
                      <span className="text-xs font-medium text-sky-600">{pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-400" : pct >= 50 ? "bg-sky-400" : "bg-amber-400"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    {m.dataPoints.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-stone-300" />
                        <span className="text-[10px] text-stone-400">
                          {m.dataPoints.slice(0, 5).map((dp) => dp.value).join(" → ")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLogMetricId(isLogging ? null : m.id)}
                      className="p-1 text-sky-500 hover:text-sky-600 transition-colors" title="Log data point">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(m.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {isLogging && (
                  <div className="flex gap-1 mt-1">
                    <input type="number" value={logValue} onChange={(e) => setLogValue(e.target.value)} placeholder="Value"
                      className="w-20 px-2 py-1 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                    <input value={logNote} onChange={(e) => setLogNote(e.target.value)} placeholder="Note (optional)"
                      className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                    <button onClick={() => handleLog(m.id)} disabled={!logValue || loggingId === m.id}
                      className="px-2 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-md transition-colors">
                      {loggingId === m.id ? "…" : "Log"}
                    </button>
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
