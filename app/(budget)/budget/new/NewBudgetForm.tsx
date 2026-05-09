"use client";

import { useState, useTransition } from "react";
import { createBudget, type CreateBudgetPayload } from "../actions";
import type { CustomProgrammeInput, DomainOption } from "./page";

// Fallback domains shown if none are configured in DB yet
const FALLBACK_DOMAINS: DomainOption[] = [
  { key: "Children",     label: "Children",                    description: "CLCs, after-school, camps",           city: "Bangalore" },
  { key: "Youth",        label: "Youth",                       description: "YRCs, Yuva Adda, sports",             city: "Bangalore" },
  { key: "Elderly",      label: "Elderly + Community Kitchen", description: "Day care, nutrition, community kitchen",city: "Bangalore" },
  { key: "WelfareRights",label: "Welfare Rights",              description: "Entitlement & collectivization",       city: "Bangalore" },
  { key: "Creche",       label: "Creche",                      description: "0–3 yr children, APF standard model", city: "Bangalore" },
];

export default function NewBudgetForm({
  customInputs = [],
  domains: allDomains = [],
}: {
  customInputs?: CustomProgrammeInput[];
  domains?: DomainOption[];
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [years, setYears] = useState<1 | 3>(1);
  const [city, setCity] = useState<"Bangalore" | "Chennai">("Bangalore");
  const [name, setName] = useState("");
  const [inputs, setInputs] = useState({
    nSettlements: 0, nClusters: 0,
    nCLCs: 0, clcRentPerMonth: 0,
    nYRCs: 0, yrcRentPerMonth: 0,
    nElderlyCentres: 0, nElderly: 0, elderlyCentreRentPerMonth: 0,
    cosPerCluster: 2, rcRentPerMonth: 0,
    nCreches: 0, crecheRentPerMonth: 0,
  });
  const [extraInputs, setExtraInputs] = useState<Record<string, number>>(
    () => Object.fromEntries(customInputs.map(c => [c.key, c.defaultValue]))
  );
  const [pending, startTransition] = useTransition();

  // Domains for the currently selected city
  const cityDomains = allDomains.length > 0
    ? allDomains.filter(d => d.city === city)
    : FALLBACK_DOMAINS.filter(d => d.city === city || city === "Bangalore");

  const toggle = (key: string) => setSelectedDomains(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const num = (field: keyof typeof inputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInputs(prev => ({ ...prev, [field]: parseInt(e.target.value) || 0 }));

  const numExtra = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setExtraInputs(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }));

  const canProceed = name.trim() && selectedDomains.size > 0;

  const submit = () => {
    startTransition(async () => {
      const payload: CreateBudgetPayload = {
        name: name.trim(),
        city,
        domains: Array.from(selectedDomains),
        years,
        ...inputs,
        extraInputs: Object.keys(extraInputs).length > 0 ? extraInputs : undefined,
      };
      await createBudget(payload);
    });
  };

  // Standard domain-specific input sections keyed by domain key
  const hasChildren     = selectedDomains.has("Children");
  const hasYouth        = selectedDomains.has("Youth");
  const hasElderly      = selectedDomains.has("Elderly");
  const hasWelfareRights= selectedDomains.has("WelfareRights");
  const hasCreche       = selectedDomains.has("Creche");

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-6">
      {step === 1 && (
        <>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Budget name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. ActionAid FY26-27 Proposal"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">City</label>
            <div className="flex gap-3">
              {(["Bangalore", "Chennai"] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCity(c); setSelectedDomains(new Set()); }}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    city === c ? "border-sky-500 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-700 hover:border-stone-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Domains</label>
            <div className="grid grid-cols-1 gap-2">
              {cityDomains.map(d => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggle(d.key)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedDomains.has(d.key)
                      ? "border-sky-500 bg-sky-50"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    selectedDomains.has(d.key) ? "border-sky-500 bg-sky-500" : "border-stone-300"
                  }`}>
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
            <label className="block text-sm font-medium text-stone-700 mb-2">Budget period</label>
            <div className="flex gap-3">
              {([1, 3] as const).map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYears(y)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    years === y ? "border-sky-500 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-700 hover:border-stone-300"
                  }`}
                >
                  {y === 1 ? "1 Year" : "3 Years (with inflation)"}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!canProceed}
            onClick={() => setStep(2)}
            className="w-full bg-sky-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
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

          {/* Common inputs */}
          <Section title="Programme scale">
            <Field label="No. of settlements" value={inputs.nSettlements} onChange={num("nSettlements")} />
            <Field label="No. of clusters" value={inputs.nClusters} onChange={num("nClusters")} />
          </Section>

          {hasChildren && (
            <Section title="Children">
              <Field label="No. of CLCs (Children Learning Centres)" value={inputs.nCLCs} onChange={num("nCLCs")} />
              <Field label="CLC rent per month (₹)" value={inputs.clcRentPerMonth} onChange={num("clcRentPerMonth")} hint="Enter 0 if not paying rent" />
            </Section>
          )}

          {hasYouth && (
            <Section title="Youth">
              <Field label="No. of YRCs (Youth Resource Centres)" value={inputs.nYRCs} onChange={num("nYRCs")} />
              <Field label="YRC rent per month (₹)" value={inputs.yrcRentPerMonth} onChange={num("yrcRentPerMonth")} hint="Enter 0 if not paying rent" />
            </Section>
          )}

          {hasElderly && (
            <Section title="Elderly + Community Kitchen">
              <Field label="No. of elderly centres / kitchens" value={inputs.nElderlyCentres} onChange={num("nElderlyCentres")} />
              <Field label="No. of elderly beneficiaries (total)" value={inputs.nElderly} onChange={num("nElderly")} hint="All centres combined" />
              <Field label="Centre rent per month (₹)" value={inputs.elderlyCentreRentPerMonth} onChange={num("elderlyCentreRentPerMonth")} hint="Enter 0 if not paying rent" />
            </Section>
          )}

          {hasWelfareRights && (
            <Section title="Welfare Rights">
              <Field label="COs per cluster" value={inputs.cosPerCluster} onChange={num("cosPerCluster")} hint="2 or 3 community organisers per cluster" />
              <Field label="Resource Centre rent per month (₹)" value={inputs.rcRentPerMonth} onChange={num("rcRentPerMonth")} hint="Enter 0 if not paying rent" />
            </Section>
          )}

          {hasCreche && (
            <Section title="Creche">
              <Field label="No. of creches" value={inputs.nCreches} onChange={num("nCreches")} />
              <Field label="Creche rent per month (₹)" value={inputs.crecheRentPerMonth} onChange={num("crecheRentPerMonth")} hint="Standard APF rate is ₹10,000/month" />
            </Section>
          )}

          {customInputs.filter(c => c.city === city).length > 0 && (
            <Section title="Additional programme inputs">
              {customInputs.filter(c => c.city === city).map(c => (
                <Field
                  key={c.key}
                  label={c.label}
                  value={extraInputs[c.key] ?? c.defaultValue}
                  onChange={numExtra(c.key)}
                  hint={c.unit !== "count" ? `Unit: ${c.unit}` : undefined}
                />
              ))}
            </Section>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="w-full bg-sky-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-60"
          >
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

function Field({ label, value, onChange, hint }: { label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <label className="block text-sm text-stone-700">{label}</label>
        {hint && <p className="text-xs text-stone-400">{hint}</p>}
      </div>
      <input
        type="number"
        value={value || ""}
        onChange={onChange}
        min={0}
        className="w-28 border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
        placeholder="0"
      />
    </div>
  );
}
