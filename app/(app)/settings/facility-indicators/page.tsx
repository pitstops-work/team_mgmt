"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Pencil, Trash2, Check, X, Activity, Cloud, User, ChevronDown, ChevronRight } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type CaptureSource = "MIS_API" | "RP_ACTIVITY" | "MANUAL_ADMIN";
type Frequency = "Daily" | "Weekly" | "Monthly" | "Quarterly";

type TargetFormula =
  | { type: "fixed"; value: number }
  | { type: "settlement_field"; field: string; multiplier: number }
  | { type: "facility_count"; multiplier: number }
  | { type: "scheme_baseline"; multiplier: number }
  | null;

interface IndicatorDef {
  id: string;
  key: string;
  label: string;
  description: string | null;
  domain: string;
  facilityLayerKey: string | null;
  schemeId: string | null;
  unit: string | null;
  frequency: Frequency;
  color: string;
  targetFormula: TargetFormula;
  captureSource: CaptureSource;
  misProviderId: string | null;
  misFetchConfig: Record<string, unknown> | null;
  staleYellowDays: number;
  staleRedDays: number;
  sortOrder: number;
  isActive: boolean;
}

interface DomainOption { domain: string; label: string; color: string }
interface FacilityLayerOption { id: string; layerKey: string; label: string }
interface SchemeOption { id: string; name: string }
interface ProviderOption { id: string; key: string; label: string }

const POP_FIELDS = [
  { value: "children6m3yr",   label: "Children 6m–3yr" },
  { value: "children4to14",   label: "Children 4–14yr" },
  { value: "youth15to21",     label: "Youth 15–21yr" },
  { value: "elderly60plus",   label: "Elderly 60+" },
  { value: "totalHouseholds", label: "Total Households" },
];

const UNIT_SUGGESTIONS = ["%", "count", "litres", "₹", "days", "households", "meals", "cards"];

const inputCls = "px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white";
const labelCls = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-0.5";

const emptyDraft = (): IndicatorDef => ({
  id: "",
  key: "",
  label: "",
  description: "",
  domain: "",
  facilityLayerKey: null,
  schemeId: null,
  unit: "",
  frequency: "Monthly",
  color: "#6366f1",
  targetFormula: null,
  captureSource: "RP_ACTIVITY",
  misProviderId: null,
  misFetchConfig: null,
  staleYellowDays: 45,
  staleRedDays: 90,
  sortOrder: 0,
  isActive: true,
});

const slugifyKey = (label: string) =>
  label.trim().toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

export default function FacilityIndicatorsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super-admin";

  const [indicators, setIndicators] = useState<IndicatorDef[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [layers, setLayers] = useState<FacilityLayerOption[]>([]);
  const [schemes, setSchemes] = useState<SchemeOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<IndicatorDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterDomain, setFilterDomain] = useState<string>("");
  const [expandedHelp, setExpandedHelp] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/facility-indicators?all=1");
    if (res.ok) setIndicators(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session && !isAdmin) router.replace("/settings");
  }, [session, isAdmin, router]);

  useEffect(() => {
    load();
    fetch("/api/needs/formulas").then(r => r.json()).then(setDomains).catch(() => {});
    fetch("/api/admin/facility-layers").then(r => r.json()).then(setLayers).catch(() => {});
    fetch("/api/needs/schemes").then(r => r.ok ? r.json() : []).then(setSchemes).catch(() => {});
    fetch("/api/admin/mis-providers").then(r => r.ok ? r.json() : []).then(setProviders).catch(() => {});
  }, [load]);

  if (!isAdmin) return null;

  const handleSave = async () => {
    if (!edit) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        ...edit,
        key: edit.key || slugifyKey(edit.label),
        unit: edit.unit || null,
        description: edit.description || null,
      };
      const res = edit.id
        ? await fetch(`/api/admin/facility-indicators/${edit.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/admin/facility-indicators", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (res.ok) {
        setEdit(null);
        load();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Deactivate "${label}"? Historical data points are kept.`)) return;
    await fetch(`/api/admin/facility-indicators/${id}`, { method: "DELETE" });
    load();
  };

  const filtered = filterDomain ? indicators.filter(i => i.domain === filterDomain) : indicators;
  const domainsInUse = new Set(indicators.map(i => i.domain));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/settings" className="text-stone-400 hover:text-stone-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">Layer 2: Facility Indicators</h1>
      </div>

      <button
        onClick={() => setExpandedHelp(v => !v)}
        className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 mb-3"
      >
        {expandedHelp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        About facility indicators
      </button>
      {expandedHelp && (
        <div className="text-xs text-stone-500 mb-6 leading-relaxed bg-stone-50 border border-stone-100 rounded-lg p-3 space-y-2">
          <p>
            Indicators track <strong>state of facilities</strong> (enrollment %, attendance, downtime, saturation)
            over time — separate from Layer 1 (which tracks needs remaining as goals complete).
          </p>
          <p>
            Each indicator is captured from one of three sources: <strong>MIS API</strong> (auto-pulled from
            external systems like Frappe Creche MIS), <strong>RP activity</strong> (recorded when an RP completes
            a specific checklist item), or <strong>manual admin</strong> entry.
          </p>
          <p>
            <strong>Targets</strong> can be a fixed number, a settlement-population formula (e.g. <code>children6m3yr × 0.9</code>),
            or a facility-count formula. Trend-only indicators (e.g. complaint count) need no target.
          </p>
        </div>
      )}

      {/* Domain filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setFilterDomain("")}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${!filterDomain ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}
        >
          All ({indicators.length})
        </button>
        {domains.filter(d => domainsInUse.has(d.domain)).map(d => (
          <button
            key={d.domain}
            onClick={() => setFilterDomain(d.domain === filterDomain ? "" : d.domain)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${filterDomain === d.domain ? "text-white border-transparent" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}
            style={filterDomain === d.domain ? { background: d.color, borderColor: d.color } : {}}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: filterDomain === d.domain ? "white" : d.color }} />
            {d.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-stone-400 text-center py-8">Loading…</p>
      ) : (
        <div className="space-y-2 mb-4">
          {filtered.map((ind) => (
            <div key={ind.id}>
              {edit?.id === ind.id ? (
                <IndicatorForm
                  draft={edit}
                  setDraft={setEdit}
                  domains={domains}
                  layers={layers}
                  schemes={schemes}
                  providers={providers}
                  onSave={handleSave}
                  onCancel={() => { setEdit(null); setError(""); }}
                  saving={saving}
                  error={error}
                />
              ) : (
                <IndicatorRow
                  indicator={ind}
                  domains={domains}
                  providers={providers}
                  onEdit={() => setEdit({ ...ind })}
                  onDelete={() => handleDelete(ind.id, ind.label)}
                />
              )}
            </div>
          ))}
          {filtered.length === 0 && !edit && (
            <p className="text-sm text-stone-400 italic text-center py-8">
              {indicators.length === 0 ? "No indicators yet." : "No indicators in this domain."}
            </p>
          )}
        </div>
      )}

      {edit && !edit.id ? (
        <IndicatorForm
          draft={edit}
          setDraft={setEdit}
          domains={domains}
          layers={layers}
          schemes={schemes}
          providers={providers}
          onSave={handleSave}
          onCancel={() => { setEdit(null); setError(""); }}
          saving={saving}
          error={error}
          isNew
        />
      ) : (
        <button
          onClick={() => {
            const draft = emptyDraft();
            draft.sortOrder = indicators.length;
            if (filterDomain) draft.domain = filterDomain;
            setEdit(draft);
          }}
          className="flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add indicator
        </button>
      )}
    </div>
  );
}

// ── Row (collapsed display) ──────────────────────────────────────────────────

function SourceBadge({ source }: { source: CaptureSource }) {
  if (source === "MIS_API") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-sky-50 text-sky-700"><Cloud className="w-2.5 h-2.5" /> MIS</span>;
  if (source === "RP_ACTIVITY") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700"><Activity className="w-2.5 h-2.5" /> RP</span>;
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-700"><User className="w-2.5 h-2.5" /> Manual</span>;
}

function IndicatorRow({
  indicator, domains, providers, onEdit, onDelete,
}: {
  indicator: IndicatorDef;
  domains: DomainOption[];
  providers: ProviderOption[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const domain = domains.find(d => d.domain === indicator.domain);
  const provider = providers.find(p => p.id === indicator.misProviderId);
  return (
    <div className={`flex items-start gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl ${!indicator.isActive ? "opacity-50" : ""}`}>
      <span className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ background: indicator.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-stone-800">{indicator.label}</span>
          {indicator.unit && <span className="text-[10px] text-stone-400">{indicator.unit}</span>}
          <SourceBadge source={indicator.captureSource} />
          {provider && <span className="text-[10px] text-sky-600">{provider.label}</span>}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <code className="text-[10px] text-stone-400 font-mono">{indicator.key}</code>
          {domain && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${domain.color}15`, color: domain.color }}>
              {domain.label}
            </span>
          )}
          <span className="text-[10px] text-stone-400">{indicator.frequency}</span>
          {indicator.targetFormula && (
            <span className="text-[10px] text-stone-500">target: {describeFormula(indicator.targetFormula)}</span>
          )}
        </div>
        {indicator.description && (
          <p className="text-[11px] text-stone-500 mt-1">{indicator.description}</p>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 hover:bg-stone-50 rounded text-stone-400 hover:text-stone-600 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function describeFormula(f: TargetFormula): string {
  if (!f) return "—";
  if (f.type === "fixed") return `${f.value}`;
  if (f.type === "settlement_field") return `${f.field} × ${f.multiplier}`;
  if (f.type === "facility_count") return `facilities × ${f.multiplier}`;
  if (f.type === "scheme_baseline") return `scheme × ${f.multiplier}`;
  return "—";
}

// ── Form (edit/new) ──────────────────────────────────────────────────────────

function IndicatorForm({
  draft, setDraft, domains, layers, schemes, providers, onSave, onCancel, saving, error, isNew = false,
}: {
  draft: IndicatorDef;
  setDraft: (d: IndicatorDef) => void;
  domains: DomainOption[];
  layers: FacilityLayerOption[];
  schemes: SchemeOption[];
  providers: ProviderOption[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
  isNew?: boolean;
}) {
  const formula = draft.targetFormula;
  const formulaType = formula?.type ?? "none";

  const setFormulaType = (t: string) => {
    if (t === "none") setDraft({ ...draft, targetFormula: null });
    else if (t === "fixed") setDraft({ ...draft, targetFormula: { type: "fixed", value: 0 } });
    else if (t === "settlement_field") setDraft({ ...draft, targetFormula: { type: "settlement_field", field: "children6m3yr", multiplier: 1 } });
    else if (t === "facility_count") setDraft({ ...draft, targetFormula: { type: "facility_count", multiplier: 1 } });
    else if (t === "scheme_baseline") setDraft({ ...draft, targetFormula: { type: "scheme_baseline", multiplier: 1 } });
  };

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${isNew ? "bg-sky-50 border-sky-200" : "bg-stone-50 border-stone-200"}`}>
      {/* Top row: label + key + color */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className={labelCls}>Label</label>
          <input
            autoFocus
            className={inputCls + " w-full"}
            value={draft.label}
            onChange={e => {
              const newLabel = e.target.value;
              const autoKey = slugifyKey(newLabel);
              setDraft({ ...draft, label: newLabel, key: draft.key && !isNew ? draft.key : autoKey });
            }}
            placeholder="e.g. Creche enrollment %"
          />
        </div>
        <div className="w-48">
          <label className={labelCls}>Key</label>
          <input
            className={inputCls + " w-full font-mono text-xs"}
            value={draft.key}
            onChange={e => setDraft({ ...draft, key: e.target.value.replace(/[^a-z0-9_]/g, "_").toLowerCase() })}
            placeholder="creche_enrollment_pct"
          />
        </div>
        <div>
          <label className={labelCls}>Color</label>
          <input
            type="color"
            className="h-[34px] w-10 rounded-lg border border-stone-200 cursor-pointer p-0.5 bg-white"
            value={draft.color}
            onChange={e => setDraft({ ...draft, color: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description (optional)</label>
        <input
          className={inputCls + " w-full"}
          value={draft.description ?? ""}
          onChange={e => setDraft({ ...draft, description: e.target.value })}
          placeholder="What this indicator measures and why it matters"
        />
      </div>

      {/* Domain + facility layer + scheme + unit + frequency */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>Needs Domain *</label>
          <select
            className={inputCls + " w-full"}
            value={draft.domain}
            onChange={e => setDraft({ ...draft, domain: e.target.value })}
          >
            <option value="">— Select —</option>
            {domains.map(d => <option key={d.domain} value={d.domain}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Facility Layer</label>
          <select
            className={inputCls + " w-full"}
            value={draft.facilityLayerKey ?? ""}
            onChange={e => setDraft({ ...draft, facilityLayerKey: e.target.value || null })}
          >
            <option value="">— Any —</option>
            {layers.map(l => <option key={l.layerKey} value={l.layerKey}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Unit</label>
          <input
            className={inputCls + " w-full"}
            value={draft.unit ?? ""}
            onChange={e => setDraft({ ...draft, unit: e.target.value })}
            placeholder="%"
            list="indicator-units"
          />
          <datalist id="indicator-units">
            {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Frequency</label>
          <select
            className={inputCls + " w-full"}
            value={draft.frequency}
            onChange={e => setDraft({ ...draft, frequency: e.target.value as Frequency })}
          >
            <option value="Daily">Daily</option>
            <option value="Weekly">Weekly</option>
            <option value="Monthly">Monthly</option>
            <option value="Quarterly">Quarterly</option>
          </select>
        </div>
      </div>

      {/* Target formula */}
      <div className="border border-stone-200 rounded-lg p-3 bg-white space-y-2">
        <label className={labelCls}>Target Formula</label>
        <div className="flex flex-wrap gap-1.5">
          {(["none", "fixed", "settlement_field", "facility_count", "scheme_baseline"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setFormulaType(t)}
              className={`px-2.5 py-1 text-xs rounded-full border ${formulaType === t ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}
            >
              {t === "none" ? "Trend only" : t === "fixed" ? "Fixed number" : t === "settlement_field" ? "Settlement population" : t === "facility_count" ? "Facility count" : "Scheme baseline"}
            </button>
          ))}
        </div>
        {formula?.type === "fixed" && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={labelCls}>Value</label>
              <input
                type="number"
                className={inputCls + " w-full"}
                value={formula.value}
                onChange={e => setDraft({ ...draft, targetFormula: { type: "fixed", value: Number(e.target.value) } })}
              />
            </div>
          </div>
        )}
        {formula?.type === "settlement_field" && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={labelCls}>Population field</label>
              <select
                className={inputCls + " w-full"}
                value={formula.field}
                onChange={e => setDraft({ ...draft, targetFormula: { ...formula, field: e.target.value } })}
              >
                {POP_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="w-32">
              <label className={labelCls}>× Multiplier</label>
              <input
                type="number"
                step="0.01"
                className={inputCls + " w-full"}
                value={formula.multiplier}
                onChange={e => setDraft({ ...draft, targetFormula: { ...formula, multiplier: Number(e.target.value) } })}
              />
            </div>
          </div>
        )}
        {(formula?.type === "facility_count" || formula?.type === "scheme_baseline") && (
          <div className="flex gap-2 items-end">
            <div className="w-32">
              <label className={labelCls}>× Multiplier</label>
              <input
                type="number"
                step="0.01"
                className={inputCls + " w-full"}
                value={formula.multiplier}
                onChange={e => setDraft({ ...draft, targetFormula: { ...formula, multiplier: Number(e.target.value) } })}
              />
            </div>
            <p className="text-[10px] text-stone-400 leading-tight">
              {formula.type === "facility_count" ? "Multiplies count of linked facilities in the settlement." : "Multiplies the per-settlement scheme baseline."}
            </p>
          </div>
        )}
      </div>

      {/* Capture source */}
      <div className="border border-stone-200 rounded-lg p-3 bg-white space-y-2">
        <label className={labelCls}>Capture Source</label>
        <div className="flex flex-wrap gap-1.5">
          {(["MIS_API", "RP_ACTIVITY", "MANUAL_ADMIN"] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setDraft({ ...draft, captureSource: s, misProviderId: s === "MIS_API" ? draft.misProviderId : null })}
              className={`px-2.5 py-1 text-xs rounded-full border flex items-center gap-1 ${draft.captureSource === s ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}
            >
              {s === "MIS_API" && <Cloud className="w-3 h-3" />}
              {s === "RP_ACTIVITY" && <Activity className="w-3 h-3" />}
              {s === "MANUAL_ADMIN" && <User className="w-3 h-3" />}
              {s === "MIS_API" ? "MIS API" : s === "RP_ACTIVITY" ? "RP Activity" : "Manual Admin"}
            </button>
          ))}
        </div>
        {draft.captureSource === "MIS_API" && (
          <div className="space-y-2 pt-1">
            <div>
              <label className={labelCls}>MIS Provider</label>
              <select
                className={inputCls + " w-full"}
                value={draft.misProviderId ?? ""}
                onChange={e => setDraft({ ...draft, misProviderId: e.target.value || null })}
              >
                <option value="">— Select provider —</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {providers.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  No providers configured. <Link href="/settings/mis-providers" className="underline">Add one →</Link>
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Fetch Config (JSON)</label>
              <textarea
                className={inputCls + " w-full font-mono text-xs"}
                rows={3}
                value={draft.misFetchConfig ? JSON.stringify(draft.misFetchConfig, null, 2) : ""}
                onChange={e => {
                  try {
                    setDraft({ ...draft, misFetchConfig: e.target.value ? JSON.parse(e.target.value) : null });
                  } catch {
                    /* parse error — keep raw text in input but don't update draft */
                  }
                }}
                placeholder={`{ "endpoint": "/api/method/...", "valuePath": "data.enrollment_pct", "settlementCodePath": "data.slum_code" }`}
              />
              <p className="text-[10px] text-stone-400 mt-0.5">
                Provider-specific. Frappe example: <code>endpoint</code>, <code>valuePath</code>, <code>settlementCodePath</code>.
              </p>
            </div>
          </div>
        )}
        {draft.captureSource === "RP_ACTIVITY" && (
          <p className="text-[10px] text-stone-400 leading-relaxed">
            Bindings to specific checklist items will be added on the indicator detail page (next step).
            For now, save the indicator and bind it from the template editor.
          </p>
        )}
      </div>

      {/* Staleness + scheme + active + order */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>Stale Yellow (days)</label>
          <input
            type="number"
            className={inputCls + " w-full"}
            value={draft.staleYellowDays}
            onChange={e => setDraft({ ...draft, staleYellowDays: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelCls}>Stale Red (days)</label>
          <input
            type="number"
            className={inputCls + " w-full"}
            value={draft.staleRedDays}
            onChange={e => setDraft({ ...draft, staleRedDays: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelCls}>Linked Scheme</label>
          <select
            className={inputCls + " w-full"}
            value={draft.schemeId ?? ""}
            onChange={e => setDraft({ ...draft, schemeId: e.target.value || null })}
          >
            <option value="">— None —</option>
            {schemes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Sort Order</label>
          <input
            type="number"
            className={inputCls + " w-full"}
            value={draft.sortOrder}
            onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="flex justify-between items-center pt-1">
        <label className="flex items-center gap-1.5 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={e => setDraft({ ...draft, isActive: e.target.checked })}
          />
          Active
        </label>
        <div className="flex gap-2 items-center">
          {error && <span className="text-xs text-red-500">{error}</span>}
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg text-stone-500 hover:bg-stone-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSave}
            disabled={saving || !draft.label || !draft.domain}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
