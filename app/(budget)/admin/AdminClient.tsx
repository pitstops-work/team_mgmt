"use client";

import { useState, useMemo, useTransition, Fragment } from "react";
import {
  seedCostRegistry, updateCostRegistry, resetCostRegistry, deleteCostItem, addCostItem,
  seedProgrammeInputs, backfillDisplayGroups,
  toggleLineTemplate, addLineTemplate, updateLineTemplate, deleteLineTemplate,
  reorderLineTemplates, seedLineTemplates,
  addDomain, updateDomain, toggleDomain, reorderDomains, seedDomains,
  getGeoChildren, loadNeedsScenario,
  type LineTemplateFields, type DomainConfigFields,
} from "./actions";
import type { BudgetSection, InflationType, LineTemplate, BudgetDomainConfig } from "@/app/generated/prisma/client";
import { generateBudgetLines, buildAugmentedRegistry, type BudgetGeneratorInputs } from "@/lib/budget-generator";

type CostRow = {
  id: string | null;
  domain: string | null;
  itemKey: string;
  unit: string;
  notes: string | null;
  defaultCost: number;
  currentCost: number;
  isEdited: boolean;
  displayGroup: string | null;
  needsDomain: string | null;
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

function makeDefaultInputs(costs: { itemKey: string; currentCost: number }[]): BudgetGeneratorInputs {
  return Object.fromEntries(
    costs.filter(c => c.itemKey.startsWith("inp.")).map(c => [c.itemKey.slice(4), c.currentCost])
  );
}

// ─── Cost Registry tab ────────────────────────────────────────────────────────

function CostRegistryTab({ costs, isSeeded, city, domainOrder, domainLabels, needsDomains }: {
  costs: CostRow[]; isSeeded: boolean; city: string;
  domainOrder: (string | null)[]; domainLabels: Record<string, string>;
  needsDomains: { domain: string; label: string | null }[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [activeDomain, setActiveDomain] = useState<string>(() => domainOrder.find(d => d !== null) ?? "");
  const [addingItem, setAddingItem] = useState(false);
  const [newItemType, setNewItemType] = useState<"cost" | "ratio">("cost");
  const [newKey, setNewKey] = useState("");
  const [newUnit, setNewUnit] = useState("₹");
  const [newCost, setNewCost] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [addingProgInput, setAddingProgInput] = useState(false);
  const [newProgKey, setNewProgKey] = useState("");
  const [newProgUnit, setNewProgUnit] = useState("count");
  const [newProgValue, setNewProgValue] = useState("");
  const [newProgNotes, setNewProgNotes] = useState("");
  const [newProgGroup, setNewProgGroup] = useState<string>("coverage");

  // Split programme inputs (inp.*) from regular cost items
  const progInputRows = costs.filter(c => c.itemKey.startsWith("inp."));
  const domainCosts   = costs.filter(c => !c.itemKey.startsWith("inp."));

  const grouped = domainOrder.map(d => ({
    domain: d,
    label: d ? (domainLabels[d] ?? d) : "Cross-cutting",
    costs: domainCosts.filter(c => c.domain === d),
  })).filter(g => g.costs.length > 0);

  const currentGroup = grouped.find(g => (g.domain ?? "cross") === activeDomain) ?? grouped[0];

  const handleSeed = () => startTransition(() => seedCostRegistry(city));
  const handleSeedProgInputs = () => startTransition(() => seedProgrammeInputs(city));
  const handleBackfillGroups = () => startTransition(() => backfillDisplayGroups(city));

  const [editDisplayGroup, setEditDisplayGroup] = useState<string | null>(null);
  const [editNeedsDomain, setEditNeedsDomain]   = useState<string | null>(null);

  const startEdit = (row: CostRow) => {
    setEditing(row.itemKey);
    setEditVal(String(row.currentCost));
    setEditNotes(row.notes ?? "");
    setEditDisplayGroup(row.displayGroup);
    setEditNeedsDomain(row.needsDomain);
  };

  const saveEdit = (row: CostRow) => {
    const newVal = parseFloat(editVal);
    if (isNaN(newVal)) return;
    startTransition(async () => {
      if (row.id) {
        const isInp = row.itemKey.startsWith("inp.");
        await updateCostRegistry(
          row.id, newVal, editNotes || undefined,
          isInp ? editDisplayGroup : undefined,
          isInp ? editNeedsDomain  : undefined,
        );
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

  const handleDeleteItem = (row: CostRow) => {
    if (!row.id) return;
    if (!confirm(`Delete "${row.itemKey}"? This cannot be undone.`)) return;
    startTransition(() => deleteCostItem(row.id!));
  };

  const handleAddItem = () => {
    const key = newKey.trim();
    if (!key || !newCost) return;
    const domain = activeDomain === "cross" ? null : activeDomain;
    startTransition(async () => {
      await addCostItem(city, { domain, itemKey: key, unit: newUnit, unitCost: parseFloat(newCost), notes: newNotes || undefined });
      setAddingItem(false); setNewKey(""); setNewCost(""); setNewNotes(""); setNewUnit("₹"); setNewItemType("cost");
    });
  };

  const handleAddProgInput = () => {
    const suffix = newProgKey.trim();
    if (!suffix || !newProgValue) return;
    startTransition(async () => {
      await addCostItem(city, { domain: null, itemKey: `inp.${suffix}`, unit: newProgUnit, unitCost: parseFloat(newProgValue), notes: newProgNotes || undefined, displayGroup: newProgGroup });
      setAddingProgInput(false); setNewProgKey(""); setNewProgValue(""); setNewProgNotes(""); setNewProgUnit("count"); setNewProgGroup("coverage");
    });
  };

  // Shared row renderer used for both cost registry and programme inputs
  const renderRow = (row: CostRow) => editing === row.itemKey ? (
    <tr key={row.itemKey} className="border-b border-sky-100 bg-sky-50">
      <td className="px-4 py-2" colSpan={2}>
        <div className="text-sm font-medium text-stone-800">{formatKey(row.itemKey)}</div>
        <div className="text-xs font-mono text-stone-400 mt-0.5">{row.itemKey}</div>
        <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes / label"
          className="mt-1 w-full text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        {row.itemKey.startsWith("inp.") && (
          <>
            <select value={editDisplayGroup ?? "coverage"} onChange={e => setEditDisplayGroup(e.target.value)}
              className="mt-1 w-full text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500">
              <option value="geography">Geography & Scale</option>
              <option value="facilities">Facilities</option>
              <option value="coverage">Coverage & Beneficiaries</option>
            </select>
            <select value={editNeedsDomain ?? ""} onChange={e => setEditNeedsDomain(e.target.value || null)}
              className="mt-1 w-full text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500">
              <option value="">— no needs domain —</option>
              {needsDomains.map(nd => (
                <option key={nd.domain} value={nd.domain}>{nd.label ?? nd.domain} ({nd.domain})</option>
              ))}
            </select>
          </>
        )}
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
        {row.itemKey.startsWith("inp.") && (
          row.needsDomain
            ? <span className="text-[10px] font-mono bg-sky-50 text-sky-600 border border-sky-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">→ {row.needsDomain}</span>
            : <span className="text-[10px] text-stone-300 mt-0.5 inline-block">no needs domain</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-stone-500 text-xs">{row.unit}</td>
      <td className="text-right px-3 py-2.5 text-stone-400 text-xs">{row.defaultCost.toLocaleString("en-IN")}</td>
      <td className="text-right px-3 py-2.5">
        <span className={`font-medium ${row.isEdited ? "text-amber-700" : "text-stone-800"}`}>{row.currentCost.toLocaleString("en-IN")}</span>
        {row.isEdited && <span className="ml-1 text-xs text-amber-500">edited</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={() => startEdit(row)} className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
          {row.isEdited && row.id && <button onClick={() => handleReset(row)} className="text-xs text-stone-400 hover:text-stone-600">Reset</button>}
          {row.id && <button onClick={() => handleDeleteItem(row)} className="text-xs text-stone-300 hover:text-red-500">Delete</button>}
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
            {domainCosts.filter(c => c.isEdited).length} customised · {domainCosts.length} items
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
        const costRows  = currentGroup?.costs.filter(isCost) ?? [];
        const ratioRows = currentGroup?.costs.filter(r => !isCost(r)) ?? [];
        const sectionHeader = (label: string) => (
          <tr key={label}><td colSpan={5} className="px-4 pt-4 pb-1.5 text-xs font-semibold text-stone-500 uppercase tracking-wide bg-white">{label}</td></tr>
        );
        return (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>{colHeaders}</thead>
              <tbody>
                {costRows.length > 0 && sectionHeader("Unit Costs")}
                {costRows.map(renderRow)}
                {ratioRows.length > 0 && sectionHeader("Programme Ratios")}
                {ratioRows.map(renderRow)}
              </tbody>
            </table>
            </div>
          </div>
        );
      })()}

      {/* Add new cost item */}
      <div className="mt-3">
        {addingItem ? (
          <div className="p-4 bg-white border border-stone-200 rounded-xl space-y-3">
            <div className="flex gap-1 bg-stone-100 rounded-lg p-1 w-fit">
              {(["cost", "ratio"] as const).map(type => (
                <button key={type} onClick={() => { setNewItemType(type); setNewUnit(type === "cost" ? "₹" : "ratio"); }}
                  className={`text-sm px-4 py-1 rounded-md transition-all ${newItemType === type ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
                  {type === "cost" ? "Unit Cost" : "Programme Ratio"}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400">
              {newItemType === "cost" ? "A monetary cost used directly in budget lines." : "A parameter or ratio referenced in formulas."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2">
                <span className="text-xs font-medium text-stone-600">Key name</span>
                <input value={newKey} onChange={e => setNewKey(e.target.value)}
                  placeholder={`e.g. ${activeDomain === "cross" ? "cross" : (activeDomain ?? "children").toLowerCase()}.${newItemType === "cost" ? "accommodation_per_person" : "days_per_year"}`}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />
                <p className="text-xs text-stone-400 mt-0.5">domain.descriptive_name format</p>
              </label>
              <label>
                <span className="text-xs font-medium text-stone-600">Unit label</span>
                <input value={newUnit} onChange={e => setNewUnit(e.target.value)}
                  placeholder={newItemType === "cost" ? "e.g. ₹ / person" : "e.g. workers per creche"}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label>
                <span className="text-xs font-medium text-stone-600">{newItemType === "cost" ? "Cost (₹)" : "Value"}</span>
                <input type="number" value={newCost} onChange={e => setNewCost(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label className="sm:col-span-2">
                <span className="text-xs font-medium text-stone-600">Notes (optional)</span>
                <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
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

      {/* Programme inputs — editable */}
      <div className="mt-8">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Programme inputs</p>
            <p className="text-xs text-stone-400 mt-0.5">
              Default values used in Cost Analysis. Reference as <span className="font-mono">inp.*</span> keys in template formulas.
            </p>
          </div>
          <div className="flex gap-2 ml-4 shrink-0">
            {progInputRows.some(r => r.itemKey.startsWith("inp.") && r.displayGroup === null) && (
              <button onClick={handleBackfillGroups} disabled={pending}
                className="text-sm border border-stone-300 text-stone-500 px-3 py-1.5 rounded-lg hover:bg-stone-50 disabled:opacity-50">
                Fix sections
              </button>
            )}
            {progInputRows.length === 0 && (
              <button onClick={handleSeedProgInputs} disabled={pending}
                className="text-sm bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                {pending ? "Seeding…" : "Seed standard inputs"}
              </button>
            )}
          </div>
        </div>

        {progInputRows.length > 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>{colHeaders}</thead>
              <tbody>{progInputRows.map(renderRow)}</tbody>
            </table>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-stone-200 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No programme inputs yet.</p>
            <p className="text-xs text-stone-300 mt-1">Click "Seed standard inputs" to create defaults for CLCs, YRCs, elderly centres, rents, etc.</p>
          </div>
        )}

        <div className="mt-2">
          {addingProgInput ? (
            <div className="p-3 bg-white border border-stone-200 rounded-xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <label>
                  <span className="text-xs text-stone-500">Key (inp. suffix)</span>
                  <div className="flex mt-0.5">
                    <span className="px-2 py-1 bg-stone-50 border border-r-0 border-stone-300 rounded-l text-xs text-stone-400 font-mono">inp.</span>
                    <input value={newProgKey} onChange={e => setNewProgKey(e.target.value)}
                      placeholder="n_volunteers"
                      className="w-full border border-stone-300 rounded-r px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />
                  </div>
                </label>
                <label>
                  <span className="text-xs text-stone-500">Unit</span>
                  <select value={newProgUnit} onChange={e => setNewProgUnit(e.target.value)}
                    className="mt-0.5 w-full border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none">
                    <option value="count">count</option>
                    <option value="₹/month">₹/month</option>
                    <option value="ratio">ratio</option>
                    <option value="days">days</option>
                  </select>
                </label>
                <label>
                  <span className="text-xs text-stone-500">Default value</span>
                  <input type="number" value={newProgValue} onChange={e => setNewProgValue(e.target.value)}
                    className="mt-0.5 w-full border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none" />
                </label>
                <label>
                  <span className="text-xs text-stone-500">Section (in analysis)</span>
                  <select value={newProgGroup} onChange={e => setNewProgGroup(e.target.value)}
                    className="mt-0.5 w-full border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none">
                    <option value="geography">Geography & Scale</option>
                    <option value="facilities">Facilities</option>
                    <option value="coverage">Coverage & Beneficiaries</option>
                  </select>
                </label>
                <label className="sm:col-span-2">
                  <span className="text-xs text-stone-500">Notes / label</span>
                  <input value={newProgNotes} onChange={e => setNewProgNotes(e.target.value)}
                    className="mt-0.5 w-full border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none" />
                </label>
                <div className="flex gap-2">
                  <button onClick={handleAddProgInput} disabled={pending || !newProgKey.trim() || !newProgValue}
                    className="text-sm bg-sky-600 text-white px-3 py-1 rounded hover:bg-sky-700 disabled:opacity-50">
                    {pending ? "…" : "Add"}
                  </button>
                  <button onClick={() => { setAddingProgInput(false); setNewProgKey(""); setNewProgValue(""); setNewProgNotes(""); }}
                    className="text-sm text-stone-400 hover:text-stone-700">Cancel</button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingProgInput(true)}
              className="text-sm text-sky-600 hover:text-sky-800 border border-dashed border-sky-300 rounded-lg px-4 py-2 hover:bg-sky-50 w-full">
              + Add programme input
            </button>
          )}
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

function TemplateForm({ initial, onSave, onCancel, pending, registryKeys, customInputVars, domains }: {
  initial: LineTemplateFields;
  onSave: (f: LineTemplateFields) => void;
  onCancel: () => void;
  pending: boolean;
  registryKeys: string[];
  customInputVars: { value: string; label: string }[];
  domains: BudgetDomainConfig[];
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="sm:col-span-2">
          <span className="text-xs font-medium text-stone-600">Description</span>
          <input value={f.description} onChange={e => set("description", e.target.value)}
            className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </label>

        <label>
          <span className="text-xs font-medium text-stone-600">Domain</span>
          <select value={f.domain ?? ""} onChange={e => set("domain", e.target.value || null)}
            className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none">
            <option value="">Cross-cutting</option>
            {domains.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className="text-xs text-stone-600">Scales with</span>
            <select value={f.inputVar ?? "fixed_1"} onChange={e => set("inputVar", e.target.value)}
              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none">
              {INPUT_VARS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              {customInputVars.length > 0 && <option disabled>── Custom ──</option>}
              {customInputVars.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
  domainKey: string | null,
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

const STANDARD_INP_KEYS = new Set([
  "inp.nSettlements","inp.nClusters","inp.cosPerCluster","inp.cosTotal",
  "inp.nCLCs","inp.clcRentPerMonth","inp.nYRCs","inp.yrcRentPerMonth",
  "inp.nElderlyCentres","inp.nElderly","inp.elderlyCentreRentPerMonth",
  "inp.nCreches","inp.crecheRentPerMonth","inp.rcRentPerMonth",
]);

function LineTemplatesTab({ templates, city, registryKeys, costs, domains }: {
  templates: LineTemplate[]; city: string; registryKeys: string[]; costs: CostRow[];
  domains: BudgetDomainConfig[];
}) {
  const [pending, startTransition] = useTransition();
  const [activeDomain, setActiveDomain] = useState<string>(() => domains[0]?.key ?? "");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const customInputVars = useMemo(() =>
    costs
      .filter(c => c.itemKey.startsWith("inp.") && !STANDARD_INP_KEYS.has(c.itemKey))
      .map(c => ({
        value: c.itemKey.slice(4), // strip "inp." — matches extraInputs key
        label: c.notes ?? c.itemKey.slice(4).replace(/_/g, " "),
      })),
    [costs]
  );

  const domainKey = activeDomain === "cross" ? null : activeDomain;
  const visible = useMemo(() =>
    templates
      .filter(t => activeDomain === "cross" ? t.domain === null : t.domain === activeDomain)
      .sort((a, b) => a.position - b.position),
    [templates, activeDomain]
  );


  const domainTabs = [
    ...domains.map(d => ({
      key: d.key, label: d.label,
      count: templates.filter(t => t.domain === d.key).length,
    })),
    { key: "cross", label: "Cross-cutting + Admin", count: templates.filter(t => t.domain === null).length },
  ];

  const handleToggle = (id: string, current: boolean) =>
    startTransition(() => toggleLineTemplate(id, !current));

  const handleAdd = (fields: LineTemplateFields) =>
    startTransition(async () => {
      await addLineTemplate(city, { ...fields, domain: domainKey });
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
    const globalOrder = buildNewGlobalOrder(templates, domainKey, reordered);
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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
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
              {visible.map(t => (
                <Fragment key={t.id}>
                  <tr
                    draggable
                    onDragStart={() => setDraggedId(t.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverId(prev => prev === t.id ? prev : t.id); }}
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
                      <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                          className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
                        <button onClick={() => handleToggle(t.id, t.isActive)}
                          className="text-xs text-stone-400 hover:text-stone-700">
                          {t.isActive ? "Off" : "On"}
                        </button>
                        <button onClick={() => handleDelete(t.id)}
                          className="text-xs text-stone-300 hover:text-red-500">Del</button>
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
                          customInputVars={customInputVars}
                          domains={domains}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Add form or button */}
      <div className="mt-3">
        {adding ? (
          <TemplateForm
            initial={{ ...BLANK_FORM, domain: domainKey }}
            onSave={handleAdd}
            onCancel={() => setAdding(false)}
            pending={pending}
            registryKeys={registryKeys}
            customInputVars={customInputVars}
            domains={domains}
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


// Sections excluded from per-beneficiary cost calculations
const EXCLUDED_FROM_PER_UNIT = new Set<BudgetSection>(["capex", "admin_salary", "admin_other"]);

const fmt = (n: number) => n === 0 ? "—" : n.toLocaleString("en-IN");
const fmtCost = (n: number) => n === 0 ? "—" : `₹${n.toLocaleString("en-IN")}`;
const INP_CLS = "mt-0.5 w-full border border-stone-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500";
const DERIVED_CLS = "mt-0.5 px-2 py-1 text-sm border border-stone-100 rounded bg-stone-50 text-stone-500 tabular-nums";

// Parse "₹40,000–55,000/month" or "₹45,000/month" → average monthly value
function parseIndicativeSalary(hint: string | null | undefined): number {
  if (!hint) return 0;
  const nums = [...hint.replace(/,/g, "").matchAll(/\d+/g)]
    .map(m => parseInt(m[0]))
    .filter(n => n > 999);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

type GeoItem = { id: string; name: string };
type GeoLevel = "city" | "zone" | "cluster" | "settlement";
type ScenarioMetric = "need" | "addressable" | "existing" | "plan" | "gap";

const METRIC_LABELS: Record<ScenarioMetric, string> = {
  need: "Need", addressable: "Addressable", existing: "Existing", plan: "Plan", gap: "Gap",
};

function CostAnalysisTab({ templates, costs, domains, city, zones }: {
  templates: LineTemplate[]; costs: CostRow[]; domains: BudgetDomainConfig[];
  city: string; zones: GeoItem[];
}) {
  const ALL_DOMAINS = domains.map(d => d.key);
  const [inp, setInp] = useState<BudgetGeneratorInputs>(() => makeDefaultInputs(costs));
  const setField = (k: string, v: number) =>
    setInp(p => ({ ...p, [k]: isNaN(v) ? 0 : v }));

  // ── Scenario picker state ──────────────────────────────────────────────────
  const [geoLevel, setGeoLevel]             = useState<GeoLevel>("city");
  const [geoZoneId, setGeoZoneId]           = useState("");
  const [geoClusterId, setGeoClusterId]     = useState("");
  const [geoSettlementId, setGeoSettlementId] = useState("");
  const [clusterOptions, setClusterOptions]   = useState<GeoItem[]>([]);
  const [settlementOptions, setSettlementOptions] = useState<GeoItem[]>([]);
  const [scenarioMetric, setScenarioMetric] = useState<ScenarioMetric>("plan");
  const [scenarioLabel, setScenarioLabel]   = useState<string | null>(null);
  const [loadPending, startLoad]            = useTransition();
  const [cascadePending, startCascade]      = useTransition();

  const handleLevelChange = (lvl: GeoLevel) => {
    setGeoLevel(lvl);
    setGeoClusterId(""); setGeoSettlementId("");
    setClusterOptions([]); setSettlementOptions([]);
    // If zone already selected and drilling to cluster/settlement, fetch clusters
    if (geoZoneId && (lvl === "cluster" || lvl === "settlement")) {
      startCascade(async () => {
        setClusterOptions(await getGeoChildren("zone", geoZoneId));
      });
    }
  };

  const handleZoneChange = (zoneId: string) => {
    setGeoZoneId(zoneId); setGeoClusterId(""); setGeoSettlementId("");
    setClusterOptions([]); setSettlementOptions([]);
    if (zoneId && (geoLevel === "cluster" || geoLevel === "settlement")) {
      startCascade(async () => {
        setClusterOptions(await getGeoChildren("zone", zoneId));
      });
    }
  };

  const handleClusterChange = (clusterId: string) => {
    setGeoClusterId(clusterId); setGeoSettlementId(""); setSettlementOptions([]);
    if (clusterId && geoLevel === "settlement") {
      startCascade(async () => {
        setSettlementOptions(await getGeoChildren("cluster", clusterId));
      });
    }
  };

  const geoId =
    geoLevel === "city"       ? city :
    geoLevel === "zone"       ? geoZoneId :
    geoLevel === "cluster"    ? geoClusterId :
    geoSettlementId;

  const geoName =
    geoLevel === "city"       ? city :
    geoLevel === "zone"       ? (zones.find(z => z.id === geoZoneId)?.name ?? "") :
    geoLevel === "cluster"    ? (clusterOptions.find(c => c.id === geoClusterId)?.name ?? "") :
    (settlementOptions.find(s => s.id === geoSettlementId)?.name ?? "");

  const canLoad = geoLevel === "city"
    ? true
    : geoLevel === "zone" ? !!geoZoneId
    : geoLevel === "cluster" ? !!geoClusterId
    : !!geoSettlementId;

  const handleLoad = () => {
    if (!canLoad) return;
    startLoad(async () => {
      const vals = await loadNeedsScenario(city, geoLevel, geoId, scenarioMetric);
      setInp(p => ({ ...p, ...vals }));
      setScenarioLabel(`${geoName} · ${METRIC_LABELS[scenarioMetric]}`);
    });
  };

  const handleReset = () => {
    setInp(makeDefaultInputs(costs));
    setScenarioLabel(null);
  };

  // Logical display order within each group (lower = earlier; unknown keys get 999)
  const PROG_SORT: Record<string, number> = {
    // Geography — clusters → settlements → COs
    nClusters: 1, nSettlements: 2, cosPerCluster: 3, cosTotal: 4,
    // Facilities — count then rent, grouped by facility type
    nCLCs: 10, clcRentPerMonth: 11,
    nYRCs: 12, yrcRentPerMonth: 13,
    nElderlyCentres: 14, elderlyCentreRentPerMonth: 15,
    nCreches: 16, crecheRentPerMonth: 17,
    nResourceCentres: 18, rcRentPerMonth: 19,
    // Coverage — enrolled first, then totals, then kitchens/support
    nElderly: 10, nElderlyTotal: 11, nElderlyKitchens: 12,
  };
  const sortProg = (a: { key: string }, b: { key: string }) =>
    (PROG_SORT[a.key] ?? 999) - (PROG_SORT[b.key] ?? 999);

  // All inp.* items grouped by displayGroup and sorted in logical order
  const progByGroup = useMemo(() => {
    const groups: Record<"geography" | "facilities" | "coverage", { key: string; label: string }[]> = {
      geography: [], facilities: [], coverage: [],
    };
    for (const c of costs) {
      if (!c.itemKey.startsWith("inp.")) continue;
      const key = c.itemKey.slice(4);
      const label = c.notes ?? key.replace(/_/g, " ");
      const g = (c.displayGroup ?? "coverage") as "geography" | "facilities" | "coverage";
      groups[g].push({ key, label });
    }
    groups.geography.sort(sortProg);
    groups.facilities.sort(sortProg);
    groups.coverage.sort(sortProg);
    return groups;
  }, [costs]);

  // Extra denominators not in BudgetGeneratorInputs
  const [denoms, setDenoms] = useState({ nYouth: 100, nInfants: 60, nHouseholds: 500 });
  const setDenom = (k: keyof typeof denoms, v: number) =>
    setDenoms(p => ({ ...p, [k]: isNaN(v) ? 0 : v }));

  const registry = useMemo(
    () => Object.fromEntries(costs.map(c => [c.itemKey, c.currentCost])),
    [costs]
  );

  const lines = useMemo(
    () => generateBudgetLines(ALL_DOMAINS, inp, 3, registry, templates),
    [inp, registry, templates]
  );

  type AnalysisLine = ReturnType<typeof generateBudgetLines>[number] & { isIndicative: boolean };

  // Fill salary stubs with indicative values parsed from salaryHint
  const indicativeLines = useMemo<AnalysisLine[]>(() =>
    lines.map(l => {
      const isSalaryStub = l.y1UnitCost === 0 && l.y1Units > 0 && !!l.salaryHint;
      if (!isSalaryStub) return { ...l, isIndicative: false };
      const mo = parseIndicativeSalary(l.salaryHint);
      const y2uc = Math.round(mo * 1.10);
      const y3uc = Math.round(mo * 1.21);
      return {
        ...l,
        y1UnitCost: mo,       y1Total: Math.round(l.y1Units * mo),
        y2UnitCost: y2uc,     y2Total: Math.round(l.y2Units * y2uc),
        y3UnitCost: y3uc,     y3Total: Math.round(l.y3Units * y3uc),
        isIndicative: true,
      };
    }),
    [lines]
  );

  // Operational lines only (no capex / admin_salary / admin_other)
  const opLines = useMemo(
    () => indicativeLines.filter(l => !EXCLUDED_FROM_PER_UNIT.has(l.section)),
    [indicativeLines]
  );

  // Total children derived from registry ratio
  const totalChildren = Math.round((inp.nCLCs ?? 0) * (registry["children.children_per_clc"] ?? 0));

  // Est. households: use whichever domain maps nSettlements as its beneficiaryVar (WelfareRights)
  const hhDomain = domains.find(d => d.beneficiaryVar === "nSettlements");
  const hhPerSettlement = hhDomain?.beneficiaryMult ?? 150;
  const estHH = Math.round((inp.nSettlements ?? 0) * hhPerSettlement);

  // Per-domain operational Y1 totals — keyed by domain key
  const domainOp = useMemo(() => {
    const byDomain: Record<string, number> = {};
    for (const d of ALL_DOMAINS) {
      byDomain[d] = opLines.filter(l => l.domain === d).reduce((s, l) => s + l.y1Total, 0);
    }
    byDomain["total"] = opLines.reduce((s, l) => s + l.y1Total, 0);
    return byDomain;
  }, [opLines, ALL_DOMAINS]);

  // Per-unit costs computed from domain configs (beneficiaryVar + beneficiaryMult)
  const perUnit = useMemo(() => {
    // Manual denom overrides keyed by beneficiaryLabel — take precedence over auto-computed
    const denomOverrideByLabel: Record<string, number> = {
      youth: denoms.nYouth,
      "creche children": denoms.nInfants,
    };
    const result: { label: string; value: number | null; sub: string }[] = [];
    for (const d of domains) {
      if (!d.beneficiaryVar || !d.beneficiaryLabel) continue;
      const autoCount = Math.round((inp[d.beneficiaryVar] ?? 0) * d.beneficiaryMult);
      const override = denomOverrideByLabel[d.beneficiaryLabel.toLowerCase()] ?? 0;
      const count = override > 0 ? override : autoCount;
      const domainTotal = domainOp[d.key] ?? 0;
      result.push({
        label: `Per ${d.beneficiaryLabel.toLowerCase()}`,
        value: count > 0 ? Math.round(domainTotal / count) : null,
        sub: `${count.toLocaleString("en-IN")} ${d.beneficiaryLabel.toLowerCase()}`,
      });
    }
    // Always add cluster and HH
    result.push({
      label: "Per cluster",
      value: inp.nClusters > 0 ? Math.round((domainOp["total"] ?? 0) / inp.nClusters) : null,
      sub: `${inp.nClusters} clusters`,
    });
    result.push({
      label: "Per HH",
      value: denoms.nHouseholds > 0 ? Math.round((domainOp["total"] ?? 0) / denoms.nHouseholds) : null,
      sub: `${denoms.nHouseholds.toLocaleString("en-IN")} households`,
    });
    return result;
  }, [domainOp, domains, inp, denoms]);

  type DomainGroup = {
    domain: string | null;
    label: string;
    bySection: { section: string; lines: AnalysisLine[]; y1: number; y2: number; y3: number }[];
    y1: number; y2: number; y3: number;
  };

  const grouped = useMemo<DomainGroup[]>(() => {
    const domainOrder = [...ALL_DOMAINS, null] as (string | null)[];
    return domainOrder.flatMap(domain => {
      const domLines = indicativeLines.filter(l => l.domain === domain);
      if (!domLines.length) return [];
      const sections = [...new Set(domLines.map(l => l.section))];
      const bySection = sections.map(s => {
        const sl = domLines.filter(l => l.section === s);
        return {
          section: s, lines: sl,
          y1: sl.reduce((acc, l) => acc + l.y1Total, 0),
          y2: sl.reduce((acc, l) => acc + l.y2Total, 0),
          y3: sl.reduce((acc, l) => acc + l.y3Total, 0),
        };
      });
      return [{
        domain,
        label: domain ? (domains.find(d => d.key === domain)?.label ?? domain) : "Cross-cutting + Admin",
        bySection,
        y1: domLines.reduce((acc, l) => acc + l.y1Total, 0),
        y2: domLines.reduce((acc, l) => acc + l.y2Total, 0),
        y3: domLines.reduce((acc, l) => acc + l.y3Total, 0),
      }];
    });
  }, [indicativeLines]);

  const grand = useMemo(() => ({
    y1: indicativeLines.reduce((s, l) => s + l.y1Total, 0),
    y2: indicativeLines.reduce((s, l) => s + l.y2Total, 0),
    y3: indicativeLines.reduce((s, l) => s + l.y3Total, 0),
  }), [indicativeLines]);

  const hasIndicative = indicativeLines.some(l => l.isIndicative);

  return (
    <>
      {/* Programme size assumptions — fully driven by displayGroup on each inp.* item */}
      <div className="mb-4 p-4 bg-white border border-stone-200 rounded-xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Programme size assumptions</p>
          {scenarioLabel && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">{scenarioLabel}</span>
              <button onClick={handleReset} className="text-xs text-stone-400 hover:text-stone-700">Reset</button>
            </div>
          )}
        </div>

        {/* Scenario picker */}
        <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg space-y-2">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest">Load from geography</p>
          {/* Level selector */}
          <div className="flex gap-1 flex-wrap">
            {(["city", "zone", "cluster", "settlement"] as GeoLevel[]).map(lvl => (
              <button key={lvl} onClick={() => handleLevelChange(lvl)}
                className={`text-xs px-2.5 py-1 rounded-md capitalize transition-colors ${geoLevel === lvl ? "bg-stone-800 text-white" : "bg-white border border-stone-200 text-stone-600 hover:border-stone-400"}`}>
                {lvl}
              </button>
            ))}
          </div>
          {/* Cascading area selectors */}
          <div className="flex flex-wrap gap-2 items-center">
            {geoLevel === "city" && (
              <span className="text-xs border border-stone-200 rounded px-2 py-1 bg-stone-100 text-stone-500">{city}</span>
            )}
            {geoLevel !== "city" && (
              <select value={geoZoneId} onChange={e => handleZoneChange(e.target.value)}
                disabled={cascadePending}
                className="text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white">
                <option value="">— Zone —</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            )}
            {(geoLevel === "cluster" || geoLevel === "settlement") && (
              <select value={geoClusterId} onChange={e => handleClusterChange(e.target.value)}
                disabled={cascadePending || !geoZoneId}
                className="text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white disabled:opacity-50">
                <option value="">— Cluster —</option>
                {clusterOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {geoLevel === "settlement" && (
              <select value={geoSettlementId} onChange={e => setGeoSettlementId(e.target.value)}
                disabled={cascadePending || !geoClusterId}
                className="text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white disabled:opacity-50">
                <option value="">— Settlement —</option>
                {settlementOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <select value={scenarioMetric} onChange={e => setScenarioMetric(e.target.value as ScenarioMetric)}
              className="text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white">
              {(Object.entries(METRIC_LABELS) as [ScenarioMetric, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button onClick={handleLoad} disabled={!canLoad || loadPending}
              className="text-xs bg-sky-600 text-white px-3 py-1 rounded-md hover:bg-sky-700 disabled:opacity-50 transition-colors">
              {loadPending ? "Loading…" : "Load"}
            </button>
          </div>
          <p className="text-[10px] text-stone-400">
            Only inputs linked to a needs domain via Cost Registry will be populated. Geography counts (settlements, clusters) are always updated.
          </p>
        </div>

        {/* 1. Geography & Scale */}
        {progByGroup.geography.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">Geography & Scale</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {progByGroup.geography.map(({ key, label }) => (
                <Fragment key={key}>
                  <label className="block">
                    <span className="text-xs text-stone-500">{label}</span>
                    <input type="number" min={0} value={inp[key] ?? 0}
                      onChange={e => setField(key, parseFloat(e.target.value))} className={INP_CLS} />
                  </label>
                  {/* Est. HH appears right after settlements, reads WelfareRights beneficiaryMult */}
                  {key === "nSettlements" && (
                    <div className="block">
                      <span className="text-xs text-stone-500">Est. households</span>
                      <div className={DERIVED_CLS}>{estHH.toLocaleString("en-IN")}</div>
                      <p className="text-xs text-stone-300 mt-0.5">× {hhPerSettlement} HH/settlement</p>
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        )}

        {progByGroup.facilities.length > 0 && <div className="border-t border-stone-100" />}

        {/* 2. Facilities — auto-paired: sorted list has count then rent for each type */}
        {progByGroup.facilities.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">Facilities</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(() => {
                type FItem = { key: string; label: string };
                const isRent = (k: string) => k.toLowerCase().includes("rent");
                const strip = (s: string) =>
                  s.replace(/^Typical\s+/i, "").replace(/^No\.?\s*of\s+/i, "").replace(/\s*rent.*$/i, "").trim();
                const items = progByGroup.facilities;
                const pairs: { heading: string; count?: FItem; rent?: FItem }[] = [];
                let i = 0;
                while (i < items.length) {
                  const cur = items[i], nxt = items[i + 1];
                  if (!isRent(cur.key) && nxt && isRent(nxt.key)) {
                    pairs.push({ heading: strip(cur.label), count: cur, rent: nxt }); i += 2;
                  } else if (isRent(cur.key)) {
                    pairs.push({ heading: strip(cur.label), rent: cur }); i += 1;
                  } else {
                    pairs.push({ heading: strip(cur.label), count: cur }); i += 1;
                  }
                }
                return pairs.map(({ heading, count, rent }, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <p className="text-xs font-medium text-stone-500">{heading}</p>
                    {count && (
                      <label className="block">
                        <span className="text-[11px] text-stone-400">Count</span>
                        <input type="number" min={0} value={inp[count.key] ?? 0}
                          onChange={e => setField(count.key, parseFloat(e.target.value))} className={INP_CLS} />
                      </label>
                    )}
                    {rent && (
                      <label className="block">
                        <span className="text-[11px] text-stone-400">Rent / mo (₹)</span>
                        <input type="number" min={0} value={inp[rent.key] ?? 0}
                          onChange={e => setField(rent.key, parseFloat(e.target.value))} className={INP_CLS} />
                      </label>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        <div className="border-t border-stone-100" />

        {/* 3. Coverage & Beneficiaries */}
        <div>
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">Coverage & Beneficiaries</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Children: always derived */}
            <div className="block">
              <span className="text-xs text-stone-500">Children</span>
              <div className={DERIVED_CLS}>
                {totalChildren > 0 ? totalChildren.toLocaleString("en-IN") : <span className="italic text-stone-300">set children_per_clc</span>}
              </div>
              <p className="text-xs text-stone-300 mt-0.5">nCLCs × children_per_clc</p>
            </div>
            {/* Youth enrolled: manual denom */}
            <label className="block">
              <span className="text-xs text-stone-500">Youth enrolled</span>
              <input type="number" min={0} value={denoms.nYouth}
                onChange={e => setDenom("nYouth", parseFloat(e.target.value))} className={INP_CLS} />
            </label>
            {/* All inp.* items tagged as coverage — includes nElderly, nElderlyTotal, kitchens, etc. */}
            {progByGroup.coverage.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="text-xs text-stone-500">{label}</span>
                <input type="number" min={0} value={inp[key] ?? 0}
                  onChange={e => setField(key, parseFloat(e.target.value))} className={INP_CLS} />
              </label>
            ))}
            {/* Infants: manual denom */}
            <label className="block">
              <span className="text-xs text-stone-500">Infants (creche)</span>
              <input type="number" min={0} value={denoms.nInfants}
                onChange={e => setDenom("nInfants", parseFloat(e.target.value))} className={INP_CLS} />
            </label>
            {/* Households: manual denom for Per HH cost */}
            <label className="block">
              <span className="text-xs text-stone-500">Households (for Per HH)</span>
              <input type="number" min={0} value={denoms.nHouseholds}
                onChange={e => setDenom("nHouseholds", parseFloat(e.target.value))} className={INP_CLS} />
            </label>
          </div>
        </div>
      </div>

      {/* Per-unit summary */}
      <div className="mb-6 p-4 bg-sky-950 rounded-xl">
        <p className="text-xs font-semibold text-sky-300 uppercase tracking-wide mb-3">
          Cost per beneficiary / year — operational spend only
          <span className="ml-2 normal-case font-normal text-sky-500">(excludes capex, admin salaries, admin other)</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {perUnit.map(({ label, value, sub }) => (
            <div key={label} className="bg-sky-900/50 rounded-lg p-3">
              <p className="text-xs text-sky-400">{label}</p>
              <p className="text-lg font-bold text-white mt-1">
                {value != null ? fmtCost(value) : <span className="text-sky-600 text-sm">—</span>}
              </p>
              <p className="text-xs text-sky-600 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
        {hasIndicative && (
          <p className="text-xs text-sky-600 mt-3">
            ~ Salary lines use indicative averages from salary hints. Actual costs depend on hiring.
          </p>
        )}
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
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
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
                        <tr key={i} className={`border-b border-stone-50 hover:bg-stone-50 ${l.isIndicative ? "bg-amber-50/30" : ""}`}>
                          <td className="px-4 py-2 text-stone-800">
                            {l.description}
                            {l.isIndicative && <span className="ml-2 text-xs text-amber-500">~indicative · {l.salaryHint}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SECTION_BADGE[l.section] ?? "bg-stone-50 text-stone-600"}`}>
                              {l.section}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums ${l.isIndicative ? "text-amber-600" : "text-stone-600"}`}>
                            {l.isIndicative ? `~${fmtCost(l.y1UnitCost)}/mo` : fmtCost(l.y1UnitCost)}
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
          </div>
        ))}
      </div>

      {/* Grand total */}
      <div className="mt-6 p-4 bg-stone-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Grand Total — all domains</p>
          <p className="text-xs text-stone-400 mt-0.5">
            {hasIndicative ? "Includes indicative salary estimates (marked ~)" : "Salary stubs not filled — add salary hints to templates for indicative totals"}
          </p>
        </div>
        <div className="flex gap-6 sm:gap-8">
          <div><p className="text-xs text-stone-400">Year 1</p><p className="text-lg font-bold">{fmtCost(grand.y1)}</p></div>
          <div><p className="text-xs text-stone-400">Year 2</p><p className="text-lg font-semibold text-stone-300">{fmtCost(grand.y2)}</p></div>
          <div><p className="text-xs text-stone-400">Year 3</p><p className="text-lg font-semibold text-stone-300">{fmtCost(grand.y3)}</p></div>
        </div>
      </div>
    </>
  );
}

// ─── Domains tab ──────────────────────────────────────────────────────────────

function DomainsTab({ domains, city, progInputKeys }: { domains: BudgetDomainConfig[]; city: string; progInputKeys: string[] }) {
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editForm, setEditForm] = useState<Partial<DomainConfigFields>>({});
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBenefLabel, setNewBenefLabel] = useState("");
  const [newBenefVar, setNewBenefVar] = useState("");
  const [newBenefMult, setNewBenefMult] = useState("1");

  const handleSeed = () => startTransition(() => seedDomains(city));

  const handleToggle = (id: string, current: boolean) =>
    startTransition(() => toggleDomain(id, !current));

  const startEdit = (d: BudgetDomainConfig) => {
    setEditingId(d.id);
    setEditForm({
      label: d.label,
      description: d.description,
      beneficiaryLabel: d.beneficiaryLabel,
      beneficiaryVar: d.beneficiaryVar,
      beneficiaryMult: d.beneficiaryMult,
    });
  };

  const saveEdit = (id: string) => {
    startTransition(async () => {
      await updateDomain(id, editForm);
      setEditingId(null);
    });
  };

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key || !newLabel.trim()) return;
    startTransition(async () => {
      await addDomain(city, key, {
        label: newLabel.trim(),
        description: newDesc || null,
        beneficiaryLabel: newBenefLabel || null,
        beneficiaryVar: newBenefVar || null,
        beneficiaryMult: parseFloat(newBenefMult) || 1,
      });
      setAdding(false);
      setNewKey(""); setNewLabel(""); setNewDesc(""); setNewBenefLabel(""); setNewBenefVar(""); setNewBenefMult("1");
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-stone-500">
          Programme domains available when creating a budget. Changes apply immediately to new budgets.
        </p>
        {domains.length === 0 && (
          <button onClick={handleSeed} disabled={pending}
            className="text-sm bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-60">
            {pending ? "Seeding…" : "Seed standard domains"}
          </button>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {domains.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-stone-400">No domains configured yet.</p>
            <p className="text-xs text-stone-300 mt-1">Click "Seed standard domains" to add Children, Youth, Elderly, Welfare Rights, Creche.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                <th className="text-left px-4 py-2.5 font-medium">Key</th>
                <th className="text-left px-3 py-2.5 font-medium">Label</th>
                <th className="text-left px-3 py-2.5 font-medium">Description</th>
                <th className="text-left px-3 py-2.5 font-medium">Beneficiary formula</th>
                <th className="w-28 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {domains.map(d => (
                <Fragment key={d.id}>
                  <tr className={`border-b border-stone-50 group ${!d.isActive ? "opacity-40" : ""}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-stone-600 text-xs bg-stone-100 px-1.5 py-0.5 rounded">{d.key}</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-stone-800">{d.label}</td>
                    <td className="px-3 py-2.5 text-stone-500 text-xs">{d.description ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-stone-400 font-mono">
                      {d.beneficiaryVar ? `${d.beneficiaryVar} × ${d.beneficiaryMult}` : "—"}
                      {d.beneficiaryLabel && <span className="ml-1 text-stone-300">({d.beneficiaryLabel})</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(d)} className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
                        <button onClick={() => handleToggle(d.id, d.isActive)}
                          className="text-xs text-stone-400 hover:text-stone-700">
                          {d.isActive ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingId === d.id && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 bg-sky-50 border-b border-sky-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label>
                            <span className="text-xs font-medium text-stone-600">Label</span>
                            <input value={editForm.label ?? ""} onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))}
                              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500" />
                          </label>
                          <label>
                            <span className="text-xs font-medium text-stone-600">Description</span>
                            <input value={editForm.description ?? ""} onChange={e => setEditForm(p => ({ ...p, description: e.target.value || null }))}
                              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
                          </label>
                          <label>
                            <span className="text-xs font-medium text-stone-600">Beneficiary label (e.g. "Children")</span>
                            <input value={editForm.beneficiaryLabel ?? ""} onChange={e => setEditForm(p => ({ ...p, beneficiaryLabel: e.target.value || null }))}
                              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
                          </label>
                          <label>
                            <span className="text-xs font-medium text-stone-600">Beneficiary variable</span>
                            <input list="benef-var-list" value={editForm.beneficiaryVar ?? ""}
                              onChange={e => setEditForm(p => ({ ...p, beneficiaryVar: e.target.value || null }))}
                              placeholder="e.g. nHealthWorkers (new or existing)"
                              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />
                          </label>
                          <label>
                            <span className="text-xs font-medium text-stone-600">Multiplier (var × this = beneficiary count)</span>
                            <input type="number" value={editForm.beneficiaryMult ?? 1} onChange={e => setEditForm(p => ({ ...p, beneficiaryMult: parseFloat(e.target.value) || 1 }))}
                              className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
                          </label>
                        </div>
                        <div className="flex gap-2 justify-end mt-3">
                          <button onClick={() => setEditingId(null)} className="text-sm text-stone-500 hover:text-stone-800 px-3 py-1.5">Cancel</button>
                          <button onClick={() => saveEdit(d.id)} disabled={pending}
                            className="text-sm bg-sky-600 text-white px-4 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                            {pending ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Add new domain */}
      <div className="mt-3">
        {adding ? (
          <div className="p-4 bg-white border border-stone-200 rounded-xl space-y-3">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">New domain</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                <span className="text-xs font-medium text-stone-600">Key (used in DB — no spaces)</span>
                <input value={newKey} onChange={e => setNewKey(e.target.value.replace(/\s/g, ""))}
                  placeholder="e.g. Health"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />
              </label>
              <label>
                <span className="text-xs font-medium text-stone-600">Display label</span>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. Health & Nutrition"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500" />
              </label>
              <label className="sm:col-span-2">
                <span className="text-xs font-medium text-stone-600">Description (shown in budget creation form)</span>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="e.g. Health camps, nutrition surveys"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label>
                <span className="text-xs font-medium text-stone-600">Beneficiary label</span>
                <input value={newBenefLabel} onChange={e => setNewBenefLabel(e.target.value)}
                  placeholder="e.g. Beneficiaries"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
              <label>
                <span className="text-xs font-medium text-stone-600">Beneficiary variable</span>
                <input list="benef-var-list" value={newBenefVar} onChange={e => setNewBenefVar(e.target.value)}
                  placeholder="e.g. nHealthWorkers (new or existing)"
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />
              </label>
              <label>
                <span className="text-xs font-medium text-stone-600">Multiplier</span>
                <input type="number" value={newBenefMult} onChange={e => setNewBenefMult(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdding(false)} className="text-sm text-stone-500 hover:text-stone-800 px-3 py-1.5">Cancel</button>
              <button onClick={handleAdd} disabled={pending || !newKey.trim() || !newLabel.trim()}
                className="text-sm bg-sky-600 text-white px-4 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                {pending ? "Adding…" : "Add domain"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className="text-sm text-sky-600 hover:text-sky-800 border border-dashed border-sky-300 rounded-lg px-4 py-2 hover:bg-sky-50 w-full">
            + Add domain
          </button>
        )}
      </div>

      <p className="mt-4 text-xs text-stone-400">
        Domain keys are stored directly in line templates and budget lines. Renaming a key requires a data migration. Add new domains freely.
        If you enter a new beneficiary variable name, an <span className="font-mono">inp.*</span> cost registry entry is created automatically.
      </p>

      <datalist id="benef-var-list">
        {progInputKeys.map(k => {
          const v = k.replace(/^inp\./, "");
          return <option key={k} value={v}>{k}</option>;
        })}
      </datalist>
    </>
  );
}

// ─── Root client component ────────────────────────────────────────────────────

export default function AdminClient({
  costs, isSeeded, city, templates, domains, zones, needsDomains,
}: {
  costs: CostRow[];
  isSeeded: boolean;
  city: string;
  templates: LineTemplate[];
  domains: BudgetDomainConfig[];
  zones: GeoItem[];
  needsDomains: { domain: string; label: string | null }[];
}) {
  const [activeTab, setActiveTab] = useState<"registry" | "templates" | "analysis" | "domains">("registry");

  // Build lookup maps from domain configs
  const domainOrder: (string | null)[] = [...domains.map(d => d.key), null];
  const domainLabels: Record<string, string> = Object.fromEntries(domains.map(d => [d.key, d.label]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Budget Configuration</h1>
          <p className="text-sm text-stone-500 mt-0.5">Costs, ratios, line templates, and domains used when generating budgets.</p>
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
      <div className="overflow-x-auto mb-6 pb-1">
        <div className="flex gap-1 bg-stone-100 rounded-lg p-1 w-fit min-w-full sm:min-w-0">
          <button onClick={() => setActiveTab("registry")}
            className={`text-sm px-4 py-1.5 rounded-md transition-all whitespace-nowrap ${activeTab === "registry" ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
            Cost Registry
          </button>
          <button onClick={() => setActiveTab("templates")}
            className={`text-sm px-4 py-1.5 rounded-md transition-all whitespace-nowrap ${activeTab === "templates" ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
            Line Templates
            <span className="ml-1.5 text-xs text-stone-400">{templates.length}</span>
          </button>
          <button onClick={() => setActiveTab("analysis")}
            className={`text-sm px-4 py-1.5 rounded-md transition-all whitespace-nowrap ${activeTab === "analysis" ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
            Cost Analysis
          </button>
          <button onClick={() => setActiveTab("domains")}
            className={`text-sm px-4 py-1.5 rounded-md transition-all whitespace-nowrap ${activeTab === "domains" ? "bg-white shadow-sm text-stone-900 font-medium" : "text-stone-500 hover:text-stone-800"}`}>
            Domains
            <span className="ml-1.5 text-xs text-stone-400">{domains.length}</span>
          </button>
        </div>
      </div>

      {activeTab === "registry"  && <CostRegistryTab costs={costs} isSeeded={isSeeded} city={city} domainOrder={domainOrder} domainLabels={domainLabels} needsDomains={needsDomains} />}
      {activeTab === "templates" && <LineTemplatesTab templates={templates} city={city} registryKeys={costs.map(c => c.itemKey)} costs={costs} domains={domains} />}
      {activeTab === "analysis"  && <CostAnalysisTab templates={templates} costs={costs} domains={domains} city={city} zones={zones} />}
      {activeTab === "domains"   && <DomainsTab domains={domains} city={city} progInputKeys={costs.filter(c => c.itemKey.startsWith("inp.")).map(c => c.itemKey)} />}
    </div>
  );
}
