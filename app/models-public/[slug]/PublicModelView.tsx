"use client";

// Public read-only sim viewer. Slim left rail of sliders (sim-surface nodes only,
// Basic/Advanced toggle preserved) + the OperationsSim on the right. Slider
// changes update local state only — never written back. The `?embed=1` query
// hides the header + about panel + footer for clean iframe embedding.

import { useMemo, useState } from "react";
import { compute } from "@/lib/models/engine";
import type { DaySimConfig, InstanceInputs, ModelNode, ModelTemplate, NodeValue } from "@/lib/models/types";
import OperationsSim from "@/app/(app)/models/[id]/OperationsSim";

type SimTier = "basic" | "advanced";

export default function PublicModelView({
  instanceName, scenarioName, template, initialInputs, embed,
}: {
  instanceName: string;
  scenarioName: string | null;
  template: ModelTemplate;
  initialInputs: InstanceInputs;
  embed: boolean;
}) {
  const [inputs, setInputs] = useState<InstanceInputs>(initialInputs);
  const [simTier, setSimTier] = useState<SimTier>("basic");
  // On mobile the sim is the hero; sliders collapse behind a button so the
  // schematic + cards aren't pushed off-screen by a 340px rail. Default closed.
  // Desktop (lg+) ignores this — the rail is always visible side-by-side.
  const [showInputsMobile, setShowInputsMobile] = useState(false);

  const result = useMemo(() => compute(template, inputs), [template, inputs]);
  const daySimConfig = useMemo<DaySimConfig | null>(() => {
    const out = template.outputs.find(o => o.kind === "daySim");
    return out ? (out.config as DaySimConfig) : null;
  }, [template.outputs]);

  const groupsByKey = useMemo(() => Object.fromEntries(template.groups.map(g => [g.key, g])), [template.groups]);
  const effSurface = (n: ModelNode): "finance" | "sim" | "both" => {
    if (n.surface && n.surface !== "both") return n.surface;
    const gs = groupsByKey[n.groupKey ?? ""]?.surface;
    if (gs && gs !== "both") return gs;
    return "both";
  };
  // Sim-surface inputs only. Basic/Advanced toggle hides tier="advanced" nodes
  // by default — same convention as the authenticated workbench.
  const inputNodes = template.nodes.filter(n => {
    if (n.kind !== "input" && n.kind !== "constant") return false;
    const es = effSurface(n);
    if (es !== "both" && es !== "sim") return false;
    if (simTier === "basic" && n.tier === "advanced") return false;
    return true;
  });
  const inputsByGroup = inputNodes.reduce<Record<string, typeof inputNodes>>((acc, n) => {
    const k = n.groupKey ?? "__ungrouped";
    (acc[k] = acc[k] ?? []).push(n);
    return acc;
  }, {});
  const orderedGroupKeys = [
    ...template.groups.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(g => g.key),
    ...(inputsByGroup.__ungrouped ? ["__ungrouped"] : []),
  ].filter(k => inputsByGroup[k]?.length);

  const setInputVal = (key: string, raw: string) => {
    if (raw === "") { const next = { ...inputs }; delete next[key]; setInputs(next); return; }
    const n = Number(raw);
    if (Number.isFinite(n)) setInputs({ ...inputs, [key]: n });
  };
  const resetInputs = () => setInputs(initialInputs);

  return (
    <div className="min-h-screen bg-stone-50">
      {!embed && (
        <header className="border-b border-stone-200 bg-white">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="font-semibold text-stone-900 text-lg">{template.name}</h1>
              <p className="text-xs text-stone-500 mt-0.5">
                {instanceName}{scenarioName ? ` · ${scenarioName}` : ""}{" "}
                <span className="text-stone-400">· live operational model · sliders update locally</span>
              </p>
            </div>
            <a href="https://pitstops.work" className="text-xs text-stone-400 hover:text-stone-600">pitstops.work →</a>
          </div>
        </header>
      )}

      <div className={`lg:flex ${embed ? "lg:h-screen" : "lg:h-[calc(100vh-72px)]"}`}>
        <aside className="lg:w-[340px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-stone-200 bg-white lg:overflow-y-auto">
          {/* Mobile-only toggle bar — taps to open/close the slider rail */}
          <button
            onClick={() => setShowInputsMobile(s => !s)}
            className="lg:hidden w-full px-5 py-3 text-sm font-semibold text-stone-700 flex items-center justify-between border-b border-stone-100 active:bg-stone-50"
          >
            <span>{showInputsMobile ? "Hide parameters" : "Adjust parameters"}</span>
            <span className="text-xs text-stone-400">{showInputsMobile ? "▲" : "▼"}</span>
          </button>
          {/* Tier toggle + Reset — always visible on desktop, only when expanded on mobile */}
          <div className={`${showInputsMobile ? "flex" : "hidden"} lg:flex px-5 py-4 border-b border-stone-200 lg:sticky lg:top-0 bg-white z-10 items-center justify-between`}>
            <div className="inline-flex rounded-md bg-stone-100 p-0.5">
              <button onClick={() => setSimTier("basic")} className={tierBtn(simTier === "basic")}>Basic</button>
              <button onClick={() => setSimTier("advanced")} className={tierBtn(simTier === "advanced")}>Advanced</button>
            </div>
            <button onClick={resetInputs} className="text-xs text-stone-500 hover:text-stone-700">Reset</button>
          </div>
          <div className={`${showInputsMobile ? "block" : "hidden"} lg:block p-4 space-y-5`}>
            {orderedGroupKeys.map(gk => {
              const g = groupsByKey[gk];
              return (
                <div key={gk}>
                  <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                    {g?.label ?? gk}
                  </h3>
                  <div className="space-y-3">
                    {inputsByGroup[gk]!
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                      .map(n => (
                        <NodeField
                          key={n.key}
                          n={n}
                          value={inputs[n.key]}
                          isOverridden={inputs[n.key] !== undefined}
                          onChange={raw => setInputVal(n.key, raw)}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 lg:overflow-y-auto p-4 sm:p-6">
          {daySimConfig ? (
            <OperationsSim config={daySimConfig} values={result.values} />
          ) : (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
              This model has no operations simulation configured.
            </div>
          )}
          {!embed && template.description && (
            <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-700 mb-2">About this model</h2>
              <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">{template.description}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function tierBtn(active: boolean) {
  return `px-2.5 py-0.5 text-[11px] rounded ${active ? "bg-white shadow text-stone-900" : "text-stone-500 hover:text-stone-700"}`;
}

function NodeField({ n, value, isOverridden, onChange }: {
  n: ModelNode;
  value: NodeValue | undefined;
  isOverridden: boolean;
  onChange: (raw: string) => void;
}) {
  const displayVal = value !== undefined ? value : (n.default ?? "");
  const slider = !!n.ui;
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-stone-700 truncate" title={n.label}>{n.label}</span>
        {n.unit && <span className="text-xs text-stone-400 shrink-0">{n.unit}</span>}
      </div>
      {slider && n.ui ? (
        <div className="mt-1 flex items-center gap-2">
          <input
            type="range"
            min={n.ui.min}
            max={n.ui.max}
            step={n.ui.step ?? "any"}
            value={Number(displayVal)}
            onChange={e => onChange(e.target.value)}
            className="flex-1 accent-sky-500"
          />
          <input
            type="number"
            step={n.ui.step ?? "any"}
            value={String(displayVal)}
            onChange={e => onChange(e.target.value)}
            className={`w-20 px-2 py-1 rounded-md border text-sm text-right tabular-nums ${
              isOverridden ? "border-amber-300 bg-amber-50" : "border-stone-200"
            } focus:border-sky-400 focus:ring-1 focus:ring-sky-400 outline-none`}
          />
        </div>
      ) : (
        <input
          type="number"
          step="any"
          value={String(displayVal)}
          onChange={e => onChange(e.target.value)}
          className={`mt-1 w-full px-3 py-1.5 rounded-md border text-sm ${
            isOverridden ? "border-amber-300 bg-amber-50" : "border-stone-200"
          } focus:border-sky-400 focus:ring-1 focus:ring-sky-400 outline-none`}
        />
      )}
      {n.notes && <p className="text-xs text-stone-400 mt-0.5">{n.notes}</p>}
    </label>
  );
}
