"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Trash2, GripVertical, Check } from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface Formula { domain: string; denominator: number }
interface Scheme { id: string; name: string; parentId: string | null; sortOrder: number; isActive: boolean }

const DOMAIN_META: Record<string, { label: string; population: string; color: string }> = {
  Creche:           { label: "Creche",           population: "children 6m–3yr",  color: "#ec4899" },
  ChildrenCentre:   { label: "Children Centre",  population: "children 4–14yr",  color: "#f97316" },
  YouthGroup:       { label: "Youth Group",      population: "youth 15–21yr",    color: "#8b5cf6" },
  ElderlyKitchen:   { label: "Elderly Kitchen",  population: "elderly 60+",      color: "#10b981" },
  PalliativeSupport:{ label: "Palliative",       population: "elderly 60+",      color: "#6366f1" },
  CommunityToilet:  { label: "Community Toilet", population: "total households", color: "#0ea5e9" },
  WaterATM:         { label: "Water ATM",        population: "total households", color: "#14b8a6" },
};

// ── Formulas section ───────────────────────────────────────────────────────

function FormulasSection() {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/needs/formulas")
      .then(r => r.json())
      .then((data: Formula[]) => {
        setFormulas(data);
        const init: Record<string, string> = {};
        data.forEach(f => { init[f.domain] = String(f.denominator); });
        setEdits(init);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const updates = Object.entries(edits)
      .map(([domain, val]) => ({ domain, denominator: parseFloat(val) || 1 }))
      .filter(u => !isNaN(u.denominator) && u.denominator > 0);

    const res = await fetch("/api/needs/formulas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated: Formula[] = await res.json();
      setFormulas(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const isDirty = formulas.some(f => edits[f.domain] !== undefined && String(f.denominator) !== edits[f.domain]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Target Formulas</h2>
          <p className="text-xs text-stone-400 mt-0.5">1 unit per N population — used to calculate how many of each type are needed.</p>
        </div>
        {isDirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {saving ? "Saving…" : saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : "Save"}
          </button>
        )}
      </div>

      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 overflow-hidden">
        {Object.entries(DOMAIN_META).map(([domain, meta]) => (
          <div key={domain} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-stone-50 transition-colors">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-800">{meta.label}</p>
              <p className="text-[11px] text-stone-400">based on {meta.population}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs text-stone-400">1 per</span>
              <input
                type="number"
                min={1}
                step={1}
                value={edits[domain] ?? ""}
                onChange={e => setEdits(prev => ({ ...prev, [domain]: e.target.value }))}
                className="w-20 px-2 py-1 text-sm text-right border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <span className="text-xs text-stone-400 w-12 truncate">{meta.population.split(" ")[0]}s</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Schemes section ────────────────────────────────────────────────────────

function SchemesSection() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    fetch("/api/needs/schemes").then(r => r.json()).then(setSchemes);
  }, []);

  const parentSchemes = schemes.filter(s => !s.parentId);
  const childSchemes = (parentId: string) => schemes.filter(s => s.parentId === parentId);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch("/api/needs/schemes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), parentId: newParentId || null }),
    });
    if (res.ok) {
      const scheme = await res.json();
      setSchemes(prev => [...prev, scheme]);
      setNewName("");
      setNewParentId("");
      setShowAdd(false);
    }
    setAdding(false);
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    const res = await fetch(`/api/needs/schemes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (res.ok) {
      setSchemes(prev => prev.map(s => s.id === id ? { ...s, name: editName.trim() } : s));
      setEditingId(null);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/needs/schemes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) setSchemes(prev => prev.map(s => s.id === id ? { ...s, isActive: !isActive } : s));
  };

  const handleDelete = async (id: string) => {
    const hasChildren = schemes.some(s => s.parentId === id);
    if (hasChildren && !confirm("This scheme has sub-schemes. Delete all?")) return;
    const res = await fetch(`/api/needs/schemes/${id}`, { method: "DELETE" });
    if (res.ok) setSchemes(prev => prev.filter(s => s.id !== id && s.parentId !== id));
  };

  const SchemeRow = ({ scheme, isChild = false }: { scheme: Scheme; isChild?: boolean }) => (
    <div className={`flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-stone-50 transition-colors ${isChild ? "pl-10 border-l-2 border-stone-100" : ""}`}>
      <GripVertical className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {editingId === scheme.id ? (
          <input
            autoFocus
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => handleRename(scheme.id)}
            onKeyDown={e => { if (e.key === "Enter") handleRename(scheme.id); if (e.key === "Escape") setEditingId(null); }}
            className="w-full text-sm border border-sky-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-sky-400"
          />
        ) : (
          <button
            onClick={() => { setEditingId(scheme.id); setEditName(scheme.name); }}
            className={`text-sm text-left hover:text-sky-600 transition-colors ${!scheme.isActive ? "line-through text-stone-400" : "text-stone-800"}`}
          >
            {scheme.name}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => handleToggleActive(scheme.id, scheme.isActive)}
          title={scheme.isActive ? "Deactivate" : "Activate"}
          className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
            scheme.isActive
              ? "border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
              : "border-stone-200 text-stone-400 bg-stone-50 hover:bg-stone-100"
          }`}
        >
          {scheme.isActive ? "Active" : "Inactive"}
        </button>
        <button
          onClick={() => handleDelete(scheme.id)}
          className="text-stone-300 hover:text-red-400 transition-colors p-0.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Entitlement Schemes</h2>
          <p className="text-xs text-stone-400 mt-0.5">Schemes tracked per settlement — supports parent/child hierarchy (e.g. BoCW + sub-entitlements).</p>
        </div>
        <button
          onClick={() => setShowAdd(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Scheme
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-sky-700">New Entitlement Scheme</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Scheme name (e.g. Ayushman Bharat)"
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              className="flex-1 px-3 py-1.5 text-sm border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
            />
            <select
              value={newParentId}
              onChange={e => setNewParentId(e.target.value)}
              className="px-3 py-1.5 text-sm border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-stone-700"
            >
              <option value="">Top-level</option>
              {parentSchemes.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {adding ? "Adding…" : "Add"}
            </button>
            <button onClick={() => { setShowAdd(false); setNewName(""); setNewParentId(""); }}
              className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 overflow-hidden">
        {parentSchemes.length === 0 && (
          <p className="px-4 py-6 text-xs text-stone-400 text-center">No schemes yet. Add your first scheme above.</p>
        )}
        {parentSchemes.map(parent => (
          <div key={parent.id}>
            <SchemeRow scheme={parent} />
            {childSchemes(parent.id).map(child => (
              <SchemeRow key={child.id} scheme={child} isChild />
            ))}
          </div>
        ))}
        {/* Orphaned children (shouldn't normally exist) */}
        {schemes.filter(s => s.parentId && !schemes.find(p => p.id === s.parentId)).map(s => (
          <SchemeRow key={s.id} scheme={s} />
        ))}
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function NeedsSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-stone-400 hover:text-stone-700">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-stone-900">Needs Assessment Settings</h1>
          <p className="text-xs text-stone-400">Configure target formulas and tracked entitlement schemes.</p>
        </div>
      </div>

      <FormulasSection />
      <SchemesSection />
    </div>
  );
}
