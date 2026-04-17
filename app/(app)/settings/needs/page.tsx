"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Trash2, GripVertical, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface DomainConfig {
  domain: string;
  label: string;
  color: string;
  domainType: string;
  populationField: string | null;
  denominator: number | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface Scheme { id: string; name: string; parentId: string | null; sortOrder: number; isActive: boolean }

const POP_FIELDS = [
  { value: "children6m3yr",   label: "Children 6m–3yr" },
  { value: "children4to14",   label: "Children 4–14yr" },
  { value: "youth15to21",     label: "Youth 15–21yr" },
  { value: "elderly60plus",   label: "Elderly 60+" },
  { value: "totalHouseholds", label: "Total Households" },
];

// ── Domains / Formulas section ──────────────────────────────────────────────

function FormulasSection() {
  const [domains, setDomains] = useState<DomainConfig[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Inline label editing
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  // New domain form state
  const [newKey, setNewKey]               = useState("");
  const [newLabel, setNewLabel]           = useState("");
  const [newColor, setNewColor]           = useState("#6b7280");
  const [newType, setNewType]             = useState("count");
  const [newPopField, setNewPopField]     = useState("totalHouseholds");
  const [newDenom, setNewDenom]           = useState("");
  const [newDesc, setNewDesc]             = useState("");
  const [adding, setAdding]               = useState(false);
  const [addError, setAddError]           = useState("");

  useEffect(() => {
    fetch("/api/needs/formulas?all=1")
      .then(r => r.json())
      .then((data: DomainConfig[]) => {
        setDomains(data);
        const init: Record<string, string> = {};
        data.forEach(d => { init[d.domain] = d.denominator != null ? String(d.denominator) : ""; });
        setEdits(init);
      });
  }, []);

  const patchDomain = async (updates: { domain: string; [key: string]: unknown }[]) => {
    const res = await fetch("/api/needs/formulas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated: DomainConfig[] = await res.json();
      setDomains(updated);
      const newEdits: Record<string, string> = {};
      updated.forEach(d => { newEdits[d.domain] = d.denominator != null ? String(d.denominator) : ""; });
      setEdits(newEdits);
    }
    return res;
  };

  const handleSave = async () => {
    setSaving(true);
    const updates = domains
      .filter(d => edits[d.domain] !== undefined && String(d.denominator ?? "") !== edits[d.domain])
      .map(d => ({
        domain: d.domain,
        denominator: edits[d.domain] === "" ? null : parseFloat(edits[d.domain]) || null,
      }));

    if (updates.length === 0) { setSaving(false); return; }

    const res = await patchDomain(updates);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const handleToggleActive = async (domain: string, current: boolean) => {
    await patchDomain([{ domain, isActive: !current }]);
  };

  const handleLabelCommit = async (domain: string) => {
    const trimmed = labelDraft.trim();
    if (!trimmed) { setEditingLabel(null); return; }
    await patchDomain([{ domain, label: trimmed }]);
    setEditingLabel(null);
  };

  const handleColorChange = async (domain: string, color: string) => {
    // Update local state immediately for responsiveness
    setDomains(prev => prev.map(d => d.domain === domain ? { ...d, color } : d));
  };

  const handleColorCommit = async (domain: string, color: string) => {
    await patchDomain([{ domain, color }]);
  };

  const handleReorder = async (idx: number, direction: "up" | "down") => {
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= domains.length) return;
    const a = domains[idx];
    const b = domains[swapIdx];
    await patchDomain([
      { domain: a.domain, sortOrder: b.sortOrder },
      { domain: b.domain, sortOrder: a.sortOrder },
    ]);
  };

  const handleAdd = async () => {
    if (!newKey.trim() || !newLabel.trim()) { setAddError("Key and label are required"); return; }
    setAdding(true);
    setAddError("");
    const res = await fetch("/api/needs/formulas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: newKey.trim(),
        label: newLabel.trim(),
        color: newColor,
        domainType: newType,
        populationField: newType === "boolean" ? null : newPopField,
        denominator: newType === "boolean" ? null : (newDenom ? parseFloat(newDenom) : null),
        description: newDesc.trim() || null,
      }),
    });
    if (res.ok) {
      const created: DomainConfig = await res.json();
      setDomains(prev => [...prev, created]);
      setEdits(prev => ({ ...prev, [created.domain]: created.denominator != null ? String(created.denominator) : "" }));
      setNewKey(""); setNewLabel(""); setNewColor("#6b7280"); setNewType("count");
      setNewPopField("totalHouseholds"); setNewDenom(""); setNewDesc("");
      setShowAdd(false);
    } else {
      const err = await res.json().catch(() => ({}));
      setAddError(err?.error ?? "Failed to add domain");
    }
    setAdding(false);
  };

  const isDirty = domains.some(d => edits[d.domain] !== undefined && String(d.denominator ?? "") !== edits[d.domain]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Needs Domains</h2>
          <p className="text-xs text-stone-400 mt-0.5">Configure target formulas (1 unit per N population) and add new need types.</p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {saving ? "Saving…" : saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : "Save"}
            </button>
          )}
          <button
            onClick={() => setShowAdd(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Domain
          </button>
        </div>
      </div>

      {/* Add domain form */}
      {showAdd && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-sky-700">New Need Domain</p>
            <button onClick={() => { setShowAdd(false); setAddError(""); }} className="text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Key (no spaces)</label>
              <input
                value={newKey}
                onChange={e => setNewKey(e.target.value.replace(/\s/g, ""))}
                placeholder="e.g. CommunityLibrary"
                className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Label</label>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Community Library"
                className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Type</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              >
                <option value="count">Count (1 per N population)</option>
                <option value="boolean">Boolean (yes/no per settlement)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="w-8 h-8 rounded border border-sky-200 cursor-pointer"
                />
                <span className="text-xs text-stone-500 font-mono">{newColor}</span>
              </div>
            </div>
            {newType === "count" && (
              <>
                <div>
                  <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Population base</label>
                  <select
                    value={newPopField}
                    onChange={e => setNewPopField(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  >
                    {POP_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Denominator (1 per N)</label>
                  <input
                    type="number"
                    min={1}
                    value={newDenom}
                    onChange={e => setNewDenom(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  />
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Description (optional)</label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief description of this need type"
                className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              />
            </div>
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !newKey.trim() || !newLabel.trim()}
              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {adding ? "Adding…" : "Add Domain"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddError(""); }} className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing domains list */}
      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 overflow-hidden">
        {domains.length === 0 && (
          <p className="px-4 py-6 text-xs text-stone-400 text-center">Loading…</p>
        )}
        {domains.map((d, idx) => (
          <div
            key={d.domain}
            className={`flex items-center gap-3 px-4 py-3 bg-white hover:bg-stone-50 transition-colors ${!d.isActive ? "opacity-50" : ""}`}
          >
            {/* Reorder buttons */}
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button
                onClick={() => handleReorder(idx, "up")}
                disabled={idx === 0}
                className="text-stone-300 hover:text-stone-500 disabled:opacity-20 transition-colors"
                title="Move up"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleReorder(idx, "down")}
                disabled={idx === domains.length - 1}
                className="text-stone-300 hover:text-stone-500 disabled:opacity-20 transition-colors"
                title="Move down"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Color swatch (clickable) */}
            <div className="relative flex-shrink-0">
              <input
                type="color"
                value={d.color}
                onChange={e => handleColorChange(d.domain, e.target.value)}
                onBlur={e => handleColorCommit(d.domain, e.target.value)}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                title="Change color"
              />
              <span className="w-3 h-3 rounded-full block" style={{ background: d.color }} />
            </div>

            <div className="flex-1 min-w-0">
              {/* Inline label edit */}
              {editingLabel === d.domain ? (
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={e => setLabelDraft(e.target.value)}
                  onBlur={() => handleLabelCommit(d.domain)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleLabelCommit(d.domain);
                    if (e.key === "Escape") setEditingLabel(null);
                  }}
                  className="text-sm border border-sky-300 rounded px-1.5 py-0.5 w-full outline-none focus:ring-2 focus:ring-sky-400"
                />
              ) : (
                <button
                  onClick={() => { setEditingLabel(d.domain); setLabelDraft(d.label); }}
                  className="text-sm font-medium text-stone-800 hover:text-sky-600 transition-colors text-left"
                  title="Click to rename"
                >
                  {d.label}
                </button>
              )}
              <p className="text-[11px] text-stone-400">
                {d.domainType === "boolean"
                  ? "Boolean — yes/no per settlement"
                  : `${d.populationField ?? "?"} · 1 per ${d.denominator ?? "?"}`}
              </p>
            </div>

            {/* Denominator input for count domains */}
            {d.domainType === "count" && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs text-stone-400">1 per</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={edits[d.domain] ?? ""}
                  onChange={e => setEdits(prev => ({ ...prev, [d.domain]: e.target.value }))}
                  className="w-20 px-2 py-1 text-sm text-right border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
            )}

            {/* Active toggle pill */}
            <button
              onClick={() => handleToggleActive(d.domain, d.isActive)}
              title={d.isActive ? "Deactivate (hide from Field Coverage)" : "Activate"}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                d.isActive
                  ? "border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                  : "border-stone-200 text-stone-400 bg-stone-50 hover:bg-stone-100"
              }`}
            >
              {d.isActive ? "Active" : "Inactive"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Bangalore Facility Counts section ─────────────────────────────────────

const GEO_FACILITIES = [
  { key: "geo_count_ChildrenCentre",      label: "Children Centres",       defaultVal: 14 },
  { key: "geo_count_Creche",              label: "Creches",                defaultVal: 14 },
  { key: "geo_count_YouthResourceCentre", label: "Youth Resource Centres", defaultVal: 6  },
];

function BangaloreFacilityCountsSection() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings?prefix=geo_count_")
      .then(r => r.json())
      .then((rows: { key: string; value: string }[]) => {
        const init: Record<string, string> = {};
        GEO_FACILITIES.forEach(f => {
          const row = rows.find(r => r.key === f.key);
          init[f.key] = row ? row.value : String(f.defaultVal);
        });
        setValues(init);
        setOriginal(init);
      });
  }, []);

  const isDirty = GEO_FACILITIES.some(f => values[f.key] !== original[f.key]);

  const handleSave = async () => {
    setSaving(true);
    const updates = GEO_FACILITIES
      .filter(f => values[f.key] !== original[f.key])
      .map(f => ({ key: f.key, value: values[f.key] ?? String(f.defaultVal) }));

    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      setOriginal({ ...values });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Bangalore Facility Inventory</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            These counts replace assessment-form totals for Bangalore city stats. Update when GeoJSON layers change.
          </p>
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
        {GEO_FACILITIES.map(f => (
          <div key={f.key} className="flex items-center gap-3 px-4 py-3 bg-white">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-800">{f.label}</p>
              <p className="text-[11px] text-stone-400 font-mono">{f.key}</p>
            </div>
            <input
              type="number"
              min={0}
              step={1}
              value={values[f.key] ?? ""}
              onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="w-20 px-2 py-1 text-sm text-right border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
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
          <h1 className="text-lg font-bold text-stone-900">Field Coverage Settings</h1>
          <p className="text-xs text-stone-400">Configure target formulas, add new need types, and manage entitlement schemes.</p>
        </div>
      </div>

      <FormulasSection />
      <BangaloreFacilityCountsSection />
      <SchemesSection />
    </div>
  );
}
