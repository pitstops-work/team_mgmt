"use client";

import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronDown, Layers, ArrowRight, CalendarClock, AlertCircle } from "lucide-react";

// Sub-domains redirect to their parent programme
const SUB_DOMAIN_PARENT: Record<string, { label: string; templateId: string; programmeName: string }> = {
  YouthGroup:       { label: "Youth Groups",       templateId: "youth-resource-centre", programmeName: "Youth Resource Centre" },
  PalliativeSupport:{ label: "Palliative Support",  templateId: "elderly-centre",        programmeName: "Elderly Care Centre & Outreach" },
  ReferralSystem:   { label: "Referral System",     templateId: "elderly-centre",        programmeName: "Elderly Care Centre & Outreach" },
};

interface TemplateParameter {
  key: string;
  label: string;
  type: "number" | "text" | "choice";
  min?: number;
  max?: number;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  needsDomain: string | null;
  parameters: TemplateParameter[];
}

interface PreviewPitstop {
  title: string;
  type: string;
  notes: string;
  startSlaDays: number;
  slaDays: number;
  recurrence?: string;
  checklist: { text: string; activityTitle?: string }[];
}

interface UserOption { id: string; name: string | null; image: string | null; designation?: string }

interface Props {
  onClose: () => void;
  onCreated: (goal: unknown) => void;
  // When opened from the needs dashboard or map — pre-selects template + geo
  needsDomain?: string;
  needsSettlementId?: string;
  needsClusterId?: string;
  needsZoneId?: string;
  needsCityId?: string;
  geographyLabel?: string;
  // How many existing facilities of this domain already exist at this geography
  existingCount?: number;
  // Current user context — drives owner picker visibility and geo requirements
  currentUserId?: string;
  currentUserDesignation?: string;
  currentUserRole?: string;
  allUsers?: UserOption[];
}

type Step = "pick" | "redirect" | "geo" | "configure";

// ── Geo types (matching /api/admin/geography response) ────────────────────────
type GeoSettlement = { id: string; name: string; clusterId: string };
type GeoCluster    = { id: string; name: string; zoneId: string; settlements: GeoSettlement[] };
type GeoZone       = { id: string; name: string; cityId: string; clusters: GeoCluster[] };
type GeoCity       = { id: string; name: string };
type RawGeo        = { cities: GeoCity[]; zones: GeoZone[] };
type GeoVal        = { cityId: string; zoneId: string; clusterId: string; settlementId: string };

export default function TemplatePickerModal({
  onClose, onCreated,
  needsDomain, needsSettlementId, needsClusterId, needsZoneId, needsCityId, geographyLabel,
  existingCount,
  currentUserId, currentUserDesignation, currentUserRole, allUsers = [],
}: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  // When domain context given: filtered set shown in "pick" step (empty = show all)
  const [domainTemplates, setDomainTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [step, setStep] = useState<Step>("pick");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewPitstop[]>([]);
  const [expandedPreview, setExpandedPreview] = useState<Set<number>>(new Set());
  // activitySchedules: "${pitstopIdx}_${checklistIdx}" → ISO date string (YYYY-MM-DD)
  const [activitySchedules, setActivitySchedules] = useState<Record<string, string>>({});
  // Owner — ZL/PM can create goals on behalf of an RP
  const canPickOwner =
    ["ZL", "PM", "admin", "super-admin"].includes(currentUserDesignation ?? "") ||
    ["admin", "super-admin"].includes(currentUserRole ?? "");
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(currentUserId ?? "");
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");

  // Geo step — only used when geo is NOT pre-filled from parent context
  const geoPreFilled = !!(needsCityId || needsClusterId || needsZoneId || needsSettlementId);
  const [geoRaw, setGeoRaw] = useState<RawGeo | null>(null);
  const [geoVal, setGeoVal] = useState<GeoVal>({ cityId: "", zoneId: "", clusterId: "", settlementId: "" });

  // Geo requirements by designation
  const geoMinLevel: "city" | "zone" | "cluster" =
    currentUserDesignation === "RP"  ? "cluster" :
    currentUserDesignation === "ZL"  ? "zone"    : "city";

  const isGeoValid = () => {
    if (geoPreFilled) return true;
    if (!geoVal.cityId) return false;
    if (geoMinLevel === "zone"    && !geoVal.zoneId)    return false;
    if (geoMinLevel === "cluster" && !geoVal.clusterId) return false;
    return true;
  };

  // Fetch geo when entering the geo step
  useEffect(() => {
    if (step !== "geo" || geoRaw || geoPreFilled) return;
    fetch("/api/admin/geography")
      .then(r => r.json())
      .then((d: RawGeo) => setGeoRaw(d))
      .catch(() => {});
  }, [step, geoRaw, geoPreFilled]);

  const subDomainInfo = needsDomain ? SUB_DOMAIN_PARENT[needsDomain] : null;

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((list: Template[]) => {
        setTemplates(list);

        if (!needsDomain) return;

        // Sub-domain — redirect to parent programme
        if (SUB_DOMAIN_PARENT[needsDomain]) {
          setStep("redirect");
          return;
        }

        // Collect all templates for this domain
        const matching = list.filter((t) => t.needsDomain === needsDomain);
        const newTpl      = matching.find((t) => !t.name.includes("(Existing)"));
        const existingTpl = matching.find((t) =>  t.name.includes("(Existing)"));

        // Build the option set: always include "new"; include "existing" only if there are existing facilities
        const options: Template[] = [];
        if (newTpl) options.push(newTpl);
        if (existingTpl && (existingCount ?? 0) > 0) options.push(existingTpl);

        if (options.length === 0) {
          // No domain-specific templates — show full picker
          return;
        }
        if (options.length === 1) {
          // Only one choice — auto-select and advance
          selectTemplate(options[0]);
        } else {
          // Two choices (new + existing) — show domain-filtered picker
          setDomainTemplates(options);
          setStep("pick");
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTemplate = (t: Template) => {
    setSelected(t);
    setTitle(t.name);
    const init: Record<string, string> = {};
    t.parameters.forEach((p) => { init[p.key] = ""; });
    setParamValues(init);
    setPreview([]);
    setStep(geoPreFilled ? "configure" : "geo");
  };

  const buildParams = () => {
    const p: Record<string, string | number> = {};
    selected?.parameters.forEach((param) => {
      const v = paramValues[param.key];
      p[param.key] = param.type === "number" ? Number(v) || 0 : v;
    });
    return p;
  };

  const handlePreview = async () => {
    if (!selected) return;
    setPreviewing(true);
    try {
      const res = await fetch(`/api/templates/${selected.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: buildParams() }),
      });
      if (res.ok) {
        const pts: PreviewPitstop[] = await res.json();
        setPreview(pts);
        setActivitySchedules({});
      }
    } catch {
      // preview is optional
    } finally {
      setPreviewing(false);
    }
  };

  useEffect(() => {
    if (!selected || step !== "configure") return;
    const allFilled = selected.parameters.every((p) => paramValues[p.key] !== "");
    if (allFilled) handlePreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramValues, selected, step]);

  const slaWindowFor = (pt: PreviewPitstop) => {
    if (!startDate) return null;
    const base = new Date(startDate);
    const from = new Date(base); from.setDate(from.getDate() + pt.startSlaDays);
    const to   = new Date(base); to.setDate(to.getDate()   + pt.slaDays);
    return { from, to };
  };

  const isActivityDateValid = (pitstopIdx: number, checklistIdx: number) => {
    const key = `${pitstopIdx}_${checklistIdx}`;
    const dateStr = activitySchedules[key];
    if (!dateStr) return false;
    const pt = preview[pitstopIdx];
    const window = slaWindowFor(pt);
    if (!window) return true;
    const d = new Date(dateStr);
    return d >= window.from && d <= window.to;
  };

  // Collect all (pitstopIdx, checklistIdx) pairs that need a scheduled date
  const schedulableItems = preview.flatMap((pt, pi) =>
    pt.checklist.flatMap((item, ci) =>
      item.activityTitle ? [{ pi, ci, pt, item }] : []
    )
  );

  const computedTargetDate = (): string => {
    const maxSla = preview.length > 0 ? Math.max(...preview.map((pt) => pt.slaDays)) : 365;
    const d = new Date(startDate);
    d.setDate(d.getDate() + maxSla);
    return d.toISOString().split("T")[0];
  };

  const isValid = () => {
    if (!title.trim() || !startDate) return false;
    if (!selected) return false;
    if (!isGeoValid()) return false;
    const paramsOk = selected.parameters.every((p) => {
      const v = paramValues[p.key];
      if (!v) return false;
      if (p.type === "number") {
        const n = Number(v);
        if (isNaN(n) || n < (p.min ?? 1)) return false;
        if (p.max !== undefined && n > p.max) return false;
      }
      return true;
    });
    if (!paramsOk) return false;
    if (schedulableItems.length > 0) {
      for (const { pi, ci } of schedulableItems) {
        if (!isActivityDateValid(pi, ci)) return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid() || !selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/templates/${selected.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          startDate,
          targetDate: computedTargetDate(),
          params: buildParams(),
          needsDomain: needsDomain ?? selected.needsDomain ?? null,
          needsSettlementId: (needsSettlementId ?? geoVal.settlementId) || null,
          needsClusterId: (needsClusterId ?? geoVal.clusterId) || null,
          needsZoneId: (needsZoneId ?? geoVal.zoneId) || null,
          needsCityId: (needsCityId ?? geoVal.cityId) || null,
          activitySchedules,
          ...(canPickOwner && selectedOwnerId && selectedOwnerId !== currentUserId
            ? { ownerId: selectedOwnerId }
            : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      onCreated(await res.json());
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const togglePreviewExpand = (idx: number) => {
    setExpandedPreview((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Group templates by category for the pick step
  const byCategory = templates.reduce<Record<string, Template[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {(step === "geo" || step === "configure") && (
              <button
                onClick={() => {
                  if (step === "configure") {
                    // Go back: if geo was pre-filled and domain picker is available, go to pick; else go to geo
                    if (geoPreFilled && domainTemplates.length > 0) setStep("pick");
                    else if (geoPreFilled) setStep("pick");
                    else setStep("geo");
                  } else {
                    setStep("pick");
                  }
                }}
                className="text-stone-400 hover:text-stone-600 mr-1"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <Layers className="w-4 h-4 text-stone-400" />
            <div>
              <h2 className="text-base font-semibold text-stone-900 leading-tight">
                {step === "pick" ? "Create Goal from Template"
                  : step === "redirect" ? "Programme Note"
                  : step === "geo" ? "Where is this goal?"
                  : selected?.name}
              </h2>
              {geographyLabel && (
                <p className="text-xs text-stone-400">{geographyLabel}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">

          {/* Sub-domain redirect */}
          {step === "redirect" && subDomainInfo && (
            <div className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-800 mb-1">
                  {subDomainInfo.label} is tracked within {subDomainInfo.programmeName}
                </p>
                <p className="text-xs text-stone-500 leading-relaxed max-w-sm">
                  This domain is managed as part of the {subDomainInfo.programmeName} programme goal.
                  Create or update a {subDomainInfo.programmeName} goal to manage this work.
                </p>
              </div>
              <button
                onClick={() => {
                  const match = templates.find((t) => t.id === subDomainInfo.templateId);
                  if (match) selectTemplate(match);
                }}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Create {subDomainInfo.programmeName} Goal
              </button>
            </div>
          )}

          {/* Geo step */}
          {step === "geo" && (
            <div className="p-6 space-y-4">

              {/* Owner picker — shown here so it's visible before configure */}
              {canPickOwner && allUsers.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <label className="block text-xs font-semibold text-amber-800 mb-1.5">Creating for</label>
                  <select
                    value={selectedOwnerId}
                    onChange={e => setSelectedOwnerId(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  >
                    <option value={currentUserId ?? ""}>Myself</option>
                    {allUsers
                      .filter(u => u.id !== currentUserId)
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name ?? u.id}{u.designation && u.designation !== "Other" ? ` (${u.designation})` : ""}
                        </option>
                      ))}
                  </select>
                  {selectedOwnerId && selectedOwnerId !== currentUserId && (
                    <p className="text-[11px] text-amber-700 mt-1.5">
                      Goal and pitstop ownership will be assigned to this person.
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-stone-400">
                {geoMinLevel === "cluster"
                  ? "Select the cluster this goal belongs to. Cluster is required."
                  : geoMinLevel === "zone"
                  ? "Select the zone this goal belongs to. Zone is required."
                  : "Select the city scope. Leave zone/cluster blank for a city-wide goal."}
              </p>

              {!geoRaw ? (
                <p className="text-sm text-stone-400 text-center py-6">Loading geography…</p>
              ) : (
                <div className="space-y-3">
                  {/* City */}
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      City <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={geoVal.cityId}
                      onChange={e => setGeoVal({ cityId: e.target.value, zoneId: "", clusterId: "", settlementId: "" })}
                      className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                    >
                      <option value="">— select city —</option>
                      {geoRaw.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Zone */}
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      Zone{geoMinLevel !== "city" ? <span className="text-red-400"> *</span> : <span className="text-stone-400 font-normal"> (optional for city-level goals)</span>}
                    </label>
                    <select
                      value={geoVal.zoneId}
                      onChange={e => setGeoVal(v => ({ ...v, zoneId: e.target.value, clusterId: "", settlementId: "" }))}
                      disabled={!geoVal.cityId}
                      className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white disabled:opacity-40"
                    >
                      <option value="">— select zone —</option>
                      {geoRaw.zones.filter(z => z.cityId === geoVal.cityId).map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </div>

                  {/* Cluster */}
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      Cluster{geoMinLevel === "cluster" ? <span className="text-red-400"> *</span> : <span className="text-stone-400 font-normal"> (optional)</span>}
                    </label>
                    <select
                      value={geoVal.clusterId}
                      onChange={e => setGeoVal(v => ({ ...v, clusterId: e.target.value, settlementId: "" }))}
                      disabled={!geoVal.zoneId}
                      className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white disabled:opacity-40"
                    >
                      <option value="">— select cluster —</option>
                      {geoRaw.zones.find(z => z.id === geoVal.zoneId)?.clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Settlement */}
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      Settlement <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <select
                      value={geoVal.settlementId}
                      onChange={e => setGeoVal(v => ({ ...v, settlementId: e.target.value }))}
                      disabled={!geoVal.clusterId}
                      className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white disabled:opacity-40"
                    >
                      <option value="">— select settlement —</option>
                      {geoRaw.zones.find(z => z.id === geoVal.zoneId)?.clusters.find(c => c.id === geoVal.clusterId)?.settlements.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep("configure")}
                  disabled={!isGeoValid()}
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Template picker */}
          {step === "pick" && (
            <div className="p-6 space-y-5">
              {templates.length === 0 && (
                <p className="text-sm text-stone-400 text-center py-8">Loading templates…</p>
              )}

              {/* Domain-filtered picker: shown when + clicked from a specific domain gap */}
              {domainTemplates.length > 0 && (
                <div className="space-y-3">
                  {geographyLabel && (
                    <p className="text-xs text-stone-400">
                      Creating a goal for <span className="font-medium text-stone-600">{geographyLabel}</span>. Choose which kind:
                    </p>
                  )}
                  {domainTemplates.map((t) => {
                    const isExisting = t.name.includes("(Existing)");
                    return (
                      <button
                        key={t.id}
                        onClick={() => selectTemplate(t)}
                        className={`w-full text-left flex items-start gap-4 px-4 py-4 border rounded-xl transition-all group ${
                          isExisting
                            ? "bg-amber-50 hover:bg-amber-100 border-amber-200 hover:border-amber-300"
                            : "bg-sky-50 hover:bg-sky-100 border-sky-200 hover:border-sky-300"
                        }`}
                      >
                        <span className="text-2xl flex-shrink-0 mt-0.5">{t.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-stone-900">{t.name}</p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              isExisting
                                ? "bg-amber-200 text-amber-800"
                                : "bg-sky-200 text-sky-800"
                            }`}>
                              {isExisting ? "Existing" : "New"}
                            </span>
                          </div>
                          <p className="text-xs text-stone-500 leading-relaxed">{t.description}</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 ${isExisting ? "text-amber-300 group-hover:text-amber-500" : "text-sky-300 group-hover:text-sky-500"}`} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Full picker: shown when no domain context (general "New Goal" button) */}
              {domainTemplates.length === 0 && Object.entries(byCategory).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">{category}</p>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => selectTemplate(t)}
                        className="w-full text-left flex items-start gap-4 px-4 py-4 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-xl transition-all group"
                      >
                        <span className="text-2xl flex-shrink-0 mt-0.5">{t.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-900 mb-0.5">{t.name}</p>
                          <p className="text-xs text-stone-500 leading-relaxed">{t.description}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-500 flex-shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Configure */}
          {step === "configure" && selected && (
            <form id="template-form" onSubmit={handleSubmit} className="p-6 space-y-5">

              {/* Owner selection carried forward from geo step — show summary if not creating for self */}
              {canPickOwner && selectedOwnerId && selectedOwnerId !== currentUserId && allUsers.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Creating for</p>
                    <p className="text-sm text-amber-700">{allUsers.find(u => u.id === selectedOwnerId)?.name ?? selectedOwnerId}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedOwnerId(currentUserId ?? "")} className="text-xs text-amber-600 underline">Change</button>
                </div>
              )}

              {/* Goal title */}
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Goal Title</label>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Name this goal"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Any extra context…"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent resize-none"
                />
              </div>

              {/* Parameters */}
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Setup Questions</p>
                <div className="space-y-4">
                  {selected.parameters.map((param) => (
                    <div key={param.key}>
                      <label className="block text-xs font-medium text-stone-600 mb-1.5">{param.label}</label>
                      {param.type === "choice" && param.options ? (
                        <div className="flex gap-2 flex-wrap">
                          {param.options.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setParamValues((prev) => ({ ...prev, [param.key]: opt.value }))}
                              className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                                paramValues[param.key] === opt.value
                                  ? "bg-sky-500 border-sky-500 text-white font-medium shadow-sm"
                                  : "bg-white border-stone-200 text-stone-600 hover:border-sky-300 hover:bg-sky-50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type={param.type === "number" ? "number" : "text"}
                          value={paramValues[param.key] ?? ""}
                          onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
                          placeholder={param.placeholder ?? ""}
                          min={param.min}
                          max={param.max}
                          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Programme Start <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                />
                <p className="text-xs text-stone-400 mt-1">
                  Goal end date auto-computed from SLA:{" "}
                  <span className="text-stone-600 font-medium">
                    {startDate
                      ? new Date(computedTargetDate()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </span>
                </p>
              </div>

              {/* Pitstop preview */}
              {preview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                    Preview — {preview.length} pitstop{preview.length !== 1 ? "s" : ""} will be created
                  </p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {preview.map((pt, idx) => (
                      <div key={idx} className="border border-stone-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => togglePreviewExpand(idx)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-stone-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {pt.recurrence && pt.recurrence !== "None"
                              ? <span className="text-xs font-medium text-violet-500 flex-shrink-0">{pt.recurrence}</span>
                              : <span className="text-xs font-medium text-sky-600 flex-shrink-0">Day {pt.startSlaDays}–{pt.slaDays}</span>
                            }
                            <span className="text-xs font-medium text-stone-800 truncate">{pt.title}</span>
                            <span className="text-xs text-stone-400 flex-shrink-0">{pt.type}</span>
                          </div>
                          {expandedPreview.has(idx)
                            ? <ChevronDown className="w-3 h-3 text-stone-400 flex-shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-stone-400 flex-shrink-0" />
                          }
                        </button>
                        {expandedPreview.has(idx) && (
                          <div className="px-3 pb-3 bg-stone-50 border-t border-stone-100">
                            <p className="text-xs text-stone-600 mt-2 mb-2 leading-relaxed">{pt.notes}</p>
                            <ul className="space-y-1">
                              {pt.checklist.map((item, cIdx) => (
                                <li key={cIdx} className="flex items-start gap-1.5 text-xs text-stone-500">
                                  <span className="mt-0.5 w-3 h-3 border border-stone-300 rounded-sm flex-shrink-0" />
                                  {item.text}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity scheduling — required for each checklist item with an activityTitle */}
              {schedulableItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <CalendarClock className="w-3.5 h-3.5 text-sky-500" />
                    <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">Schedule RP Activities</p>
                  </div>
                  <p className="text-xs text-stone-400 mb-3 leading-relaxed">
                    Pick a date for each RP activity within its SLA window. All activities must be scheduled before creating the goal.
                  </p>
                  <div className="space-y-2">
                    {schedulableItems.map(({ pi, ci, pt, item }) => {
                      const key = `${pi}_${ci}`;
                      const window = slaWindowFor(pt);
                      const dateVal = activitySchedules[key] ?? "";
                      const valid = !dateVal || isActivityDateValid(pi, ci);
                      const fromStr = window ? window.from.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      const toStr   = window ? window.to.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      return (
                        <div key={key} className={`rounded-lg border p-3 ${valid ? "border-stone-200 bg-stone-50" : "border-red-200 bg-red-50"}`}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <p className="text-[10px] text-stone-400 truncate">{pt.title}</p>
                              <p className="text-xs font-semibold text-stone-800 truncate">{item.activityTitle}</p>
                              {window && (
                                <p className="text-[11px] text-stone-400 mt-0.5">SLA: {fromStr} – {toStr}</p>
                              )}
                            </div>
                            {dateVal && !valid && (
                              <div className="flex items-center gap-1 text-red-500 flex-shrink-0">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span className="text-[11px]">Outside window</span>
                              </div>
                            )}
                          </div>
                          <input
                            type="date"
                            value={dateVal}
                            min={window ? window.from.toISOString().split("T")[0] : undefined}
                            max={window ? window.to.toISOString().split("T")[0] : undefined}
                            onChange={(e) => setActivitySchedules(prev => ({ ...prev, [key]: e.target.value }))}
                            className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${
                              valid
                                ? "border-stone-200 bg-white focus:ring-sky-400"
                                : "border-red-300 bg-white focus:ring-red-400"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {previewing && <p className="text-xs text-stone-400">Generating preview…</p>}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
          )}
        </div>

        {/* Footer */}
        {step === "configure" && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-100 flex-shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors">
              Cancel
            </button>
            <button
              form="template-form"
              type="submit"
              disabled={!isValid() || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Creating…" : "Create Goal"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
