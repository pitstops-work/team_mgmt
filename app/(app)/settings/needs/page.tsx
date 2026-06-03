"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Trash2, GripVertical, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import Link from "next/link";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

// ── Types ──────────────────────────────────────────────────────────────────

interface DomainConfig {
  domain: string;
  label: string;
  color: string;
  domainType: string;
  populationField: string | null;
  numerator: number;        // "X units per N people"; defaults to 1
  denominator: number | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  linkedSchemeId: string | null;
  assessmentLevel: string;  // "settlement" | "cluster" | "zone" | "city"
  civicGroup: string | null;
  civicWeightGroup: string | null;
}

const CIVIC_GROUPS = [
  { value: "borewell",         label: "Borewell" },
  { value: "toiletConnection", label: "Toilet Connection" },
  { value: "toiletFacility",   label: "Toilet Facility" },
  { value: "waterSupply",      label: "Water Supply" },
];

const ASSESSMENT_LEVELS = [
  { value: "settlement", label: "Settlement", desc: "Each settlement's own population must meet the threshold" },
  { value: "cluster",   label: "Cluster",    desc: "Cluster's total population is pooled — viability assessed across the cluster" },
  { value: "zone",      label: "Zone",       desc: "Zone's total population is pooled — viability assessed across the zone" },
  { value: "city",      label: "City",       desc: "City's total population is pooled — one target for the whole city" },
];

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

  // Expand-to-edit per domain
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<DomainConfig>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Inline label editing
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  // New domain form state
  const [newKey, setNewKey]               = useState("");
  const [newLabel, setNewLabel]           = useState("");
  const [newColor, setNewColor]           = useState("#6b7280");
  const [newType, setNewType]             = useState("count");
  const [newPopField, setNewPopField]     = useState("totalHouseholds");
  const [newNumer, setNewNumer]           = useState("1");
  const [newDenom, setNewDenom]           = useState("");
  const [newDesc, setNewDesc]             = useState("");
  const [newLinkedSchemeId, setNewLinkedSchemeId] = useState("");
  const [newAssessmentLevel, setNewAssessmentLevel] = useState("settlement");
  const [newCivicGroup, setNewCivicGroup] = useState("borewell");
  // Numerator edits keyed by domain (mirrors the existing `edits` map for denominator)
  const [numerEdits, setNumerEdits] = useState<Record<string, string>>({});
  const [adding, setAdding]               = useState(false);
  const [addError, setAddError]           = useState("");
  const [keyEdited, setKeyEdited]         = useState(false);
  const [showAdvanced, setShowAdvanced]   = useState(false);

  // Available entitlement schemes (for scheme-saturation type)
  const [allSchemes, setAllSchemes]       = useState<Scheme[]>([]);

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
        const numerInit: Record<string, string> = {};
        data.forEach(d => {
          init[d.domain] = d.denominator != null ? String(d.denominator) : "";
          numerInit[d.domain] = String(d.numerator ?? 1);
        });
        setEdits(init);
        setNumerEdits(numerInit);
      });
    fetch("/api/needs/schemes")
      .then(r => r.json())
      .then(setAllSchemes);
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
      const newNumerEdits: Record<string, string> = {};
      updated.forEach(d => {
        newEdits[d.domain] = d.denominator != null ? String(d.denominator) : "";
        newNumerEdits[d.domain] = String(d.numerator ?? 1);
      });
      setEdits(newEdits);
      setNumerEdits(newNumerEdits);
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

  const handleAssessmentLevelChange = async (domain: string, assessmentLevel: string) => {
    await patchDomain([{ domain, assessmentLevel }]);
  };

  const openEdit = (d: DomainConfig) => {
    setExpandedDomain(d.domain);
    setEditFields({
      label:            d.label,
      color:            d.color,
      domainType:       d.domainType,
      populationField:  d.populationField ?? undefined,
      assessmentLevel:  d.assessmentLevel,
      description:      d.description ?? undefined,
      civicWeightGroup: d.civicWeightGroup ?? undefined,
      civicGroup:       d.civicGroup ?? undefined,
      linkedSchemeId:   d.linkedSchemeId ?? undefined,
    });
    setEdits(prev => ({ ...prev, [d.domain]: d.denominator != null ? String(d.denominator) : "" }));
    setNumerEdits(prev => ({ ...prev, [d.domain]: String(d.numerator ?? 1) }));
  };

  const saveEdit = async (domain: string) => {
    setEditSaving(true);
    const denom = edits[domain] === "" ? null : parseFloat(edits[domain]) || null;
    const numer = parseFloat(numerEdits[domain] ?? "1") || 1;
    const isCount = editFields.domainType === "count";
    const isFixed = editFields.domainType === "fixed";
    const isBoolean = editFields.domainType === "boolean";
    const isEntitlement = editFields.domainType === "entitlement";
    const isCivic = editFields.domainType === "civic";
    await patchDomain([{
      domain,
      ...editFields,
      // Numerator applies to count (X units per N people) and fixed (N units per scope).
      numerator: (isCount || isFixed) ? numer : 1,
      // Denominator only applies to count.
      denominator: isCount ? denom : null,
      // Population field only for count/boolean (boolean still uses it as a non-emptiness gate).
      populationField: (isCount || isBoolean) ? (editFields.populationField ?? null) : null,
      // civicWeightGroup only meaningful for count.
      civicWeightGroup: isCount ? (editFields.civicWeightGroup ?? null) : null,
      // civicGroup only for civic type.
      civicGroup: isCivic ? (editFields.civicGroup ?? null) : null,
      // linkedSchemeId only for entitlement type.
      linkedSchemeId: isEntitlement ? (editFields.linkedSchemeId ?? null) : null,
    }]);
    setExpandedDomain(null);
    setEditSaving(false);
  };

  const handleDelete = async (domain: string) => {
    if (!confirm(`Delete "${domains.find(d => d.domain === domain)?.label ?? domain}"? This cannot be undone.`)) return;
    setDeleting(domain);
    await fetch(`/api/needs/formulas?domain=${encodeURIComponent(domain)}`, { method: "DELETE" });
    setDomains(prev => prev.filter(d => d.domain !== domain));
    setDeleting(null);
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
    if (newType === "entitlement" && !newLinkedSchemeId) { setAddError("Select an entitlement scheme"); return; }
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
        populationField: (newType === "entitlement" || newType === "civic" || newType === "fixed") ? null : newPopField,
        numerator: (newType === "count" || newType === "fixed")
          ? (newNumer ? parseFloat(newNumer) || 1 : 1)
          : 1,
        // Fixed reuses numerator only; no denominator.
        denominator: (newType === "boolean" || newType === "entitlement" || newType === "civic" || newType === "fixed") ? null : (newDenom ? parseFloat(newDenom) : null),
        description: newDesc.trim() || null,
        linkedSchemeId: newType === "entitlement" ? newLinkedSchemeId : null,
        civicGroup: newType === "civic" ? newCivicGroup : null,
        // Count, Presence and Fixed all support a scope; entitlement/civic stay at settlement default.
        assessmentLevel: (newType === "count" || newType === "boolean" || newType === "fixed") ? newAssessmentLevel : "settlement",
      }),
    });
    if (res.ok) {
      const created: DomainConfig = await res.json();
      setDomains(prev => [...prev, created]);
      setEdits(prev => ({ ...prev, [created.domain]: created.denominator != null ? String(created.denominator) : "" }));
      setNewKey(""); setNewLabel(""); setNewColor("#6b7280"); setNewType("count");
      setNewPopField("totalHouseholds"); setNewNumer("1"); setNewDenom(""); setNewDesc(""); setNewLinkedSchemeId(""); setNewAssessmentLevel("settlement"); setNewCivicGroup("borewell");
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
            <button onClick={() => { setShowAdd(false); setAddError(""); setKeyEdited(false); setShowAdvanced(false); setNewLinkedSchemeId(""); }} className="text-stone-400 hover:text-stone-600">
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
                <p className="text-[10px] text-stone-400 mt-0.5">X units per N people (e.g. 1 crèche per 40 children)</p>
              </button>
              <button
                type="button"
                onClick={() => setNewType("fixed")}
                className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${newType === "fixed" ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}
              >
                <p className="text-xs font-semibold text-stone-700">Fixed</p>
                <p className="text-[10px] text-stone-400 mt-0.5">N units per scope (e.g. 10 youth groups per cluster)</p>
              </button>
              <button
                type="button"
                onClick={() => setNewType("boolean")}
                className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${newType === "boolean" ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}
              >
                <p className="text-xs font-semibold text-stone-700">Presence</p>
                <p className="text-[10px] text-stone-400 mt-0.5">1 per scope, yes/no (e.g. data baseline done)</p>
              </button>
              <button
                type="button"
                onClick={() => setNewType("entitlement")}
                className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${newType === "entitlement" ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}
              >
                <p className="text-xs font-semibold text-stone-700">Scheme Saturation</p>
                <p className="text-[10px] text-stone-400 mt-0.5">Links to an entitlement scheme — tracks HH enrollment %</p>
              </button>
              <button
                type="button"
                onClick={() => setNewType("civic")}
                className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${newType === "civic" ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}
              >
                <p className="text-xs font-semibold text-stone-700">Civic Survey %</p>
                <p className="text-[10px] text-stone-400 mt-0.5">Janadhikara household survey — % breakdown per category</p>
              </button>
            </div>
          </div>

          {/* Fixed-type fields */}
          {newType === "fixed" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Units per scope</label>
                  <input
                    type="number"
                    min={1}
                    value={newNumer}
                    onChange={e => setNewNumer(e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Per</label>
                  <select
                    value={newAssessmentLevel}
                    onChange={e => setNewAssessmentLevel(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  >
                    {ASSESSMENT_LEVELS.map(lv => <option key={lv.value} value={lv.value}>{lv.label}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-sky-700 bg-sky-100 rounded-lg px-3 py-2">
                e.g. <strong>10</strong> youth groups per <strong>cluster</strong>. Target multiplies up across higher scopes (zone target = 10 × clusters with population).
              </p>
            </>
          )}

          {/* Civic group picker */}
          {newType === "civic" && (
            <div>
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Survey group</label>
              <select
                value={newCivicGroup}
                onChange={e => setNewCivicGroup(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              >
                {CIVIC_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
              <p className="text-[10px] text-sky-600 mt-1">Shows % breakdown from Janadhikara per-household survey data.</p>
            </div>
          )}

          {/* Scheme picker for entitlement type */}
          {newType === "entitlement" && (
            <div>
              <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Entitlement scheme</label>
              <select
                value={newLinkedSchemeId}
                onChange={e => setNewLinkedSchemeId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              >
                <option value="">— select a scheme —</option>
                {allSchemes.filter(s => s.isActive && !s.parentId).map(s => (
                  <optgroup key={s.id} label={s.name}>
                    <option value={s.id}>{s.name} (parent)</option>
                    {allSchemes.filter(c => c.parentId === s.id && c.isActive).map(c => (
                      <option key={c.id} value={c.id}>&nbsp;&nbsp;{c.name}</option>
                    ))}
                  </optgroup>
                ))}
                {allSchemes.filter(s => s.isActive && s.parentId && !allSchemes.find(p => p.id === s.parentId)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-sky-600 mt-1">
                Target = eligible HH · Existing = survey baseline · Done = NGO-enrolled
              </p>
            </div>
          )}

          {/* Ratio fields */}
          {newType === "count" && (
            <>
              <div className="grid grid-cols-3 gap-3">
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
                  <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Units</label>
                  <input
                    type="number"
                    min={1}
                    value={newNumer}
                    onChange={e => setNewNumer(e.target.value)}
                    placeholder="e.g. 20"
                    className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Per N people</label>
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
              <p className="text-[10px] text-sky-600">
                e.g. <strong>20</strong> youth leaders per <strong>500</strong> youth — leave Units as 1 for a simple 1-per-N ratio.
              </p>
              <div>
                <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Viability assessed at</label>
                <div className="grid grid-cols-2 gap-2">
                  {ASSESSMENT_LEVELS.map(lv => (
                    <button
                      key={lv.value}
                      type="button"
                      onClick={() => setNewAssessmentLevel(lv.value)}
                      className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${newAssessmentLevel === lv.value ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}
                    >
                      <p className="text-xs font-semibold text-stone-700">{lv.label}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">{lv.desc}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-sky-600 mt-1.5">
                  Example: "1 centre per 500 children at cluster level" means a centre is only needed if the cluster has ≥500 children in total.
                </p>
              </div>
            </>
          )}

          {/* Presence — yes/no per geography level */}
          {newType === "boolean" && (
            <>
              <div>
                <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Tracked at</label>
                <div className="grid grid-cols-2 gap-2">
                  {ASSESSMENT_LEVELS.map(lv => (
                    <button
                      key={lv.value}
                      type="button"
                      onClick={() => setNewAssessmentLevel(lv.value)}
                      className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${newAssessmentLevel === lv.value ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}
                    >
                      <p className="text-xs font-semibold text-stone-700">{lv.label}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">Yes/no per {lv.label.toLowerCase()}</p>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-sky-700 bg-sky-100 rounded-lg px-3 py-2">
                Tracks whether each {newAssessmentLevel} has this resource/service. No population formula needed.
              </p>
            </>
          )}

          {/* Entitlement hint */}
          {newType === "entitlement" && (
            <p className="text-[11px] text-sky-700 bg-sky-100 rounded-lg px-3 py-2">
              Saturation is computed from assessment data: eligible HH vs enrolled HH. No population formula needed.
            </p>
          )}

          {/* Civic hint */}
          {newType === "civic" && (
            <p className="text-[11px] text-sky-700 bg-sky-100 rounded-lg px-3 py-2">
              Data is sourced from Janadhikara survey. Use the Sync button below to populate data. No formula needed.
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
            <button onClick={() => { setShowAdd(false); setAddError(""); setKeyEdited(false); setShowAdvanced(false); setNewLinkedSchemeId(""); }} className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700">
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
          <div key={d.domain} className={!d.isActive ? "opacity-50" : ""}>
            {/* Summary row */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-stone-50 transition-colors">
              {/* Reorder */}
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => handleReorder(idx, "up")} disabled={idx === 0} className="text-stone-300 hover:text-stone-500 disabled:opacity-20 transition-colors" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                <button onClick={() => handleReorder(idx, "down")} disabled={idx === domains.length - 1} className="text-stone-300 hover:text-stone-500 disabled:opacity-20 transition-colors" title="Move down"><ChevronDown className="w-3 h-3" /></button>
              </div>

              {/* Color swatch */}
              <div className="relative flex-shrink-0">
                <input type="color" value={d.color} onChange={e => handleColorChange(d.domain, e.target.value)} onBlur={e => handleColorCommit(d.domain, e.target.value)} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" title="Change color" />
                <span className="w-3 h-3 rounded-full block" style={{ background: d.color }} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800">{d.label}</p>
                <p className="text-[11px] text-stone-400">
                  {d.domainType === "entitlement"
                    ? `Scheme saturation · ${allSchemes.find(s => s.id === d.linkedSchemeId)?.name ?? "no scheme linked"}`
                    : d.domainType === "boolean"
                    ? `Presence — yes/no per ${d.assessmentLevel ?? "settlement"}`
                    : d.domainType === "fixed"
                    ? `Fixed · ${d.numerator ?? 1} per ${d.assessmentLevel ?? "settlement"}`
                    : d.domainType === "civic"
                    ? `Civic survey % · ${CIVIC_GROUPS.find(g => g.value === d.civicGroup)?.label ?? d.civicGroup ?? "no group"}`
                    : `${d.populationField ?? "?"}${d.civicWeightGroup ? ` × ${CIVIC_GROUPS.find(g => g.value === d.civicWeightGroup)?.label ?? d.civicWeightGroup} score` : ""} · ${(d.numerator ?? 1) === 1 ? "1" : d.numerator} per ${d.denominator ?? "?"} · ${d.assessmentLevel ?? "settlement"} level`}
                </p>
              </div>

              {/* Active toggle */}
              <button
                onClick={() => handleToggleActive(d.domain, d.isActive)}
                title={d.isActive ? "Deactivate" : "Activate"}
                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors flex-shrink-0 ${d.isActive ? "border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "border-stone-200 text-stone-400 bg-stone-50 hover:bg-stone-100"}`}
              >
                {d.isActive ? "Active" : "Inactive"}
              </button>

              {/* Edit button */}
              <button
                onClick={() => expandedDomain === d.domain ? setExpandedDomain(null) : openEdit(d)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors flex-shrink-0 ${expandedDomain === d.domain ? "border-sky-300 text-sky-600 bg-sky-50" : "border-stone-200 text-stone-500 bg-white hover:bg-stone-50"}`}
              >
                {expandedDomain === d.domain ? "Close" : "Edit"}
              </button>

              {/* Delete button */}
              <button
                onClick={() => handleDelete(d.domain)}
                disabled={deleting === d.domain}
                className="text-stone-300 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40"
                title="Delete domain"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expanded edit panel */}
            {expandedDomain === d.domain && (
              <div className="border-t border-sky-100 bg-sky-50 px-4 py-4 space-y-3">
                <p className="text-[10px] font-semibold text-sky-700 uppercase tracking-wide">Edit Domain</p>

                {/* Label */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Name</label>
                    <input
                      value={editFields.label ?? ""}
                      onChange={e => setEditFields(f => ({ ...f, label: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Description</label>
                    <input
                      value={editFields.description ?? ""}
                      onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">How is the target calculated?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: "count", label: "Ratio", desc: "X units per N people" },
                      { v: "fixed", label: "Fixed", desc: "N units per settlement/cluster/zone/city" },
                      { v: "boolean", label: "Presence", desc: "Yes/no per settlement/cluster/zone/city" },
                      { v: "entitlement", label: "Scheme Saturation", desc: "Linked to an entitlement scheme" },
                      { v: "civic", label: "Civic Survey %", desc: "Janadhikara survey breakdown" },
                    ].map(t => (
                      <button key={t.v} type="button" onClick={() => setEditFields(f => ({ ...f, domainType: t.v }))}
                        className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${editFields.domainType === t.v ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}>
                        <p className="text-xs font-semibold text-stone-700">{t.label}</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fixed-specific: units + scope */}
                {editFields.domainType === "fixed" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Units per scope</label>
                      <input
                        type="number" min={1}
                        value={numerEdits[d.domain] ?? "1"}
                        onChange={e => setNumerEdits(prev => ({ ...prev, [d.domain]: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Per</label>
                      <select
                        value={editFields.assessmentLevel ?? "settlement"}
                        onChange={e => setEditFields(f => ({ ...f, assessmentLevel: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                      >
                        {ASSESSMENT_LEVELS.map(lv => <option key={lv.value} value={lv.value}>{lv.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Count-specific: population field + numerator + denominator + assessment level */}
                {editFields.domainType === "count" && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Population group</label>
                        <select
                          value={editFields.populationField ?? "totalHouseholds"}
                          onChange={e => setEditFields(f => ({ ...f, populationField: e.target.value }))}
                          className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                        >
                          {POP_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Units</label>
                        <input
                          type="number" min={1}
                          value={numerEdits[d.domain] ?? "1"}
                          onChange={e => setNumerEdits(prev => ({ ...prev, [d.domain]: e.target.value }))}
                          className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Per N people</label>
                        <input
                          type="number" min={1}
                          value={edits[d.domain] ?? ""}
                          onChange={e => setEdits(prev => ({ ...prev, [d.domain]: e.target.value }))}
                          className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-sky-600">
                      e.g. <strong>20</strong> youth leaders per <strong>500</strong> youth — leave Units as 1 for a simple 1-per-N ratio.
                    </p>
                    <div>
                      <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Viability assessed at</label>
                      <div className="grid grid-cols-2 gap-2">
                        {ASSESSMENT_LEVELS.map(lv => (
                          <button key={lv.value} type="button" onClick={() => setEditFields(f => ({ ...f, assessmentLevel: lv.value }))}
                            className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${editFields.assessmentLevel === lv.value ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}>
                            <p className="text-xs font-semibold text-stone-700">{lv.label}</p>
                            <p className="text-[10px] text-stone-400 mt-0.5">{lv.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Civic weight <span className="font-normal text-stone-400">(optional — scales need by % unserved from Janadhikara survey)</span></label>
                      <select
                        value={editFields.civicWeightGroup ?? ""}
                        onChange={e => setEditFields(f => ({ ...f, civicWeightGroup: e.target.value || null }))}
                        className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                      >
                        <option value="">None (use raw population)</option>
                        {CIVIC_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {/* Boolean (Presence): tracked at what level? */}
                {editFields.domainType === "boolean" && (
                  <div>
                    <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Tracked at</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ASSESSMENT_LEVELS.map(lv => (
                        <button key={lv.value} type="button" onClick={() => setEditFields(f => ({ ...f, assessmentLevel: lv.value }))}
                          className={`px-3 py-2 rounded-lg border-2 text-left transition-all ${editFields.assessmentLevel === lv.value ? "border-sky-400 bg-sky-100" : "border-sky-100 bg-white hover:border-sky-200"}`}>
                          <p className="text-xs font-semibold text-stone-700">{lv.label}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">Yes/no per {lv.label.toLowerCase()}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Civic Survey %: which survey group? */}
                {editFields.domainType === "civic" && (
                  <div>
                    <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Survey group</label>
                    <select
                      value={editFields.civicGroup ?? ""}
                      onChange={e => setEditFields(f => ({ ...f, civicGroup: e.target.value || null }))}
                      className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                    >
                      <option value="">— select a group —</option>
                      {CIVIC_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                )}

                {/* Entitlement: which scheme? */}
                {editFields.domainType === "entitlement" && (
                  <div>
                    <label className="block text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Entitlement scheme</label>
                    <select
                      value={editFields.linkedSchemeId ?? ""}
                      onChange={e => setEditFields(f => ({ ...f, linkedSchemeId: e.target.value || null }))}
                      className="w-full px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                    >
                      <option value="">— select a scheme —</option>
                      {allSchemes.filter(s => s.isActive && !s.parentId).map(s => (
                        <optgroup key={s.id} label={s.name}>
                          <option value={s.id}>{s.name} (parent)</option>
                          {allSchemes.filter(c => c.parentId === s.id && c.isActive).map(c => (
                            <option key={c.id} value={c.id}>&nbsp;&nbsp;{c.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => saveEdit(d.domain)}
                    disabled={editSaving}
                    className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {editSaving ? "Saving…" : "Save changes"}
                  </button>
                  <button onClick={() => setExpandedDomain(null)} className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Janadhikara Sync section ────────────────────────────────────────────────

function JanadhikaraSyncSection() {
  const [token, setToken] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ matched: number; skipped: number; total: number } | null>(null);
  const [error, setError] = useState("");

  const handleSync = async () => {
    if (!token.trim()) { setError("Paste a token first"); return; }
    setSyncing(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/admin/sync-civic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Sync failed"); }
    else setResult(data);
    setSyncing(false);
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-stone-800">Sync Civic Data from Janadhikara</h2>
        <p className="text-xs text-stone-400 mt-0.5">
          Paste a fresh API token from janadhikara.org to update borewell, toilet connection, toilet facility and water supply data for all matched settlements.
        </p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
        <div>
          <label className="block text-[10px] font-semibold text-stone-500 uppercase tracking-wide mb-1">
            Token from janadhikara.org
          </label>
          <p className="text-[10px] text-stone-400 mb-2">
            Open janadhikara.org → Network tab → find the <code className="font-mono bg-stone-100 px-1 rounded">multi_filter_report/9</code> request → copy the full URL or just the <code className="font-mono bg-stone-100 px-1 rounded">token</code> param value.
          </p>
          <textarea
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste full URL or just the token — either works"
            rows={3}
            className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-lg focus:outline-none focus:border-sky-400 resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {result && (
          <p className="text-xs text-emerald-600 font-medium">
            ✓ Synced {result.matched} settlements · {result.skipped} skipped (no Janadhikara match) · {result.total} total
          </p>
        )}
        <button
          onClick={handleSync}
          disabled={syncing || !token.trim()}
          className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
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
    <SurfaceProvider id="settings.needs">
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
      <JanadhikaraSyncSection />
      <BangaloreFacilityCountsSection />
      <SchemesSection />
    </div>
    </SurfaceProvider>
  );
}
