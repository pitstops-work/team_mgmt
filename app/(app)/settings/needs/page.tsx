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
  const [keyEdited, setKeyEdited]         = useState(false);
  const [showAdvanced, setShowAdvanced]   = useState(false);

  // Auto-generate camelCase key from label
  const autoKey = (label: string) =>
    label
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/\s/g, "")
      .replace(/^(.)/, (c: string) => c.toUpperCase());

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
    if (!newLabel.trim()) { setAddError("Name is required"); return; }
    const resolvedKey = newKey.trim() || autoKey(newLabel.trim());
    if (!resolvedKey) { setAddError("Could not generate ID from name"); return; }
    setAdding(true);
    setAddError("");
    const res = await fetch("/api/needs/formulas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: resolvedKey,
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
      setKeyEdited(false); setShowAdvanced(false);
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
            <button onClick={() => { setShowAdd(false); setAddError(""); setKeyEdited(false); setShowAdvanced(false); }} className="text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Label (primary — key auto-derived) */}
          <div>
            <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Name</label>
            <input
              autoFocus
              value={newLabel}
              onChange={e => {
                setNewLabel(e.target.value);
                if (!keyEdited) setNewKey(autoKey(e.target.value));
              }}
              placeholder="e.g. Data Coverage, Community Library"
              className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">How is the target calculated?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewType("count")}
                className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${newType === "count" ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}
              >
                <p className="text-xs font-semibold text-stone-700">Ratio</p>
                <p className="text-[10px] text-stone-400 mt-0.5">1 unit per N people (e.g. 1 crèche per 40 children)</p>
              </button>
              <button
                type="button"
                onClick={() => setNewType("boolean")}
                className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${newType === "boolean" ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}
              >
                <p className="text-xs font-semibold text-stone-700">Presence</p>
                <p className="text-[10px] text-stone-400 mt-0.5">1 per settlement, yes/no (e.g. data baseline done)</p>
              </button>
            </div>
          </div>

          {/* Ratio fields */}
          {newType === "count" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Population group</label>
                <select
                  value={newPopField}
                  onChange={e => setNewPopField(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                >
                  {POP_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">1 unit per N people</label>
                <input
                  type="number"
                  min={1}
                  value={newDenom}
                  onChange={e => setNewDenom(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                />
              </div>
            </div>
          )}

          {/* Presence hint */}
          {newType === "boolean" && (
            <p className="text-[11px] text-sky-700 bg-sky-100 rounded-lg px-3 py-2">
              Target: 1 per settlement — tracks whether each settlement has this resource/service. No population formula needed.
            </p>
          )}

          {/* Color + description side by side */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Color</label>
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <input
                    type="color"
                    value={newColor}
                    onChange={e => setNewColor(e.target.value)}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  />
                  <div className="w-7 h-7 rounded-lg border border-sky-200 cursor-pointer" style={{ background: newColor }} />
                </div>
                <span className="text-[10px] text-stone-400 font-mono">{newColor}</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Description (optional)</label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief description"
                className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              />
            </div>
          </div>

          {/* Advanced: manual key override */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="text-[10px] text-sky-500 hover:text-sky-700 underline"
            >
              {showAdvanced ? "Hide" : "Show"} advanced (ID field)
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">
                  ID key <span className="font-normal text-stone-400">(auto-generated from name — change only if needed)</span>
                </label>
                <input
                  value={newKey}
                  onChange={e => { setNewKey(e.target.value.replace(/\s/g, "")); setKeyEdited(true); }}
                  placeholder="e.g. DataCoverage"
                  className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white font-mono"
                />
              </div>
            )}
          </div>

          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !newLabel.trim()}
              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {adding ? "Adding…" : "Add Domain"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddError(""); setKeyEdited(false); setShowAdvanced(false); }} className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700">
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

const GEO_FACILITY_KEYS = [
  { layerKey: "children_centres", label: "Children Centres" },
  { layerKey: "creches",          label: "Creches" },
  { layerKey: "youth_centres",    label: "Youth Resource Centres" },
];

function BangaloreFacilityCountsSection() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all(
      GEO_FACILITY_KEYS.map(({ layerKey }) =>
        fetch(`/api/map/geojson/layer-features?layerKey=${layerKey}`)
          .then(r => r.json())
          .then(gj => ({ layerKey, count: (gj.features ?? []).length }))
      )
    ).then(results => {
      const c: Record<string, number> = {};
      results.forEach(({ layerKey, count }) => { c[layerKey] = count; });
      setCounts(c);
    });
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-stone-800">Bangalore Facility Inventory</h2>
        <p className="text-xs text-stone-400 mt-0.5">
          Live counts from the database. Add or remove facilities via the Programme Map layer panel.
        </p>
      </div>
      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 overflow-hidden">
        {GEO_FACILITY_KEYS.map(f => (
          <div key={f.layerKey} className="flex items-center gap-3 px-4 py-3 bg-white">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-800">{f.label}</p>
            </div>
            <span className="text-sm font-semibold text-stone-700 tabular-nums">
              {counts[f.layerKey] ?? "—"}
            </span>
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
