"use client";

import { useState, useTransition } from "react";
import { seedCostRegistry, updateCostRegistry, resetCostRegistry } from "./actions";
import type { BudgetDomain } from "@/app/generated/prisma/client";

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

function formatKey(key: string) {
  return key.split(".").slice(1).join(".").replace(/_/g, " ");
}

export default function AdminClient({ costs, isSeeded }: { costs: CostRow[]; isSeeded: boolean }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [activeDomain, setActiveDomain] = useState<string>("Children");

  const grouped = DOMAIN_ORDER.map(d => ({
    domain: d,
    label: d ? DOMAIN_LABELS[d] : "Cross-cutting",
    costs: costs.filter(c => c.domain === d),
  })).filter(g => g.costs.length > 0);

  const currentGroup = grouped.find(g => (g.domain ?? "cross") === activeDomain) ?? grouped[0];

  const handleSeed = () => startTransition(() => seedCostRegistry());

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
        // Not seeded yet — seed first, then update
        await seedCostRegistry();
        // After seed, the page will revalidate with the new id
      }
      setEditing(null);
    });
  };

  const handleReset = (row: CostRow) => {
    if (!row.id) return;
    startTransition(() => resetCostRegistry(row.id!));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Cost Registry</h1>
          <p className="text-sm text-stone-500 mt-0.5">Unit costs used to auto-generate budgets. Changes apply to new budgets only.</p>
        </div>
        {!isSeeded && (
          <button
            onClick={handleSeed}
            disabled={pending}
            className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-60"
          >
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
          <button
            key={g.domain ?? "cross"}
            onClick={() => setActiveDomain(g.domain ?? "cross")}
            className={`text-sm px-4 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeDomain === (g.domain ?? "cross")
                ? "bg-sky-600 text-white"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {g.label}
            {g.costs.some(c => c.isEdited) && <span className="ml-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />}
          </button>
        ))}
      </div>

      {/* Cost table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
              <th className="text-left px-4 py-2.5 font-medium">Parameter</th>
              <th className="text-left px-3 py-2.5 font-medium">Unit</th>
              <th className="text-right px-3 py-2.5 font-medium w-28">Default</th>
              <th className="text-right px-3 py-2.5 font-medium w-32">Current</th>
              <th className="w-24 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {currentGroup?.costs.map(row => (
              editing === row.itemKey ? (
                <tr key={row.itemKey} className="border-b border-sky-100 bg-sky-50">
                  <td className="px-4 py-2" colSpan={2}>
                    <div className="text-sm font-medium text-stone-800">{formatKey(row.itemKey)}</div>
                    <input
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      className="mt-1 w-full text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-stone-400 text-xs">
                    {row.defaultCost.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      autoFocus
                      type="number"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(row); if (e.key === "Escape") setEditing(null); }}
                      className="w-full border border-sky-400 rounded px-2 py-1 text-right text-sm focus:outline-none"
                    />
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
                    {row.notes && <div className="text-xs text-stone-400 mt-0.5">{row.notes}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-stone-500 text-xs">{row.unit}</td>
                  <td className="text-right px-3 py-2.5 text-stone-400 text-xs">
                    {row.defaultCost.toLocaleString("en-IN")}
                  </td>
                  <td className="text-right px-3 py-2.5">
                    <span className={`font-medium ${row.isEdited ? "text-amber-700" : "text-stone-800"}`}>
                      {row.currentCost.toLocaleString("en-IN")}
                    </span>
                    {row.isEdited && <span className="ml-1 text-xs text-amber-500">edited</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(row)} className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
                      {row.isEdited && row.id && (
                        <button onClick={() => handleReset(row)} className="text-xs text-stone-400 hover:text-red-500">Reset</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-stone-400">All values — including programme ratios like children per CLC, snack days, meeting participants — are editable above. Changes apply to newly created budgets.</p>
    </div>
  );
}
