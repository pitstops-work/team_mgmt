"use client";

import { useState, useTransition } from "react";
import { createBudget } from "../actions";
import type { DomainOption, DomainInputField } from "./page";

const FALLBACK_DOMAINS: DomainOption[] = [
  { key: "Children",     label: "Children",                    description: "CLCs, after-school, camps",            city: "Bangalore", inputs: [] },
  { key: "Youth",        label: "Youth",                       description: "YRCs, Yuva Adda, sports",              city: "Bangalore", inputs: [] },
  { key: "Elderly",      label: "Elderly + Community Kitchen", description: "Day care, nutrition, community kitchen", city: "Bangalore", inputs: [] },
  { key: "WelfareRights",label: "Welfare Rights",              description: "Entitlement & collectivization",        city: "Bangalore", inputs: [] },
  { key: "Creche",       label: "Creche",                      description: "0–3 yr children, standard model",  city: "Bangalore", inputs: [] },
];

const FALLBACK_CROSS_CUTTING: DomainInputField[] = [
  { key: "nSettlements", label: "No. of settlements", unit: "count", defaultValue: 0, isRent: false },
  { key: "nClusters",    label: "No. of clusters",    unit: "count", defaultValue: 0, isRent: false },
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
}: {
  domains?: DomainOption[];
  crossCuttingInputs?: DomainInputField[];
}) {
  const effectiveDomains     = allDomains.length > 0     ? allDomains     : FALLBACK_DOMAINS;
  const effectiveCrossCutting = allCrossCutting.length > 0 ? allCrossCutting : FALLBACK_CROSS_CUTTING;

  const [step, setStep]       = useState<1 | 2>(1);
  const [city, setCity]       = useState<"Bangalore" | "Chennai">("Bangalore");
  const [name, setName]       = useState("");
  const [years, setYears]     = useState<1 | 3>(1);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [includeCrossCutting, setIncludeCrossCutting] = useState(true);
  const [programmeInputs, setProgrammeInputs] = useState<Record<string, number>>(() =>
    initInputs(effectiveCrossCutting, effectiveDomains)
  );
  const [pending, startTransition] = useTransition();

  const cityDomains = effectiveDomains.filter(d => d.city === city);

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
      await createBudget({ name: name.trim(), city, domains: Array.from(selectedDomains), years, programmeInputs, includeCrossCutting });
    });
  };

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
            <div className="flex gap-3">
              {([1, 3] as const).map(y => (
                <button key={y} type="button" onClick={() => setYears(y)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${years === y ? "border-sky-500 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-700 hover:border-stone-300"}`}>
                  {y === 1 ? "1 Year" : "3 Years (with inflation)"}
                </button>
              ))}
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
            Enter the scale of your programme. All costs will be auto-calculated from these inputs. Salary rows will be left blank for you to fill.
          </p>

          {effectiveCrossCutting.length > 0 && (
            <Section title="Programme scale">
              {effectiveCrossCutting.map(f => (
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
