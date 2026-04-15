"use client";

import { useState, useEffect } from "react";
import { X, Target, ChevronRight, ChevronLeft } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DomainConfig { domain: string; label: string; color: string }

interface RawGeo {
  cities: { id: string; name: string }[];
  zones: { id: string; name: string; cityId: string }[];
  clusters: { id: string; name: string; zoneId: string }[];
  settlements: { id: string; name: string; clusterId: string }[];
}

type GeoVal = { cityId: string; zoneId: string; clusterId: string; settlementId: string };

interface GapData {
  targets: Record<string, number>;
  existing: Record<string, number>;
  actuals: Record<string, { done: number; inProgress: number }>;
}

export interface GoalPrefill {
  needsDomain: string;
  domainLabel: string;
  domainColor: string;
  gap: number;
  needsZoneId?: string;
  needsClusterId?: string;
  needsSettlementId?: string;
  geoLabel: string;
}

interface Props {
  onClose: () => void;
  onCreated: (goal: unknown) => void;
  prefill?: GoalPrefill;
}

// ── Domain list (mirrors NeedsPanel) ─────────────────────────────────────────

const DOMAINS: DomainConfig[] = [
  { domain: "Creche",            label: "Creches",           color: "#ec4899" },
  { domain: "ChildrenCentre",    label: "Children Centres",  color: "#f97316" },
  { domain: "YouthGroup",        label: "Youth Groups",      color: "#8b5cf6" },
  { domain: "ElderlyKitchen",    label: "Elderly Kitchens",  color: "#10b981" },
  { domain: "PalliativeSupport", label: "Palliative",        color: "#6366f1" },
  { domain: "CommunityToilet",   label: "Comm. Toilets",     color: "#0ea5e9" },
  { domain: "WaterATM",          label: "Water ATMs",        color: "#14b8a6" },
];

// ── Step 1: Geography picker ──────────────────────────────────────────────────

function GeoStep({
  geo,
  value,
  onChange,
}: {
  geo: RawGeo;
  value: GeoVal;
  onChange: (v: GeoVal) => void;
}) {
  const { cityId, zoneId, clusterId, settlementId } = value;
  const sel = "w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white";

  const filteredZones      = cityId  ? geo.zones.filter(z => z.cityId === cityId)        : geo.zones;
  const filteredClusters   = zoneId  ? geo.clusters.filter(c => c.zoneId === zoneId)     : geo.clusters;
  const filteredSettlements= clusterId ? geo.settlements.filter(s => s.clusterId === clusterId) : geo.settlements;

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-400">
        Select where this goal will make a difference. You can assign it to a zone, cluster, or a specific settlement.
      </p>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">City</label>
        <select value={cityId} onChange={e => onChange({ cityId: e.target.value, zoneId: "", clusterId: "", settlementId: "" })} className={sel}>
          <option value="">All cities</option>
          {geo.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">
          Zone <span className="text-stone-300 font-normal">(required)</span>
        </label>
        <select value={zoneId} onChange={e => onChange({ cityId, zoneId: e.target.value, clusterId: "", settlementId: "" })} className={sel}>
          <option value="">— select zone —</option>
          {filteredZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>
      {zoneId && (
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Cluster <span className="text-stone-300 font-normal">(optional)</span>
          </label>
          <select value={clusterId} onChange={e => onChange({ cityId, zoneId, clusterId: e.target.value, settlementId: "" })} className={sel}>
            <option value="">— all clusters in zone —</option>
            {filteredClusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {clusterId && (
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Settlement <span className="text-stone-300 font-normal">(optional)</span>
          </label>
          <select value={settlementId} onChange={e => onChange({ cityId, zoneId, clusterId, settlementId: e.target.value })} className={sel}>
            <option value="">— all settlements in cluster —</option>
            {filteredSettlements.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {(settlementId || clusterId || zoneId) && (
        <p className="text-xs text-sky-600 font-medium bg-sky-50 px-3 py-2 rounded-lg">
          Actuals will count toward:{" "}
          {settlementId
            ? geo.settlements.find(s => s.id === settlementId)?.name
            : clusterId
            ? geo.clusters.find(c => c.id === clusterId)?.name
            : geo.zones.find(z => z.id === zoneId)?.name}
        </p>
      )}
    </div>
  );
}

// ── Step 2: Domain cards ──────────────────────────────────────────────────────

function DomainStep({
  gapData,
  selected,
  onSelect,
}: {
  gapData: GapData | null;
  selected: string;
  onSelect: (domain: string, label: string, color: string, gap: number) => void;
}) {
  if (!gapData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex gap-1">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-400">
        Select the need this goal will address. Gaps shown are unmet targets after existing services and in-progress goals.
      </p>
      <div className="space-y-2 pt-1">
        {DOMAINS.map(d => {
          const target     = Math.max(0, (gapData.targets[d.domain] ?? 0) - (gapData.existing[d.domain] ?? 0));
          const done       = gapData.actuals[d.domain]?.done ?? 0;
          const inProgress = gapData.actuals[d.domain]?.inProgress ?? 0;
          const gap        = Math.max(0, target - done);
          const isActive   = selected === d.domain;
          const noGap      = gap === 0;

          return (
            <button
              key={d.domain}
              onClick={() => onSelect(d.domain, d.label, d.color, gap)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                isActive
                  ? "shadow-sm"
                  : noGap
                  ? "border-stone-100 opacity-50 hover:opacity-70"
                  : "border-stone-100 hover:border-stone-200"
              }`}
              style={isActive ? { borderColor: d.color, background: d.color + "12" } : {}}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color, opacity: noGap ? 0.4 : 1 }} />
                <span className={`text-sm font-semibold flex-1 ${isActive ? "" : "text-stone-700"}`}
                  style={isActive ? { color: d.color } : {}}>
                  {d.label}
                </span>
                {noGap ? (
                  <span className="text-[10px] font-bold text-emerald-500">✓ met</span>
                ) : (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: d.color + "20", color: d.color }}>
                    gap {gap}
                  </span>
                )}
              </div>
              {!noGap && (
                <div className="mt-1.5 pl-5 flex items-center gap-3 text-[10px] text-stone-400">
                  <span>target {target}</span>
                  <span>·</span>
                  <span>done {done}</span>
                  {inProgress > 0 && <><span>·</span><span className="text-amber-500">+{inProgress} in progress</span></>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Goal form (step 3 or prefill mode) ───────────────────────────────────────

function GoalForm({
  title, setTitle,
  description, setDescription,
  targetDate, setTargetDate,
  status, setStatus,
  parameter, setParameter,
  contextLabel,
  contextColor,
  domainLabel,
  loading,
  error,
  onSubmit,
  onBack,
}: {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  targetDate: string; setTargetDate: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  parameter: string; setParameter: (v: string) => void;
  contextLabel: string;
  contextColor: string;
  domainLabel: string;
  loading: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onBack?: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Context banner */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium"
        style={{ background: contextColor + "15", color: contextColor }}>
        <Target className="w-4 h-4 flex-shrink-0" />
        <span>
          <span className="font-bold">{domainLabel}</span>
          {" "}in{" "}
          <span className="font-bold">{contextLabel}</span>
        </span>
      </div>

      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What are you working toward?"
          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">
          Units committed{" "}
          <span className="text-stone-300 font-normal">(how many {domainLabel.toLowerCase()} this goal will deliver)</span>
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={parameter}
          onChange={e => setParameter(e.target.value)}
          placeholder="e.g. 2"
          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional context or approach..."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Deadline <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-stone-600 mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
          >
            <option value="Active">Active</option>
            <option value="Paused">Paused</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-between gap-2 pt-1">
        {onBack ? (
          <button type="button" onClick={onBack}
            className="flex items-center gap-1 px-3 py-2 text-sm text-stone-500 hover:text-stone-800 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        ) : <div />}
        <button
          type="submit"
          disabled={!title.trim() || !targetDate || loading}
          className="px-5 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {loading ? "Creating…" : "Create Goal"}
        </button>
      </div>
    </form>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function CreateGoalModal({ onClose, onCreated, prefill }: Props) {
  // Wizard step (ignored when prefill provided — goes straight to form)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: geography
  const [geoVal, setGeoVal] = useState<GeoVal>({ cityId: "", zoneId: "", clusterId: "", settlementId: "" });
  const [geo, setGeo] = useState<RawGeo | null>(null);

  // Step 2: domain
  const [gapData, setGapData] = useState<GapData | null>(null);
  const [needsDomain, setNeedsDomain]     = useState(prefill?.needsDomain     ?? "");
  const [selectedDomainLabel, setLabel]   = useState(prefill?.domainLabel     ?? "");
  const [selectedDomainColor, setColor]   = useState(prefill?.domainColor     ?? "#6366f1");

  // Step 3: goal form
  const [title, setTitle]           = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus]         = useState("Active");
  const [parameter, setParameter]   = useState(prefill?.gap ? String(prefill.gap) : "");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  // Fetch geo data on mount (needed for both wizard and prefill display)
  useEffect(() => {
    fetch("/api/geography").then(r => r.json()).then(setGeo);
  }, []);

  // Fetch gap data when entering step 2
  useEffect(() => {
    if (step !== 2) return;
    const { zoneId, clusterId, settlementId } = geoVal;
    if (!zoneId) return;
    const params = new URLSearchParams();
    if (settlementId) params.set("settlementId", settlementId);
    else if (clusterId) params.set("clusterId", clusterId);
    else params.set("zoneId", zoneId);
    setGapData(null);
    fetch(`/api/needs/gap?${params}`).then(r => r.json()).then(setGapData);
  }, [step, geoVal]);

  const geoLabel = prefill?.geoLabel ?? (() => {
    if (!geo) return "";
    const { zoneId, clusterId, settlementId } = geoVal;
    if (settlementId) return geo.settlements.find(s => s.id === settlementId)?.name ?? "";
    if (clusterId)    return geo.clusters.find(c => c.id === clusterId)?.name ?? "";
    if (zoneId)       return geo.zones.find(z => z.id === zoneId)?.name ?? "";
    return "";
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) return;
    setLoading(true);
    setError("");

    // Resolve geo IDs — prefer prefill, then wizard selection
    const resolvedNeedsSettlementId = prefill?.needsSettlementId ?? (geoVal.settlementId || undefined);
    const resolvedNeedsClusterId    = prefill?.needsClusterId    ?? (!geoVal.settlementId && geoVal.clusterId ? geoVal.clusterId : undefined);
    const resolvedNeedsZoneId       = prefill?.needsZoneId       ?? (!geoVal.settlementId && !geoVal.clusterId && geoVal.zoneId ? geoVal.zoneId : undefined);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      targetDate,
      needsDomain: needsDomain || null,
      ...(parameter && { parameter: parseFloat(parameter) }),
      ...(resolvedNeedsSettlementId && { needsSettlementId: resolvedNeedsSettlementId }),
      ...(resolvedNeedsClusterId    && { needsClusterId: resolvedNeedsClusterId }),
      ...(resolvedNeedsZoneId       && { needsZoneId: resolvedNeedsZoneId }),
    };

    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed");
      onCreated(await res.json());
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  // Determine which step to render
  const effectiveStep = prefill ? 3 : step;

  const stepLabel = prefill ? "New Goal" : (
    effectiveStep === 1 ? "Where?" :
    effectiveStep === 2 ? "Which need?" :
    "Define the goal"
  );

  const canGoToStep2 = !!geoVal.zoneId;
  const canGoToStep3 = !!needsDomain;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            {!prefill && effectiveStep > 1 && (
              <span className="text-xs text-stone-300">
                Step {effectiveStep} of 3
              </span>
            )}
            <h2 className="text-base font-semibold text-stone-900">{stepLabel}</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator (wizard only) */}
        {!prefill && (
          <div className="flex px-6 pt-3 gap-1.5">
            {([1, 2, 3] as const).map(n => (
              <div key={n} className={`flex-1 h-1 rounded-full transition-colors ${
                n < effectiveStep ? "bg-sky-400" : n === effectiveStep ? "bg-sky-500" : "bg-stone-100"
              }`} />
            ))}
          </div>
        )}

        <div className="px-6 py-5">
          {/* Step 1: Geography */}
          {effectiveStep === 1 && (
            <>
              {!geo ? (
                <div className="flex justify-center py-8">
                  <div className="flex gap-1">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <GeoStep geo={geo} value={geoVal} onChange={setGeoVal} />
              )}
              <div className="flex justify-between pt-5">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-500 hover:text-stone-800 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => { setGapData(null); setStep(2); }}
                  disabled={!canGoToStep2}
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* Step 2: Domain */}
          {effectiveStep === 2 && (
            <>
              <DomainStep
                gapData={gapData}
                selected={needsDomain}
                onSelect={(domain, label, color, gap) => {
                  setNeedsDomain(domain);
                  setLabel(label);
                  setColor(color);
                  setParameter(gap > 0 ? String(gap) : "");
                }}
              />
              <div className="flex justify-between pt-5">
                <button type="button" onClick={() => setStep(1)}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-stone-500 hover:text-stone-800 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canGoToStep3}
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* Step 3 / prefill: Goal form */}
          {effectiveStep === 3 && (
            <GoalForm
              title={title} setTitle={setTitle}
              description={description} setDescription={setDescription}
              targetDate={targetDate} setTargetDate={setTargetDate}
              status={status} setStatus={setStatus}
              parameter={parameter} setParameter={setParameter}
              contextLabel={geoLabel}
              contextColor={selectedDomainColor}
              domainLabel={selectedDomainLabel}
              loading={loading}
              error={error}
              onSubmit={handleSubmit}
              onBack={prefill ? undefined : () => setStep(2)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
