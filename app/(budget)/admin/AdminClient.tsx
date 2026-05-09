"use client";

import { useState, useMemo, useTransition, Fragment } from "react";
import {
  seedCostRegistry, updateCostRegistry, resetCostRegistry, addCostItem,
  toggleLineTemplate, addLineTemplate, updateLineTemplate, deleteLineTemplate,
  reorderLineTemplates, seedLineTemplates,
  type LineTemplateFields,
} from "./actions";
import type { BudgetDomain, BudgetSection, InflationType, LineTemplate } from "@/app/generated/prisma/client";
import { generateBudgetLines, buildAugmentedRegistry, type BudgetGeneratorInputs } from "@/lib/budget-generator";

type CostRow = {
  id: string | null;
  domain: BudgetDomain | null;
  itemKey: string;
  unit: string;
  notes: string | null;
  defaultCost: number;
  currentCost: number;
  isEdited: boolean;
};

const DOMAIN_ORDER: (BudgetDomain | null)[] = ["Children", "Youth", "Elderly", "WelfareRights", "Creche", null];
const DOMAIN_LABELS: Record<string, string> = {
  Children: "Children", Youth: "Youth", Elderly: "Elderly + Community Kitchen",
  WelfareRights: "Welfare Rights", Creche: "Creche",
};
const CITIES = ["Bangalore", "Chennai"] as const;
const SECTIONS: BudgetSection[] = ["salary", "capex", "travel", "programme", "admin_salary", "admin_other", "additional"];
const INFLATION_TYPES: InflationType[] = ["Salary", "Other", "Nil"];
const INPUT_VARS = [
  { value: "fixed_1",         label: "Fixed (1)" },
  { value: "fixed_12",        label: "Fixed (12 months)" },
  { value: "nCLCs",           label: "N CLCs" },
  { value: "nYRCs",           label: "N YRCs" },
  { value: "nSettlements",    label: "N Settlements" },
  { value: "nClusters",       label: "N Clusters" },
  { value: "nElderly",        label: "N Elderly" },
  { value: "nElderlyCentres", label: "N Elderly Centres" },
  { value: "nCreches",        label: "N Creches" },
  { value: "cosTotal",        label: "COs total (clusters × COs/cluster)" },
];

const PROGRAMME_INPUTS: { key: string; label: string; unit: string }[] = [
  { key: "inp.nSettlements",    label: "N Settlements",       unit: "settlements" },
  { key: "inp.nClusters",       label: "N Clusters",          unit: "clusters" },
  { key: "inp.cosPerCluster",   label: "COs per cluster",     unit: "COs" },
  { key: "inp.cosTotal",        label: "Total COs",           unit: "COs" },
  { key: "inp.nCLCs",           label: "N CLCs",              unit: "CLCs" },
  { key: "inp.nYRCs",           label: "N YRCs",              unit: "YRCs" },
  { key: "inp.nElderlyCentres", label: "N Elderly Centres",   unit: "centres" },
  { key: "inp.nElderly",        label: "N Elderly enrolled",  unit: "persons" },
  { key: "inp.nCreches",        label: "N Creches",           unit: "creches" },
];

function formatKey(key: string) {
  return key.split(".").slice(1).join(".").replace(/_/g, " ");
}

function formulaSummary(t: LineTemplate): string {
  const unitPart = t.supervisorRatioKey
    ? `ceil(${t.inputVar} / ${t.supervisorRatioKey})×12`
    : t.inputMonthly ? `${t.inputVar}×12` : t.inputVar;

  let costPart = "0";
  if (t.isSalaryStub)   costPart = "salary (blank)";
  else if (t.userInputCost) costPart = `input:${t.userInputCost}`;
  else if (t.costPctOf) costPart = `${t.costPct}% of ${t.costPctOf}`;
  else if (t.workerRatioKey) costPart = `${t.workerRatioKey}×${t.costKey}×12${t.bufferKey ? `×(1+${t.bufferKey}/100)` : ""}`;
  else if (t.costKey) {
    costPart = t.costKey;
    if (t.costKey2) costPart += `×${t.costKey2}`;
    if (t.costKey3) costPart += `×${t.costKey3}`;
    if (t.costMonthly) costPart += "×12";
  }

  return `units=${unitPart}  ·  cost=${costPart}`;
}

// ─── Cost Registry tab ────────────────────────────────────────────────────────

function CostRegistryTab({ costs, isSeeded, city }: { costs: CostRow[]; isSeeded: boolean; city: string }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [activeDomain, setActiveDomain] = useState<string>("Children");
  const [addingItem, setAddingItem] = useState(false);
  const [newItemType, setNewItemType] = useState<"cost" | "ratio">("cost");
  const [newKey, setNewKey] = useState("");
  const [newUnit, setNewUnit] = useState("₹");
  const [newCost, setNewCost] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const grouped = DOMAIN_ORDER.map(d => ({
    domain: d,
    label: d ? DOMAIN_LABELS[d] : "Cross-cutting",
    costs: costs.filter(c => c.domain === d),
  })).filter(g => g.costs.length > 0);

  const currentGroup = grouped.find(g => (g.domain ?? "cross") === activeDomain) ?? grouped[0];

  const handleSeed = () => startTransition(() => seedCostRegistry(city));

  const startEdit = (row: CostRow) => {
    setEditing(row.itemKey);
    setEditVal(String(row.currentCost));
    setEditNotes(row.notes ?? "");
  };

  const saveEdit = (row: CostRow) => {
    const newVal = parseFloat(editVal);
    if (isNaN(newVal)) return;
    startTransition(async () => {
      if (row.id) {
        await updateCostRegistry(row.id, newVal, editNotes || undefined);
      } else {
        await seedCostRegistry(city);
      }
      setEditing(null);
    });
  };

  const handleReset = (row: CostRow) => {
    if (!row.id) return;
    startTransition(() => resetCostRegistry(row.id!));
  };

  const handleAddItem = () => {
    const key = newKey.trim();
    if (!key || !newCost) return;
    const domain = activeDomain === "cross" ? null : activeDomain as BudgetDomain;
    startTransition(async () => {
      await addCostItem(city, { domain, itemKey: key, unit: newUnit, unitCost: parseFloat(newCost), notes: newNotes || undefined });
      setAddingItem(false); setNewKey(""); setNewCost(""); setNewNotes(""); setNewUnit("₹"); setNewItemType("cost");
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-stone-500">Unit costs used to auto-generate budgets. Changes apply to new budgets only.</p>
        {!isSeeded && (
          <button onClick={handleSeed} disabled={pending} className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-60">
            {pending ? "Seeding…" : "Seed defaults"}
          </button>
        )}
        {isSeeded && (
          <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
            {costs.filter(c => c.isEdited).length} customised · {costs.length} total
          </span>
        )}
      </div>

      {/* Domain tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {grouped.map(g => (
          <button key={g.domain ?? "cross"} onClick={() => setActiveDomain(g.domain ?? "cross")}
            className={`text-sm px-4 py-1.5 rounded-lg whitespace-nowrap transition-all ${activeDomain === (g.domain ?? "cross") ? "bg-sky-600 text-white" : "text-stone-600 hover:bg-stone-100"}`}>
            {g.label}
            {g.costs.some(c => c.isEdited) && <span className="ml-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />}
          </button>
        ))}
      </div>

      {/* Cost table */}
      {(() => {
        const isCost = (row: CostRow) => row.unit.includes("₹");
        const costRows = currentGroup?.costs.filter(isCost) ?? [];
        const ratioRows = currentGroup?.costs.filter(r => !isCost(r)) ?? [];

        const renderRow = (row: CostRow) => editing === row.itemKey ? (
          <tr key={row.itemKey} className="border-b border-sky-100 bg-sky-50">
            <td className="px-4 py-2" colSpan={2}>
              <div className="text-sm font-medium text-stone-800">{formatKey(row.itemKey)}</div>
              <div className="text-xs font-mono text-stone-400 mt-0.5">{row.itemKey}</div>
              <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes (optional)"
                className="mt-1 w-full text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500" />
            </td>
            <td className="px-3 py-2 text-right text-stone-400 text-xs">{row.defaultCost.toLocaleString("en-IN")}</td>
            <td className="px-3 py-2">
              <input autoFocus type="number" value={editVal} onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(row); if (e.key === "Escape") setEditing(null); }}
                className="w-full border border-sky-400 rounded px-2 py-1 text-right text-sm focus:outline-none" />
            </td>
            <td className="px-3 py-2">
              <div className="flex gap-1">
                <button onClick={() => saveEdit(row)} disabled={pending} className="text-xs bg-sky-600 text-white px-2 py-1 rounded hover:bg-sky-700">Save</button>
                <button onClick={() => setEditing(null)} className="text-xs text-stone-400 hover:text-stone-700">×</button>
              </div>
            </td>
          </tr>
        ) : (
          <tr key={row.itemKey} className="border-b border-stone-50 hover:bg-stone-50 group">
            <td className="px-4 py-2.5">
              <div className="text-stone-800">{formatKey(row.itemKey)}</div>
              <div className="text-xs font-mono text-stone-400 mt-0.5">{row.itemKey}</div>
              {row.notes && <div className="text-xs text-stone-400 mt-0.5">{row.notes}</div>}
            </td>
            <td className="px-3 py-2.5 text-stone-500 text-xs">{row.unit}</td>
            <td className="text-right px-3 py-2.5 text-stone-400 text-xs">{row.defaultCost.toLocaleString("en-IN")}</td>
            <td className="text-right px-3 py-2.5">
              <span className={`font-medium ${row.isEdited ? "text-amber-700" : "text-stone-800"}`}>{row.currentCost.toLocaleString("en-IN")}</span>
              {row.isEdited && <span className="ml-1 text-xs text-amber-500">edited</span>}
            </td>
            <td className="px-3 py-2.5">
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(row)} className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
                {row.isEdited && row.id && <button onClick={() => handleReset(row)} className="text-xs text-stone-400 hover:text-red-500">Reset</button>}
              </div>
            </td>
          </tr>
        );

        const colHeaders = (
          <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
            <th className="text-left px-4 py-2.5 font-medium">Parameter</th>
            <th className="text-left px-3 py-2.5 font-medium">Unit</th>
            <th className="text-right px-3 py-2.5 font-medium w-28">Default</th>
            <th className="text-right px-3 py-2.5 font-medium w-32">Current</th>
            <th className="w-24 px-3 py-2.5"></th>
          </tr>
        );

        const sectionHeader = (label: string) => (
          <tr key={label}><td colSpan={5} className="px-4 pt-4 pb-1.5 text-xs font-semibold text-stone-500 uppercase tracking-wide bg-white">{label}</td></tr>
        );

        return (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>{colHeaders}</thead>
              <tbody>
                {costRows.length > 0 && sectionHeader("Unit Costs")}
                {costRows.map(renderRow)}
                {ratioRows.length > 0 && sectionHeader("Programme Ratios")}
                {ratioRows.map(renderRow)}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Add new cost item */}
      <div className="mt-3">
        {addingItem ? (
          <div className="p-4 bg-white border border-stone-200 rounded-xl space-y-3">
            {/* Type selector */}
            <div className="flex gap-1 bg-stone-100 rounded-lg p-1 w-fit">
              {(["cost", "ratio"] as const).map(type => (
                <button key={type} onClick={() => {
                  setNewItemType(type);
                  setNewUnit(type === "cost" ? "₹" : "ratio");
                }}
                  className={`text-sm px-4 py-1 rounded-md transition-all ${newItemType === type ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
                  {type === "cost" ? "Unit Cost" : "Programme Ratio"}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400">
              {newItemType === "cost"
                ? "A monetary cost used directly in budget lines (e.g. accommodation cost per person)."
                : "A programme parameter or ratio referenced in formulas (e.g. workers per creche, days per year)."}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2">
                <span className="text-xs font-medium text-stone-600">Key name</span>
                <input value={newKey} onChange={e => setNewKey(e.target.value)}
                  placeholder={`e.g. ${activeDomain === "cross" ? "cross" : (activeDomain ?? "children").toLowerCase()}.${newItemType === "cost" ? "accommodation_per_person" : "days_per_year"}`}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />
                <p className="text-xs text-stone-400 mt-0.5">Dot notation: domain.descriptive_name — this is the key you'll reference in template formulas.</p>
              </label>
              <label>
                <span className="text-xs font-medium text-stone-600">{newItemType === "cost" ? "Unit label" : "Unit label"}</span>
                <input value={newUnit} onChange={e => setNewUnit(e.target.value)}
                  placeholder={newItemType === "cost" ? "e.g. ₹ / person" : "e.g. workers per creche"}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
                {newItemType === "cost" && <p className="text-xs text-stone-400 mt-0.5">Must contain ₹ to appear in Unit Costs section.</p>}
              </label>
              <label>
                <span className="text-xs font-medium text-stone-600">{newItemType === "cost" ? "Cost (₹)" : "Value"}</span>
                <input type="number" value={newCost} onChange={e => setNewCost(e.target.value)}
                  placeholder={newItemType === "ratio" ? "e.g. 2.2" : "0"}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label className="col-span-2">
                <span className="text-xs font-medium text-stone-600">Notes (optional)</span>
                <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
                  placeholder="What this represents"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAddingItem(false); setNewKey(""); setNewCost(""); setNewNotes(""); setNewUnit("₹"); setNewItemType("cost"); }}
                className="text-sm text-stone-500 hover:text-stone-800 px-3 py-1.5">Cancel</button>
              <button onClick={handleAddItem} disabled={pending || !newKey.trim() || !newCost}
                className="text-sm bg-sky-600 text-white px-4 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                {pending ? "Saving…" : `Add ${newItemType === "cost" ? "cost item" : "ratio"}`}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddingItem(true)}
            className="text-sm text-sky-600 hover:text-sky-800 border border-dashed border-sky-300 rounded-lg px-4 py-2 hover:bg-sky-50 w-full">
            + New cost item or ratio
          </button>
        )}
      </div>
      {/* Programme inputs reference */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Programme inputs (read-only)</p>
        <p className="text-xs text-stone-400 mb-3">
          These are set per budget when it is created. Reference them in template formulas using the key shown (e.g. as costKey2 or costKey3 multiplier).
        </p>
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                <th className="text-left px-4 py-2 font-medium">Label</th>
                <th className="text-left px-3 py-2 font-medium font-mono">Key (use in templates)</th>
                <th className="text-left px-3 py-2 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {PROGRAMME_INPUTS.map(p => (
                <tr key={p.key} className="border-b border-stone-50">
                  <td className="px-4 py-2 text-stone-700">{p.label}</td>
                  <td className="px-3 py-2 font-mono text-xs text-sky-700">{p.key}</td>
                  <td className="px-3 py-2 text-xs text-stone-400">{p.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs text-stone-400">Cost registry changes apply to newly created budgets only.</p>
    </>
  );
}

// ─── Line template form (add / edit) ─────────────────────────────────────────

const BLANK_FORM: LineTemplateFields = {
  domain: null, section: "programme", description: "", costCategory: "Other",
  unitType: "", inputVar: "fixed_1", inputMonthly: false,
  isSalaryStub: false,
};

function TemplateForm({ initial, onSave, onCancel, pending, registryKeys }: {
  initial: LineTemplateFields;
  onSave: (f: LineTemplateFields) => void;
  onCancel: () => void;
  pending: boolean;
  registryKeys: string[];
}) {
  const [f, setF] = useState<LineTemplateFields>(initial);
  const set = <K extends keyof LineTemplateFields>(k: K, v: LineTemplateFields[K]) => setF(p => ({ ...p, [k]: v }));

  const str = (k: keyof LineTemplateFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    set(k, (e.target.value || null) as never);
  const bool = (k: keyof LineTemplateFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, e.target.checked as never);

  return (
    <div className="space-y-3 p-4 bg-stone-50 rounded-xl border border-stone-200">
      <datalist id="admin-ck">
        {registryKeys.map(k => <option key={k} value={k} />)}
        {PROGRAMME_INPUTS.map(p => <option key={p.key} value={p.key} label={p.label} />)}
      </datalist>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2">
          <span className="text-xs font-medium text-stone-600">Description</span>
          <input value={f.description} onChange={e => set("description", e.target.value)}
            className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </label>

        <label>
          <span className="text-xs font-medium text-stone-600">Domain</span>
          <select value={f.domain ?? ""} onChange={e => set("domain", (e.target.value || null) as BudgetDomain | null)}
            className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none">
            <option value="">Cross-cutting</option>
            {(["Children","Youth","Elderly","WelfareRights","Creche"] as BudgetDomain[]).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>

        <label>
          <span className="text-xs font-medium text-stone-600">Section</span>
          <select value={f.section} onChange={e => set("section", e.target.value as BudgetSection)}
            className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none">
            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label>
          <span className="text-xs font-medium text-stone-600">Inflation type</span>
          <select value={f.costCategory} onChange={e => set("costCategory", e.target.value as InflationType)}
            className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none">
            {INFLATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label>
          <span className="text-xs font-medium text-stone-600">Unit type label</span>
          <input value={f.unitType} onChange={e => set("unitType", e.target.value)}
            placeholder="e.g. Per CLC, Month, Annual"
            className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
        </label>
      </div>

      {/* Unit count formula */}
      <div className="border border-stone-200 rounded-lg p-3 bg-white space-y-2">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Unit count formula</p>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="text-xs text-stone-600">Scales with</span>
            <select value={f.inputVar ?? "fixed_1"} onChange={e => set("inputVar", e.target.value)}
              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none">
              {INPUT_VARS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs text-stone-600">Supervisor ratio key</span>
            <input value={f.supervisorRatioKey ?? ""} onChange={str("supervisorRatioKey")}
              list="admin-ck" placeholder="e.g. creche.supervisor_per_n_creches"
              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
          </label>
          <label>
            <span className="text-xs text-stone-600">Minimum to include (threshold)</span>
            <input type="number" value={f.inputThreshold ?? ""} min={0}
              onChange={e => set("inputThreshold", (e.target.value ? parseInt(e.target.value) : null) as never)}
              placeholder="e.g. 2 → only if input > 2"
              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
            <p className="text-xs text-stone-400 mt-0.5">Leave blank for no threshold. Set to 2 to suppress this line when the input variable is ≤ 2.</p>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={f.inputMonthly ?? false} onChange={bool("inputMonthly")} className="rounded" />
          × 12 (monthly → annual)
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={f.y1UnitsZero ?? false} onChange={bool("y1UnitsZero")} className="rounded" />
          Override Y1 units to 0 (e.g. CAPEX maintenance starts Y2)
        </label>
      </div>

      {/* Unit cost formula */}
      <div className="border border-stone-200 rounded-lg p-3 bg-white space-y-2">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Unit cost formula</p>

        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={f.isSalaryStub ?? false} onChange={bool("isSalaryStub")} className="rounded" />
          Salary stub (cost = 0, user fills in)
        </label>

        {!f.isSalaryStub && (
          <div className="space-y-2">
            <label>
              <span className="text-xs text-stone-600">User input field (for rent)</span>
              <input value={f.userInputCost ?? ""} onChange={str("userInputCost")}
                placeholder="e.g. clcRentPerMonth, crecheRentPerMonth"
                className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label>
                <span className="text-xs text-stone-600">Cost key (primary)</span>
                <input value={f.costKey ?? ""} onChange={str("costKey")}
                  list="admin-ck" placeholder="e.g. children.snack_per_child_per_day"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label>
                <span className="text-xs text-stone-600">× key 2 (optional)</span>
                <input value={f.costKey2 ?? ""} onChange={str("costKey2")}
                  list="admin-ck" placeholder="e.g. children.snack_days_per_year"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label>
                <span className="text-xs text-stone-600">× key 3 (optional)</span>
                <input value={f.costKey3 ?? ""} onChange={str("costKey3")}
                  list="admin-ck" placeholder="e.g. children.children_per_clc"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={f.costMonthly ?? false} onChange={bool("costMonthly")} className="rounded" />
              × 12 on cost keys product (monthly → annual)
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-xs text-stone-600">Worker ratio key (optional)</span>
                <input value={f.workerRatioKey ?? ""} onChange={str("workerRatioKey")}
                  list="admin-ck" placeholder="e.g. creche.workers_per_creche"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label>
                <span className="text-xs text-stone-600">Buffer % key (optional)</span>
                <input value={f.bufferKey ?? ""} onChange={str("bufferKey")}
                  list="admin-ck" placeholder="e.g. creche.maternity_buffer_pct"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-xs text-stone-600">% of registry key (CAPEX-style)</span>
                <input value={f.costPctOf ?? ""} onChange={str("costPctOf")}
                  list="admin-ck" placeholder="e.g. creche.setup_cost"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label>
                <span className="text-xs text-stone-600">Percentage</span>
                <input type="number" value={f.costPct ?? ""} onChange={e => set("costPct", parseFloat(e.target.value) || null)}
                  placeholder="e.g. 5"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
            </div>
          </div>
        )}

        {f.isSalaryStub && (
          <label>
            <span className="text-xs text-stone-600">Salary hint</span>
            <input value={f.salaryHint ?? ""} onChange={str("salaryHint")}
              placeholder="e.g. ₹40,000–55,000/month"
              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
          </label>
        )}
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="text-sm text-stone-500 hover:text-stone-800 px-3 py-1.5">Cancel</button>
        <button onClick={() => onSave(f)} disabled={pending || !f.description.trim()}
          className="text-sm bg-sky-600 text-white px-4 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">
          {pending ? "Saving…" : "Save line"}
        </button>
      </div>
    </div>
  );
}

// ─── Line Templates tab ───────────────────────────────────────────────────────

const SECTION_BADGE: Record<string, string> = {
  salary: "bg-blue-50 text-blue-700",
  capex: "bg-purple-50 text-purple-700",
  travel: "bg-orange-50 text-orange-700",
  programme: "bg-green-50 text-green-700",
  admin_salary: "bg-slate-50 text-slate-700",
  admin_other: "bg-slate-50 text-slate-700",
  additional: "bg-stone-50 text-stone-700",
};

function buildNewGlobalOrder(
  allTemplates: LineTemplate[],
  domainKey: BudgetDomain | null,
  newVisibleOrder: LineTemplate[],
): string[] {
  const sorted = [...allTemplates].sort((a, b) => a.position - b.position);
  const result: string[] = [];
  let vi = 0;
  for (const t of sorted) {
    if (t.domain === domainKey) {
      result.push(newVisibleOrder[vi++].id);
    } else {
      result.push(t.id);
    }
  }
  return result;
}

function LineTemplatesTab({ templates, city, registryKeys }: { templates: LineTemplate[]; city: string; registryKeys: string[] }) {
  const [pending, startTransition] = useTransition();
  const [activeDomain, setActiveDomain] = useState<string>("Children");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const domainKey = activeDomain === "cross" ? null : activeDomain as BudgetDomain;
  const visible = useMemo(() =>
    templates
      .filter(t => activeDomain === "cross" ? t.domain === null : t.domain === activeDomain)
      .sort((a, b) => a.position - b.position),
    [templates, activeDomain]
  );

  const displayVisible = useMemo(() => {
    if (!draggedId || !dragOverId || draggedId === dragOverId) return visible;
    const from = visible.findIndex(t => t.id === draggedId);
    const to   = visible.findIndex(t => t.id === dragOverId);
    if (from === -1 || to === -1) return visible;
    const result = [...visible];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
  }, [visible, draggedId, dragOverId]);

  const domainTabs = [
    ...["Children","Youth","Elderly","WelfareRights","Creche"].map(d => ({
      key: d, label: DOMAIN_LABELS[d] ?? d,
      count: templates.filter(t => t.domain === d).length,
    })),
    { key: "cross", label: "Cross-cutting + Admin", count: templates.filter(t => t.domain === null).length },
  ];

  const handleToggle = (id: string, current: boolean) =>
    startTransition(() => toggleLineTemplate(id, !current));

  const handleAdd = (fields: LineTemplateFields) =>
    startTransition(async () => {
      await addLineTemplate(city, { ...fields, domain: domainKey as BudgetDomain | null });
      setAdding(false);
    });

  const handleEdit = (id: string, fields: LineTemplateFields) =>
    startTransition(async () => {
      await updateLineTemplate(id, fields);
      setEditingId(null);
    });

  const handleDelete = (id: string) => {
    if (!confirm("Delete this line template? This affects all future budgets for this city.")) return;
    startTransition(() => deleteLineTemplate(id));
  };

  const handleSeed = () => {
    if (templates.length > 0) {
      if (!confirm(`Re-seed templates for ${city}? This resets all formula customisations to defaults.`)) return;
    }
    startTransition(() => seedLineTemplates(city));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedId || !dragOverId || draggedId === dragOverId) {
      setDraggedId(null); setDragOverId(null); return;
    }
    const from = visible.findIndex(t => t.id === draggedId);
    const to   = visible.findIndex(t => t.id === dragOverId);
    const reordered = [...visible];
    const [item] = reordered.splice(from, 1);
    reordered.splice(to, 0, item);
    const globalOrder = buildNewGlobalOrder(templates, domainKey as BudgetDomain | null, reordered);
    setDraggedId(null); setDragOverId(null);
    startTransition(() => reorderLineTemplates(city, globalOrder));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-stone-500">
          Line items generated for each new budget. Changes apply to newly created budgets only.
        </p>
        <button onClick={handleSeed} disabled={pending}
          className={`text-sm px-3 py-1.5 rounded-lg whitespace-nowrap disabled:opacity-50 ${templates.length === 0 ? "bg-sky-600 text-white hover:bg-sky-700" : "border border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
          {pending ? "Seeding…" : templates.length === 0 ? "Seed templates" : "Re-seed defaults"}
        </button>
      </div>

      {/* Domain tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {domainTabs.map(d => (
          <button key={d.key} onClick={() => { setActiveDomain(d.key); setDraggedId(null); setDragOverId(null); }}
            className={`text-sm px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${activeDomain === d.key ? "bg-sky-600 text-white" : "text-stone-600 hover:bg-stone-100"}`}>
            {d.label}
            <span className={`ml-1.5 text-xs ${activeDomain === d.key ? "text-sky-200" : "text-stone-400"}`}>{d.count}</span>
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-sm text-stone-400 text-center">No templates for this domain yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                <th className="w-6 px-2 py-2.5"></th>
                <th className="text-left px-4 py-2.5 font-medium">Description</th>
                <th className="text-left px-3 py-2.5 font-medium w-24">Section</th>
                <th className="text-left px-3 py-2.5 font-medium w-16">Inflation</th>
                <th className="text-left px-3 py-2.5 font-medium">Formula</th>
                <th className="w-28 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {displayVisible.map(t => (
                <Fragment key={t.id}>
                  <tr
                    draggable
                    onDragStart={() => setDraggedId(t.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverId(t.id); }}
                    onDrop={handleDrop}
                    onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                    className={[
                      "border-b border-stone-50 group",
                      !t.isActive ? "opacity-40" : "",
                      draggedId === t.id ? "opacity-30" : "",
                      dragOverId === t.id && draggedId !== t.id ? "border-t-2 border-sky-400" : "",
                    ].join(" ")}
                  >
                    <td className="px-2 py-2.5 text-stone-300 cursor-grab select-none text-center" title="Drag to reorder">⠿</td>
                    <td className="px-4 py-2.5">
                      <div className="text-stone-800 font-medium">{t.description}</div>
                      {t.salaryHint && <div className="text-xs text-stone-400 mt-0.5">{t.salaryHint}</div>}
                      {t.notes && <div className="text-xs text-stone-400 mt-0.5">{t.notes}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SECTION_BADGE[t.section] ?? "bg-stone-50 text-stone-600"}`}>
                        {t.section}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-500">{t.costCategory}</td>
                    <td className="px-3 py-2.5 text-xs text-stone-400 font-mono max-w-xs truncate" title={formulaSummary(t)}>
                      {formulaSummary(t)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                          className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
                        <button onClick={() => handleToggle(t.id, t.isActive)}
                          className="text-xs text-stone-400 hover:text-stone-700">
                          {t.isActive ? "Disable" : "Enable"}
                        </button>
                        <button onClick={() => handleDelete(t.id)}
                          className="text-xs text-stone-300 hover:text-red-500">Delete</button>
                      </div>
                    </td>
                  </tr>
                  {editingId === t.id && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 bg-sky-50 border-b border-sky-100">
                        <TemplateForm
                          initial={{ domain: t.domain, section: t.section, description: t.description, costCategory: t.costCategory, unitType: t.unitType, notes: t.notes, salaryHint: t.salaryHint, isAutoGenerated: t.isAutoGenerated, inputVar: t.inputVar, inputMonthly: t.inputMonthly, supervisorRatioKey: t.supervisorRatioKey, inputThreshold: t.inputThreshold, isSalaryStub: t.isSalaryStub, userInputCost: t.userInputCost, costKey: t.costKey, costKey2: t.costKey2, costKey3: t.costKey3, costMonthly: t.costMonthly, workerRatioKey: t.workerRatioKey, bufferKey: t.bufferKey, costPctOf: t.costPctOf, costPct: t.costPct, y1UnitsZero: t.y1UnitsZero }}
                          onSave={fields => handleEdit(t.id, fields)}
                          onCancel={() => setEditingId(null)}
                          pending={pending}
                          registryKeys={registryKeys}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add form or button */}
      <div className="mt-3">
        {adding ? (
          <TemplateForm
            initial={{ ...BLANK_FORM, domain: domainKey as BudgetDomain | null }}
            onSave={handleAdd}
            onCancel={() => setAdding(false)}
            pending={pending}
            registryKeys={registryKeys}
          />
        ) : (
          <button onClick={() => setAdding(true)}
            className="text-sm text-sky-600 hover:text-sky-800 border border-dashed border-sky-300 rounded-lg px-4 py-2 hover:bg-sky-50 w-full">
            + Add line template
          </button>
        )}
      </div>
    </>
  );
}

// ─── Cost Analysis tab ────────────────────────────────────────────────────────

const ALL_DOMAINS: BudgetDomain[] = ["Children", "Youth", "Elderly", "WelfareRights", "Creche"];

const DEFAULT_INPUTS: BudgetGeneratorInputs = {
  nSettlements: 10,
  nClusters: 3,
  nCLCs: 5,      clcRentPerMonth: 15000,
  nYRCs: 2,      yrcRentPerMonth: 10000,
  nElderlyCentres: 2, nElderly: 50, elderlyCentreRentPerMonth: 8000,
  cosPerCluster: 2, rcRentPerMonth: 5000,
  nCreches: 3,   crecheRentPerMonth: 12000,
};

const INPUT_GROUPS: { label: string; fields: { key: keyof BudgetGeneratorInputs; label: string }[] }[] = [
  { label: "Geography", fields: [
    { key: "nSettlements", label: "Settlements" },
    { key: "nClusters",    label: "Clusters" },
    { key: "cosPerCluster",label: "COs / cluster" },
  ]},
  { label: "Children", fields: [
    { key: "nCLCs",           label: "CLCs" },
    { key: "clcRentPerMonth", label: "CLC rent / mo (₹)" },
  ]},
  { label: "Youth", fields: [
    { key: "nYRCs",           label: "YRCs" },
    { key: "yrcRentPerMonth", label: "YRC rent / mo (₹)" },
  ]},
  { label: "Elderly", fields: [
    { key: "nElderlyCentres",           label: "Elderly centres" },
    { key: "nElderly",                  label: "Elderly enrolled" },
    { key: "elderlyCentreRentPerMonth", label: "Centre rent / mo (₹)" },
  ]},
  { label: "Welfare Rights", fields: [
    { key: "rcRentPerMonth", label: "RC rent / mo (₹)" },
  ]},
  { label: "Creche", fields: [
    { key: "nCreches",           label: "Creches" },
    { key: "crecheRentPerMonth", label: "Creche rent / mo (₹)" },
  ]},
];

const fmt = (n: number) => n === 0 ? "—" : n.toLocaleString("en-IN");
const fmtCost = (n: number) => n === 0 ? "—" : `₹${n.toLocaleString("en-IN")}`;

function CostAnalysisTab({ templates, costs }: { templates: LineTemplate[]; costs: CostRow[] }) {
  const [inp, setInp] = useState<BudgetGeneratorInputs>(DEFAULT_INPUTS);
  const setField = (k: keyof BudgetGeneratorInputs, v: number) =>
    setInp(p => ({ ...p, [k]: isNaN(v) ? 0 : v }));

  const registry = useMemo(
    () => Object.fromEntries(costs.map(c => [c.itemKey, c.currentCost])),
    [costs]
  );

  const lines = useMemo(
    () => generateBudgetLines(ALL_DOMAINS, inp, 3, registry, templates),
    [inp, registry, templates]
  );

  type DomainGroup = {
    domain: BudgetDomain | null;
    label: string;
    bySection: { section: string; lines: ReturnType<typeof generateBudgetLines>; y1: number; y2: number; y3: number }[];
    y1: number; y2: number; y3: number;
  };

  const grouped = useMemo<DomainGroup[]>(() => {
    const domainOrder = [...ALL_DOMAINS, null] as (BudgetDomain | null)[];
    return domainOrder.flatMap(domain => {
      const domLines = lines.filter(l => l.domain === domain);
      if (!domLines.length) return [];

      const sections = [...new Set(domLines.map(l => l.section))];
      const bySection = sections.map(s => {
        const sl = domLines.filter(l => l.section === s);
        return {
          section: s,
          lines: sl,
          y1: sl.reduce((acc, l) => acc + l.y1Total, 0),
          y2: sl.reduce((acc, l) => acc + l.y2Total, 0),
          y3: sl.reduce((acc, l) => acc + l.y3Total, 0),
        };
      });

      return [{
        domain,
        label: domain ? DOMAIN_LABELS[domain] : "Cross-cutting + Admin",
        bySection,
        y1: domLines.reduce((acc, l) => acc + l.y1Total, 0),
        y2: domLines.reduce((acc, l) => acc + l.y2Total, 0),
        y3: domLines.reduce((acc, l) => acc + l.y3Total, 0),
      }];
    });
  }, [lines]);

  const grand = useMemo(() => ({
    y1: lines.reduce((s, l) => s + l.y1Total, 0),
    y2: lines.reduce((s, l) => s + l.y2Total, 0),
    y3: lines.reduce((s, l) => s + l.y3Total, 0),
  }), [lines]);

  return (
    <>
      {/* Programme size inputs */}
      <div className="mb-6 p-4 bg-white border border-stone-200 rounded-xl">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Programme size assumptions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {INPUT_GROUPS.map(group => (
            <div key={group.label} className="space-y-2">
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">{group.label}</p>
              {group.fields.map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-xs text-stone-500">{label}</span>
                  <input
                    type="number" min={0}
                    value={inp[key]}
                    onChange={e => setField(key, parseFloat(e.target.value))}
                    className="mt-0.5 w-full border border-stone-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Per-domain tables */}
      <div className="space-y-6">
        {grouped.map(g => (
          <div key={g.domain ?? "cross"}>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-stone-700">{g.label}</h3>
              <div className="flex gap-6 text-xs text-stone-400">
                <span>Y1 <span className="font-medium text-stone-600">{fmtCost(g.y1)}</span></span>
                <span>Y2 <span className="font-medium text-stone-600">{fmtCost(g.y2)}</span></span>
                <span>Y3 <span className="font-medium text-stone-600">{fmtCost(g.y3)}</span></span>
              </div>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                    <th className="text-left px-4 py-2 font-medium">Description</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Section</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Unit cost Y1</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Units</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Total Y1</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Total Y2</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Total Y3</th>
                  </tr>
                </thead>
                <tbody>
                  {g.bySection.map(({ section, lines: sLines, y1: sy1, y2: sy2, y3: sy3 }) => (
                    <Fragment key={section}>
                      <tr className="border-b border-stone-50">
                        <td colSpan={7} className="px-4 pt-3 pb-1 text-xs font-semibold text-stone-400 uppercase tracking-wide bg-stone-50/50">
                          {section}
                        </td>
                      </tr>
                      {sLines.map((l, i) => (
                        <tr key={i} className="border-b border-stone-50 hover:bg-stone-50">
                          <td className="px-4 py-2 text-stone-800">
                            {l.description}
                            {l.salaryHint && <span className="ml-2 text-xs text-stone-400">{l.salaryHint}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SECTION_BADGE[l.section] ?? "bg-stone-50 text-stone-600"}`}>
                              {l.section}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-stone-600 tabular-nums">
                            {l.y1UnitCost === 0 && l.y1Units > 0
                              ? <span className="text-stone-300 italic text-xs">user fills</span>
                              : fmtCost(l.y1UnitCost)}
                          </td>
                          <td className="px-3 py-2 text-right text-stone-500 tabular-nums">{fmt(l.y1Units)}</td>
                          <td className="px-3 py-2 text-right font-medium text-stone-800 tabular-nums">{fmtCost(l.y1Total)}</td>
                          <td className="px-3 py-2 text-right text-stone-500 tabular-nums">{fmtCost(l.y2Total)}</td>
                          <td className="px-3 py-2 text-right text-stone-500 tabular-nums">{fmtCost(l.y3Total)}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-stone-100 bg-stone-50/70">
                        <td colSpan={4} className="px-4 py-1.5 text-xs text-stone-400 text-right italic">{section} subtotal</td>
                        <td className="px-3 py-1.5 text-right text-xs font-semibold text-stone-700 tabular-nums">{fmtCost(sy1)}</td>
                        <td className="px-3 py-1.5 text-right text-xs font-medium text-stone-500 tabular-nums">{fmtCost(sy2)}</td>
                        <td className="px-3 py-1.5 text-right text-xs font-medium text-stone-500 tabular-nums">{fmtCost(sy3)}</td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr className="bg-stone-100">
                    <td colSpan={4} className="px-4 py-2 text-xs font-bold text-stone-600 text-right">{g.label} total</td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-stone-900 tabular-nums">{fmtCost(g.y1)}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-stone-600 tabular-nums">{fmtCost(g.y2)}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-stone-600 tabular-nums">{fmtCost(g.y3)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Grand total */}
      <div className="mt-6 p-4 bg-stone-900 text-white rounded-xl flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Grand Total — all domains</p>
          <p className="text-xs text-stone-400 mt-0.5">Excludes salary stubs (user-defined) and rent lines if rent inputs are 0</p>
        </div>
        <div className="flex gap-8 text-right">
          <div><p className="text-xs text-stone-400">Year 1</p><p className="text-lg font-bold">{fmtCost(grand.y1)}</p></div>
          <div><p className="text-xs text-stone-400">Year 2</p><p className="text-lg font-semibold text-stone-300">{fmtCost(grand.y2)}</p></div>
          <div><p className="text-xs text-stone-400">Year 3</p><p className="text-lg font-semibold text-stone-300">{fmtCost(grand.y3)}</p></div>
        </div>
      </div>
    </>
  );
}

// ─── Root client component ────────────────────────────────────────────────────

export default function AdminClient({
  costs, isSeeded, city, templates,
}: {
  costs: CostRow[];
  isSeeded: boolean;
  city: string;
  templates: LineTemplate[];
}) {
  const [activeTab, setActiveTab] = useState<"registry" | "templates" | "analysis">("registry");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Budget Configuration</h1>
          <p className="text-sm text-stone-500 mt-0.5">Costs, ratios, and line item templates used when generating budgets.</p>
        </div>
      </div>

      {/* City tabs */}
      <div className="flex gap-1 mb-5 border-b border-stone-200 pb-3">
        {CITIES.map(c => (
          <a key={c} href={`/admin?city=${c}`}
            className={`text-sm px-4 py-1.5 rounded-lg transition-all ${city === c ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-stone-100"}`}>
            {c}
          </a>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 bg-stone-100 rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab("registry")}
          className={`text-sm px-4 py-1.5 rounded-md transition-all ${activeTab === "registry" ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
          Cost Registry
        </button>
        <button onClick={() => setActiveTab("templates")}
          className={`text-sm px-4 py-1.5 rounded-md transition-all ${activeTab === "templates" ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
          Line Templates
          <span className="ml-1.5 text-xs text-stone-400">{templates.length}</span>
        </button>
        <button onClick={() => setActiveTab("analysis")}
          className={`text-sm px-4 py-1.5 rounded-md transition-all ${activeTab === "analysis" ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
          Cost Analysis
        </button>
      </div>

      {activeTab === "registry"  && <CostRegistryTab costs={costs} isSeeded={isSeeded} city={city} />}
      {activeTab === "templates" && <LineTemplatesTab templates={templates} city={city} registryKeys={costs.map(c => c.itemKey)} />}
      {activeTab === "analysis"  && <CostAnalysisTab templates={templates} costs={costs} />}
    </div>
  );
}
