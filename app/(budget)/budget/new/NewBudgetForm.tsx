"use client";

import { useState, useTransition } from "react";
import { createBudget, type CreateBudgetPayload } from "../actions";

const DOMAINS = [
  { id: "Children",     label: "Children",              desc: "CLCs, after-school, camps" },
  { id: "Youth",        label: "Youth",                 desc: "YRCs, Yuva Adda, sports" },
  { id: "Elderly",      label: "Elderly + Community Kitchen", desc: "Day care, nutrition, community kitchen" },
  { id: "WelfareRights",label: "Welfare Rights",        desc: "Entitlement & collectivization" },
  { id: "Creche",       label: "Creche",                desc: "0–3 yr children, APF standard model" },
] as const;

type Domain = typeof DOMAINS[number]["id"];

export default function NewBudgetForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedDomains, setSelectedDomains] = useState<Set<Domain>>(new Set());
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
  const [pending, startTransition] = useTransition();

  const toggle = (d: Domain) => setSelectedDomains(prev => {
    const next = new Set(prev);
    next.has(d) ? next.delete(d) : next.add(d);
    return next;
  });

  const num = (field: keyof typeof inputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInputs(prev => ({ ...prev, [field]: parseInt(e.target.value) || 0 }));

  const canProceed = name.trim() && selectedDomains.size > 0;

  const submit = () => {
    startTransition(async () => {
      const payload: CreateBudgetPayload = {
        name: name.trim(),
        city,
        domains: Array.from(selectedDomains) as CreateBudgetPayload["domains"],
        years,
        ...inputs,
      };
      await createBudget(payload);
    });
  };

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
            <label className="block text-sm font-medium text-stone-700 mb-2">Domains</label>
            <div className="grid grid-cols-1 gap-2">
              {DOMAINS.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle(d.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedDomains.has(d.id)
                      ? "border-sky-500 bg-sky-50"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    selectedDomains.has(d.id) ? "border-sky-500 bg-sky-500" : "border-stone-300"
                  }`}>
                    {selectedDomains.has(d.id) && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-stone-900">{d.label}</div>
                    <div className="text-xs text-stone-500">{d.desc}</div>
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

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">City</label>
            <div className="flex gap-3">
              {(["Bangalore", "Chennai"] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCity(c)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    city === c ? "border-sky-500 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-700 hover:border-stone-300"
                  }`}
                >
                  {c}
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

          {selectedDomains.has("Children") && (
            <Section title="Children">
              <Field label="No. of CLCs (Children Learning Centres)" value={inputs.nCLCs} onChange={num("nCLCs")} />
              <Field label="CLC rent per month (₹)" value={inputs.clcRentPerMonth} onChange={num("clcRentPerMonth")} hint="Enter 0 if not paying rent" />
            </Section>
          )}

          {selectedDomains.has("Youth") && (
            <Section title="Youth">
              <Field label="No. of YRCs (Youth Resource Centres)" value={inputs.nYRCs} onChange={num("nYRCs")} />
              <Field label="YRC rent per month (₹)" value={inputs.yrcRentPerMonth} onChange={num("yrcRentPerMonth")} hint="Enter 0 if not paying rent" />
            </Section>
          )}

          {selectedDomains.has("Elderly") && (
            <Section title="Elderly + Community Kitchen">
              <Field label="No. of elderly centres / kitchens" value={inputs.nElderlyCentres} onChange={num("nElderlyCentres")} />
              <Field label="No. of elderly beneficiaries (total)" value={inputs.nElderly} onChange={num("nElderly")} hint="All centres combined" />
              <Field label="Centre rent per month (₹)" value={inputs.elderlyCentreRentPerMonth} onChange={num("elderlyCentreRentPerMonth")} hint="Enter 0 if not paying rent" />
            </Section>
          )}

          {selectedDomains.has("WelfareRights") && (
            <Section title="Welfare Rights">
              <Field label="COs per cluster" value={inputs.cosPerCluster} onChange={num("cosPerCluster")} hint="2 or 3 community organisers per cluster" />
              <Field label="Resource Centre rent per month (₹)" value={inputs.rcRentPerMonth} onChange={num("rcRentPerMonth")} hint="Enter 0 if not paying rent" />
            </Section>
          )}

          {selectedDomains.has("Creche") && (
            <Section title="Creche">
              <Field label="No. of creches" value={inputs.nCreches} onChange={num("nCreches")} />
              <Field label="Creche rent per month (₹)" value={inputs.crecheRentPerMonth} onChange={num("crecheRentPerMonth")} hint="Standard APF rate is ₹10,000/month" />
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
