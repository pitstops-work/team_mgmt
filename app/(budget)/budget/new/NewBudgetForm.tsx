"use client";

import { useState, useTransition, useMemo } from "react";
import { createBudget } from "../actions";
import type { DomainOption, DomainInputField, CostItem } from "./page";

const FALLBACK_DOMAINS: DomainOption[] = [
  { key: "Children",     label: "Children",                    description: "CLCs, after-school, camps",            city: "Bangalore", inputs: [] },
  { key: "Youth",        label: "Youth",                       description: "YRCs, Yuva Adda, sports",              city: "Bangalore", inputs: [] },
  { key: "Elderly",      label: "Elderly + Community Kitchen", description: "Day care, nutrition, community kitchen", city: "Bangalore", inputs: [] },
  { key: "WelfareRights",label: "Welfare Rights",              description: "Entitlement & collectivization",        city: "Bangalore", inputs: [] },
  { key: "Creche",       label: "Creche",                      description: "0–3 yr children, standard model",  city: "Bangalore", inputs: [] },
];

// Fallback only used when CostRegistry hasn't been seeded yet. requiredByDomains
// is set to settlement-driven domains so a CLC-only fallback still hides them.
const FALLBACK_CROSS_CUTTING: DomainInputField[] = [
  { key: "nSettlements", label: "No. of settlements", unit: "count", defaultValue: 0, isRent: false, requiredByDomains: ["WelfareRights"] },
  { key: "nClusters",    label: "No. of clusters",    unit: "count", defaultValue: 0, isRent: false, requiredByDomains: ["WelfareRights"] },
];

function initInputs(crossCutting: DomainInputField[], allDomains: DomainOption[]): Record<string, number> {
  const init: Record<string, number> = {};
  for (const f of crossCutting) init[f.key] = f.defaultValue;
  for (const d of allDomains) for (const f of d.inputs) { init[f.key] ??= f.defaultValue; }
  return init;
}

export default function NewBudgetForm({
  domains: allDomains = [],
  crossCuttingInputs: allCrossCutting = [],
  costItems = [],
}: {
  domains?: DomainOption[];
  crossCuttingInputs?: DomainInputField[];
  costItems?: CostItem[];
}) {
  const effectiveDomains     = allDomains.length > 0     ? allDomains     : FALLBACK_DOMAINS;
  const effectiveCrossCutting = allCrossCutting.length > 0 ? allCrossCutting : FALLBACK_CROSS_CUTTING;

  const [step, setStep]       = useState<1 | 2>(1);
  const [city, setCity]       = useState<"Bangalore" | "Chennai">("Bangalore");
  const [name, setName]       = useState("");
  // horizonMonths replaces years. Defaults to 12mo; presets cover the typical
  // donor-budget shapes. 60mo is the cap (matches BudgetLine y1..y5 columns).
  const [horizonMonths, setHorizonMonths] = useState<number>(12);
  const [customMonths, setCustomMonths]   = useState<string>("");
  // Where the pro-rated stub sits when the horizon isn't whole years.
  const [partialPosition, setPartialPosition] = useState<"start" | "end">("end");
  const [applyInflation, setApplyInflation] = useState<boolean>(false);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [includeCrossCutting, setIncludeCrossCutting] = useState(true);
  const [programmeInputs, setProgrammeInputs] = useState<Record<string, number>>(() =>
    initInputs(effectiveCrossCutting, effectiveDomains)
  );
  // "standard" → costOverrides stays empty, generator reads the live registry.
  // "customize" → form shows the per-domain unit-cost + ratio accordion and
  // collects sparse overrides keyed by CostRegistry.itemKey.
  const [costMode, setCostMode]           = useState<"standard" | "customize">("standard");
  const [costOverrides, setCostOverrides] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();

  const cityDomains = effectiveDomains.filter(d => d.city === city);

  // Cross-cutting inputs only show when at least one of their consuming domains
  // is selected. null = always show.
  const visibleCrossCutting = effectiveCrossCutting.filter(f =>
    f.requiredByDomains === null
    || f.requiredByDomains.some(d => selectedDomains.has(d))
  );

  const toggle = (key: string) => setSelectedDomains(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const setNum = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setProgrammeInputs(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }));

  const canProceed = name.trim() && selectedDomains.size > 0;

  const submit = () => {
    startTransition(async () => {
      await createBudget({
        name: name.trim(), city, domains: Array.from(selectedDomains),
        horizonMonths, partialPosition, applyInflation,
        programmeInputs, includeCrossCutting,
        // Pass only when customising. Server snapshots the full registry either
        // way and merges this delta on top.
        costOverrides: costMode === "customize" ? costOverrides : {},
      });
    });
  };

  // Customise accordion: group costItems by domain (selected ones + cross-cutting),
  // then split each domain into cost vs ratio rows. Recomputes when selection
  // changes so the accordion only ever exposes relevant lines.
  const customisableGroups = useMemo(() => {
    if (costMode !== "customize") return [];
    type Group = { label: string; domain: string | null; costs: CostItem[]; ratios: CostItem[] };
    const groups: Group[] = [];
    for (const d of cityDomains) {
      if (!selectedDomains.has(d.key)) continue;
      const items = costItems.filter(c => c.domain === d.key);
      if (items.length === 0) continue;
      groups.push({
        label: d.label, domain: d.key,
        costs:  items.filter(c => c.kind === "cost"),
        ratios: items.filter(c => c.kind === "ratio"),
      });
    }
    if (includeCrossCutting) {
      const items = costItems.filter(c => c.domain === null);
      if (items.length > 0) groups.push({
        label: "Cross-cutting", domain: null,
        costs:  items.filter(c => c.kind === "cost"),
        ratios: items.filter(c => c.kind === "ratio"),
      });
    }
    return groups;
  }, [costMode, cityDomains, selectedDomains, includeCrossCutting, costItems]);

  const overriddenCount = Object.keys(costOverrides).length;
  const setOverride = (key: string, value: number, defaultValue: number) =>
    setCostOverrides(prev => {
      const next = { ...prev };
      // Removing the entry when the user returns to the standard value keeps
      // the persisted overrides sparse — the server merges this onto snapshot.
      if (value === defaultValue) delete next[key];
      else next[key] = value;
      return next;
    });

  const PERIOD_PRESETS = [6, 12, 18, 24, 36, 48, 60] as const;
  const horizonLabel = (m: number) =>
    m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} months`;

  // Collect domain-specific sections for selected domains, deduping shared keys
  const domainSections = () => {
    const seen = new Set<string>(effectiveCrossCutting.map(f => f.key));
    return cityDomains
      .filter(d => selectedDomains.has(d.key))
      .map(d => ({
        label: d.label,
        inputs: d.inputs.filter(f => { if (seen.has(f.key)) return false; seen.add(f.key); return true; }),
      }))
      .filter(s => s.inputs.length > 0);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-6">

      {step === 1 && (
        <>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Budget name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. ActionAid FY26-27 Proposal"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">City</label>
            <div className="flex gap-3">
              {(["Bangalore", "Chennai"] as const).map(c => (
                <button key={c} type="button"
                  onClick={() => { setCity(c); setSelectedDomains(new Set()); }}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${city === c ? "border-sky-500 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-700 hover:border-stone-300"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Domains</label>
            <div className="grid grid-cols-1 gap-2">
              {cityDomains.map(d => (
                <button key={d.key} type="button" onClick={() => toggle(d.key)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${selectedDomains.has(d.key) ? "border-sky-500 bg-sky-50" : "border-stone-200 hover:border-stone-300"}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selectedDomains.has(d.key) ? "border-sky-500 bg-sky-500" : "border-stone-300"}`}>
                    {selectedDomains.has(d.key) && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-stone-900">{d.label}</div>
                    {d.description && <div className="text-xs text-stone-500">{d.description}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <button type="button" onClick={() => setIncludeCrossCutting(p => !p)}
              className="flex items-center gap-3 w-full p-3 rounded-lg border text-left transition-all border-stone-200 hover:border-stone-300">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${includeCrossCutting ? "border-sky-500 bg-sky-500" : "border-stone-300"}`}>
                {includeCrossCutting && <span className="text-white text-xs">✓</span>}
              </div>
              <div>
                <div className="text-sm font-medium text-stone-900">Include cross-cutting lines</div>
                <div className="text-xs text-stone-500">Admin, travel, and other shared cost lines. Uncheck if this is a single-domain budget that doesn't need them.</div>
              </div>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Budget period</label>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              {PERIOD_PRESETS.map(m => {
                const active = horizonMonths === m && customMonths === "";
                return (
                  <button key={m} type="button"
                    onClick={() => { setHorizonMonths(m); setCustomMonths(""); }}
                    className={`py-2 rounded-lg border text-xs font-medium transition-all ${active ? "border-sky-500 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-700 hover:border-stone-300"}`}>
                    {horizonLabel(m)}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-stone-500">Custom (months, max 60):</label>
              <input type="number" min={1} max={60} value={customMonths}
                onChange={e => {
                  const v = e.target.value;
                  setCustomMonths(v);
                  const n = Math.min(60, Math.max(1, parseInt(v) || 0));
                  if (n > 0) setHorizonMonths(n);
                }}
                placeholder="e.g. 21"
                className="w-24 border border-stone-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              <span className="text-xs text-stone-400">
                → {horizonLabel(horizonMonths)}
                {horizonMonths % 12 !== 0 && (
                  <> · {partialPosition === "start" ? "first" : "final"} year pro-rated to {((horizonMonths % 12) / 12 * 100).toFixed(0)}%</>
                )}
              </span>
            </div>
            {horizonMonths % 12 !== 0 && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-stone-500">Pro-rated stub:</span>
                {(["end", "start"] as const).map(pos => (
                  <button key={pos} type="button" onClick={() => setPartialPosition(pos)}
                    className={`text-xs rounded-full px-3 py-1 border ${partialPosition === pos
                      ? "border-sky-500 bg-sky-50 text-sky-700"
                      : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                    {pos === "end" ? "Final year (default)" : "Year 1 (mid-year start)"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Inflation</label>
            <button type="button" onClick={() => setApplyInflation(p => !p)}
              className="flex items-center gap-3 w-full p-3 rounded-lg border text-left transition-all border-stone-200 hover:border-stone-300">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${applyInflation ? "border-sky-500 bg-sky-500" : "border-stone-300"}`}>
                {applyInflation && <span className="text-white text-xs">✓</span>}
              </div>
              <div>
                <div className="text-sm font-medium text-stone-900">Apply year-on-year inflation</div>
                <div className="text-xs text-stone-500">Salary 10% · Other 5% · Nil 0% per year. Uncheck to keep all year-band unit costs at Y1.</div>
              </div>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Unit costs & programme ratios</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(["standard", "customize"] as const).map(m => {
                const active = costMode === m;
                return (
                  <button key={m} type="button" onClick={() => setCostMode(m)}
                    className={`p-3 rounded-lg border text-left transition-all ${active ? "border-sky-500 bg-sky-50" : "border-stone-200 hover:border-stone-300"}`}>
                    <div className="text-sm font-medium text-stone-900">
                      {m === "standard" ? "Standard" : "Customize"}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {m === "standard"
                        ? "Use the cost registry rates for your city."
                        : "Override selected unit costs or ratios for this budget only. The registry stays untouched."}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button type="button" disabled={!canProceed} onClick={() => setStep(2)}
            className="w-full bg-sky-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed">
            Next: Enter programme scale →
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <button type="button" onClick={() => setStep(1)} className="text-xs text-stone-400 hover:text-stone-700">← Back</button>

          <p className="text-sm text-stone-500">
            Enter the scale of your programme. Only inputs relevant to your selected domains are shown — pick more domains in step 1 to expand this list. Salary rows will be left blank for you to fill.
          </p>

          {visibleCrossCutting.length > 0 && (
            <Section title="Programme scale">
              {visibleCrossCutting.map(f => (
                <Field key={f.key} label={f.label} value={programmeInputs[f.key] ?? 0} onChange={setNum(f.key)}
                  hint={f.unit !== "count" ? `Unit: ${f.unit}` : undefined} />
              ))}
            </Section>
          )}

          {domainSections().map(({ label, inputs }) => (
            <Section key={label} title={label}>
              {inputs.map(f => (
                <Field key={f.key} label={f.label} value={programmeInputs[f.key] ?? 0} onChange={setNum(f.key)}
                  hint={f.unit !== "count" ? `Unit: ${f.unit}` : undefined} />
              ))}
            </Section>
          ))}

          {costMode === "customize" && customisableGroups.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Costs &amp; ratios (optional)</h3>
                <div className="flex items-center gap-3">
                  {overriddenCount > 0 && (
                    <span className="text-xs text-amber-600">{overriddenCount} overridden</span>
                  )}
                  {overriddenCount > 0 && (
                    <button type="button" onClick={() => setCostOverrides({})}
                      className="text-xs text-stone-400 hover:text-stone-700">Reset all</button>
                  )}
                </div>
              </div>
              <p className="text-xs text-stone-500 mb-2">
                Leave blank to use the standard rate from the cost registry. Edits apply to this budget only.
              </p>
              <div className="space-y-2">
                {customisableGroups.map(g => (
                  <details key={g.domain ?? "cross"} className="bg-stone-50 rounded-lg border border-stone-200 group">
                    <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-stone-700 flex items-center justify-between">
                      <span>{g.label}</span>
                      <span className="text-xs text-stone-400 group-open:hidden">{g.costs.length + g.ratios.length} items</span>
                    </summary>
                    <div className="px-4 pb-3 pt-1 space-y-3">
                      {g.costs.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-1">Unit costs</p>
                          <div className="space-y-1.5">
                            {g.costs.map(c => (
                              <CostField key={c.itemKey} item={c}
                                value={costOverrides[c.itemKey] ?? c.defaultValue}
                                isOverridden={c.itemKey in costOverrides}
                                onChange={v => setOverride(c.itemKey, v, c.defaultValue)} />
                            ))}
                          </div>
                        </div>
                      )}
                      {g.ratios.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-1">Programme ratios</p>
                          <div className="space-y-1.5">
                            {g.ratios.map(c => (
                              <CostField key={c.itemKey} item={c}
                                value={costOverrides[c.itemKey] ?? c.defaultValue}
                                isOverridden={c.itemKey in costOverrides}
                                onChange={v => setOverride(c.itemKey, v, c.defaultValue)} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          <button type="button" onClick={submit} disabled={pending}
            className="w-full bg-sky-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-60">
            {pending ? "Generating budget…" : "Generate budget →"}
          </button>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-3 bg-stone-50 rounded-lg p-4">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, hint }: {
  label: string; value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <label className="block text-sm text-stone-700">{label}</label>
        {hint && <p className="text-xs text-stone-400">{hint}</p>}
      </div>
      <input type="number" value={value || ""} onChange={onChange} min={0}
        className="w-28 border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
        placeholder="0" />
    </div>
  );
}

function CostField({ item, value, isOverridden, onChange }: {
  item: CostItem;
  value: number;
  isOverridden: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <label className="block text-sm text-stone-700 truncate">{item.label}</label>
        <p className="text-xs text-stone-400">
          {item.unit} · standard {item.defaultValue.toLocaleString("en-IN")}
        </p>
      </div>
      <input type="number" min={0} value={value || ""}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={`w-28 border rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-1 ${
          isOverridden
            ? "border-amber-400 bg-amber-50 text-amber-900 focus:ring-amber-500"
            : "border-stone-300 focus:ring-sky-500"
        }`}
        placeholder={String(item.defaultValue)} />
      {isOverridden ? (
        <button type="button" onClick={() => onChange(item.defaultValue)}
          className="text-stone-400 hover:text-stone-700 text-xs w-4 shrink-0" title="Reset to standard">↺</button>
      ) : <span className="w-4 shrink-0" />}
    </div>
  );
}
