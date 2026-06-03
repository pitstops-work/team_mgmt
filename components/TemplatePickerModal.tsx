"use client";

import { useState, useEffect, useMemo } from "react";
import { X, ChevronRight, ChevronDown, Layers, ArrowRight, Search } from "lucide-react";
import { MultiFacilityCalendar } from "@/components/pitstops/MultiFacilityCalendar";

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
  linkedFacilityLayerKey?: string | null;
  parameters: TemplateParameter[];
}

interface FacilityOption {
  id: string;
  name: string;
  cluster: string;
  settlement: string;
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

interface UserOption { id: string; name: string | null; image: string | null; designation?: string; reportsToId?: string | null }

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
  const [recurrence, setRecurrence] = useState<"None"|"Weekly"|"Monthly"|"Quarterly"|"Yearly">("None");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewPitstop[]>([]);
  const [expandedPreview, setExpandedPreview] = useState<Set<number>>(new Set());
  // Owner — ZL/PM can create goals on behalf of an RP
  const canPickOwner =
    ["ZL", "PM", "admin", "super-admin"].includes(currentUserDesignation ?? "") ||
    ["admin", "super-admin"].includes(currentUserRole ?? "");

  // Filter allUsers to only those the current user can delegate to (hierarchy-aware)
  const visibleUsers: UserOption[] = (() => {
    const isAdmin = ["admin", "super-admin"].includes(currentUserRole ?? "");
    if (isAdmin) return allUsers;

    if (currentUserDesignation === "ZL") {
      // ZL can create for their direct RP reportees only
      return allUsers.filter(u => u.reportsToId === currentUserId);
    }
    if (currentUserDesignation === "PM") {
      // PM can create for direct ZL reportees + those ZLs' RP reportees
      const directIds = new Set(
        allUsers.filter(u => u.reportsToId === currentUserId).map(u => u.id)
      );
      return allUsers.filter(u => u.reportsToId === currentUserId || (u.reportsToId && directIds.has(u.reportsToId)));
    }
    return [];
  })();

  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(currentUserId ?? "");
  const [linkedFacilityIds, setLinkedFacilityIds] = useState<Set<string>>(new Set());
  // Per-facility startDate (YMD) when 2+ facilities are selected, so each
  // resulting goal lands on its own day instead of all sharing the modal's
  // single startDate. See MultiFacilityCalendar.
  const [facilityStartDates, setFacilityStartDates] = useState<Map<string, string>>(new Map());
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [facilitySearch, setFacilitySearch] = useState("");
  const [facilityLayerLabels, setFacilityLayerLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");

  // Which level was pre-filled from the caller (determines which dropdowns are locked)
  const clickedLevel: "none" | "city" | "zone" | "cluster" | "settlement" =
    needsSettlementId ? "settlement" :
    needsClusterId    ? "cluster"    :
    needsZoneId       ? "zone"       :
    needsCityId       ? "city"       : "none";

  const lockedCity       = clickedLevel !== "none";
  const lockedZone       = ["zone", "cluster", "settlement"].includes(clickedLevel);
  const lockedCluster    = ["cluster", "settlement"].includes(clickedLevel);
  const lockedSettlement = clickedLevel === "settlement";

  const [geoRaw, setGeoRaw] = useState<RawGeo | null>(null);
  const [geoVal, setGeoVal] = useState<GeoVal>({ cityId: "", zoneId: "", clusterId: "", settlementId: "" });

  // Geo requirements by designation
  const geoMinLevel: "city" | "zone" | "cluster" =
    currentUserDesignation === "RP"  ? "cluster" :
    currentUserDesignation === "ZL"  ? "zone"    : "city";

  const isGeoValid = () => {
    if (!geoVal.cityId) return false;
    if (geoMinLevel === "zone"    && !geoVal.zoneId)    return false;
    if (geoMinLevel === "cluster" && !geoVal.clusterId) return false;
    return true;
  };

  // Always fetch geo when entering the geo step
  useEffect(() => {
    if (step !== "geo" || geoRaw) return;
    fetch("/api/admin/geography")
      .then(r => r.json())
      .then((d: RawGeo) => setGeoRaw(d))
      .catch(() => {});
  }, [step, geoRaw]);

  // Once geo data loads, pre-populate geoVal from the pre-filled IDs (resolve parents if needed)
  useEffect(() => {
    if (!geoRaw || clickedLevel === "none") return;
    let cityId    = needsCityId    ?? "";
    let zoneId    = needsZoneId    ?? "";
    let clusterId = needsClusterId ?? "";
    const settlementId = needsSettlementId ?? "";

    if (zoneId && !cityId) {
      cityId = geoRaw.zones.find(z => z.id === zoneId)?.cityId ?? "";
    }
    if (clusterId && !zoneId) {
      for (const zone of geoRaw.zones) {
        if (zone.clusters.some(c => c.id === clusterId)) { zoneId = zone.id; cityId = zone.cityId; break; }
      }
    }
    if (settlementId && !clusterId) {
      outer: for (const zone of geoRaw.zones) {
        for (const cluster of zone.clusters) {
          if (cluster.settlements.some(s => s.id === settlementId)) {
            clusterId = cluster.id; zoneId = zone.id; cityId = zone.cityId; break outer;
          }
        }
      }
    }
    setGeoVal({ cityId, zoneId, clusterId, settlementId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoRaw]);

  // Fetch facility layer labels once
  useEffect(() => {
    fetch("/api/admin/facility-layers")
      .then(r => r.json())
      .then((rows: { layerKey: string; label: string }[]) => {
        const map: Record<string, string> = {};
        rows.forEach(r => { map[r.layerKey] = r.label; });
        setFacilityLayerLabels(map);
      })
      .catch(() => {});
  }, []);

  // Fetch facilities when the selected template has a linked facility layer
  useEffect(() => {
    if (!selected?.linkedFacilityLayerKey) { setFacilities([]); return; }
    fetch(`/api/map/geojson/layer-features?layerKey=${encodeURIComponent(selected.linkedFacilityLayerKey)}`)
      .then(r => r.json())
      .then((geojson: { features: { properties: { id: string; name: string; cluster: string; matched_settlement: string } }[] }) => {
        setFacilities(geojson.features.map(f => ({
          id: f.properties.id,
          name: f.properties.name,
          cluster: f.properties.cluster ?? "",
          settlement: f.properties.matched_settlement ?? "",
        })));
      })
      .catch(() => {});
  }, [selected?.linkedFacilityLayerKey]);

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
    setLinkedFacilityIds(new Set());
    setFacilityStartDates(new Map());
    setFacilitySearch("");
    setStep("geo");
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
    if (selected.linkedFacilityLayerKey && linkedFacilityIds.size === 0) return false;
    // When multi-selecting, every chosen facility must have its own startDate
    // (so the resulting goals don't all land on the same day). Single-select
    // falls back to the modal-level startDate above.
    if (selected.linkedFacilityLayerKey && linkedFacilityIds.size > 1) {
      for (const fid of linkedFacilityIds) {
        if (!facilityStartDates.get(fid)) return false;
      }
    }
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
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid() || !selected) return;
    setLoading(true);
    setError("");
    try {
      const countKey = selected.parameters.find(p => p.type === "number")?.key;
      const raw = countKey ? paramValues[countKey] : undefined;
      const parameterVal = raw !== undefined && raw !== "" ? parseInt(raw, 10) : NaN;

      const facilityIds = selected.linkedFacilityLayerKey && linkedFacilityIds.size > 0
        ? Array.from(linkedFacilityIds)
        : [null];

      const basePayload = {
        description: description.trim() || null,
        startDate,
        targetDate: computedTargetDate(),
        params: buildParams(),
        needsDomain: needsDomain ?? selected.needsDomain ?? null,
        parameter: isNaN(parameterVal) ? null : parameterVal,
        needsSettlementId: geoVal.settlementId || null,
        needsClusterId: geoVal.clusterId || null,
        needsZoneId: geoVal.zoneId || null,
        needsCityId: geoVal.cityId || null,
        recurrence,
        ...(canPickOwner && selectedOwnerId && selectedOwnerId !== currentUserId
          ? { ownerId: selectedOwnerId }
          : {}),
      };

      const facility = (id: string | null) =>
        selected.linkedFacilityLayerKey ? { linkedFacilityId: id } : {};

      const facilityNames = new Map(facilities.map(f => [f.id, f.name]));

      // When >1 facility, each goal's startDate comes from the calendar grid.
      // basePayload.startDate is left as the modal-level default for single-
      // facility flows. Per-facility goals override below.
      const results = await Promise.all(
        facilityIds.map((fId, i) => {
          const goalTitle = facilityIds.length > 1
            ? `${title.trim()} — ${facilityNames.get(fId!) ?? `Facility ${i + 1}`}`
            : title.trim();
          const perFacilityStart = (fId && facilityIds.length > 1) ? facilityStartDates.get(fId) : undefined;
          const startDateOverride = perFacilityStart
            ? { startDate: perFacilityStart }
            : {};
          return fetch(`/api/templates/${selected.id}/apply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...basePayload, ...startDateOverride, title: goalTitle, ...facility(fId) }),
          }).then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); });
        }),
      );

      onCreated(results[0]);
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

  const filteredFacilities = useMemo(() => {
    const q = facilitySearch.toLowerCase();
    return facilities.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.cluster.toLowerCase().includes(q) ||
      f.settlement.toLowerCase().includes(q)
    );
  }, [facilities, facilitySearch]);

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
                onClick={() => step === "configure" ? setStep("geo") : setStep("pick")}
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

              {/* Owner picker — always shown so every user knows who owns the goal */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <label className="block text-xs font-semibold text-amber-800 mb-1.5">Creating for</label>
                {canPickOwner && visibleUsers.length > 0 ? (
                  <>
                    <select
                      value={selectedOwnerId}
                      onChange={e => setSelectedOwnerId(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    >
                      <option value={currentUserId ?? ""}>Myself</option>
                      {visibleUsers.map(u => (
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
                  </>
                ) : (
                  <p className="text-sm text-amber-800 font-medium">
                    {allUsers.find(u => u.id === currentUserId)?.name ?? "Myself"}
                  </p>
                )}
              </div>

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
                      {lockedCity && <span className="ml-1 text-[10px] text-sky-500 font-normal">(from selection)</span>}
                    </label>
                    <select
                      value={geoVal.cityId}
                      onChange={e => setGeoVal({ cityId: e.target.value, zoneId: "", clusterId: "", settlementId: "" })}
                      disabled={lockedCity}
                      className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white disabled:bg-stone-50 disabled:text-stone-500"
                    >
                      <option value="">— select city —</option>
                      {geoRaw.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Zone */}
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      Zone{geoMinLevel !== "city" ? <span className="text-red-400"> *</span> : <span className="text-stone-400 font-normal"> (optional for city-level goals)</span>}
                      {lockedZone && <span className="ml-1 text-[10px] text-sky-500 font-normal">(from selection)</span>}
                    </label>
                    <select
                      value={geoVal.zoneId}
                      onChange={e => setGeoVal(v => ({ ...v, zoneId: e.target.value, clusterId: "", settlementId: "" }))}
                      disabled={!geoVal.cityId || lockedZone}
                      className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white disabled:opacity-40 disabled:bg-stone-50"
                    >
                      <option value="">— select zone —</option>
                      {geoRaw.zones.filter(z => z.cityId === geoVal.cityId).map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </div>

                  {/* Cluster */}
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      Cluster{geoMinLevel === "cluster" ? <span className="text-red-400"> *</span> : <span className="text-stone-400 font-normal"> (optional)</span>}
                      {lockedCluster && <span className="ml-1 text-[10px] text-sky-500 font-normal">(from selection)</span>}
                    </label>
                    <select
                      value={geoVal.clusterId}
                      onChange={e => setGeoVal(v => ({ ...v, clusterId: e.target.value, settlementId: "" }))}
                      disabled={!geoVal.zoneId || lockedCluster}
                      className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white disabled:opacity-40 disabled:bg-stone-50"
                    >
                      <option value="">— select cluster —</option>
                      {geoRaw.zones.find(z => z.id === geoVal.zoneId)?.clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Settlement */}
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      Settlement <span className="text-stone-400 font-normal">(optional)</span>
                      {lockedSettlement && <span className="ml-1 text-[10px] text-sky-500 font-normal">(from selection)</span>}
                    </label>
                    <select
                      value={geoVal.settlementId}
                      onChange={e => setGeoVal(v => ({ ...v, settlementId: e.target.value }))}
                      disabled={!geoVal.clusterId || lockedSettlement}
                      className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white disabled:opacity-40 disabled:bg-stone-50"
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
              {canPickOwner && selectedOwnerId && selectedOwnerId !== currentUserId && visibleUsers.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Creating for</p>
                    <p className="text-sm text-amber-700">{visibleUsers.find(u => u.id === selectedOwnerId)?.name ?? selectedOwnerId}</p>
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

              {/* Linked facility picker — multi-select */}
              {selected.linkedFacilityLayerKey && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                      Select {facilityLayerLabels[selected.linkedFacilityLayerKey] ?? selected.linkedFacilityLayerKey ?? "Facility"}
                    </p>
                    {linkedFacilityIds.size > 0 && (
                      <span className="text-xs font-medium text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                        {linkedFacilityIds.size} selected
                      </span>
                    )}
                  </div>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                    <input
                      type="text"
                      value={facilitySearch}
                      onChange={e => setFacilitySearch(e.target.value)}
                      placeholder="Search by name or cluster…"
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                  {facilities.length === 0 ? (
                    <p className="text-xs text-stone-400 text-center py-4">Loading facilities…</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
                      {filteredFacilities.length === 0 ? (
                        <p className="text-xs text-stone-400 text-center py-4">No matches</p>
                      ) : filteredFacilities.map(f => {
                        const checked = linkedFacilityIds.has(f.id);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setLinkedFacilityIds(prev => {
                                const next = new Set(prev);
                                if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                                return next;
                              });
                              // Drop any assigned date when a facility is unselected.
                              if (linkedFacilityIds.has(f.id)) {
                                setFacilityStartDates(prev => {
                                  const next = new Map(prev);
                                  next.delete(f.id);
                                  return next;
                                });
                              }
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                              checked ? "bg-sky-50 text-sky-800" : "hover:bg-stone-50 text-stone-700"
                            }`}
                          >
                            <span className={`w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                              checked ? "bg-sky-500 border-sky-500" : "border-stone-300"
                            }`}>
                              {checked && (
                                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className="font-medium truncate flex-1">{f.name}</span>
                            <span className="text-xs text-stone-400 shrink-0">{f.cluster || f.settlement}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {linkedFacilityIds.size === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Select at least one facility to continue.</p>
                  )}

                  {/* Calendar-grid stagger: shown when 2+ facilities are
                      selected. Each facility gets its own startDate so the
                      resulting goals don't all land on the same day. Required
                      for RPs covering many sites (e.g. Abdul + 21 creches). */}
                  {linkedFacilityIds.size > 1 && (() => {
                    const selectedFacilities = facilities
                      .filter(f => linkedFacilityIds.has(f.id))
                      .map(f => ({ id: f.id, name: f.name, cluster: f.cluster || f.settlement || null }));
                    const allAssigned = selectedFacilities.every(f => facilityStartDates.has(f.id));
                    return (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                            Assign each {facilityLayerLabels[selected.linkedFacilityLayerKey ?? ""] ?? "facility"} a visit day
                          </p>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            allAssigned ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {facilityStartDates.size} / {selectedFacilities.length} assigned
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 mb-2 leading-snug">
                          Drag a facility onto a day, or click a facility then click a day. Click an assigned chip on the calendar to remove it.
                        </p>
                        <MultiFacilityCalendar
                          facilities={selectedFacilities}
                          value={facilityStartDates}
                          onChange={setFacilityStartDates}
                          startMonthYmd={startDate || undefined}
                        />
                        {!allAssigned && (
                          <p className="text-xs text-amber-600 mt-1.5">
                            Assign a day to every selected facility before creating.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Parameters */}
              {selected.parameters.length > 0 && (
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
              )}

              {/* Dates + Recurrence */}
              <div className="flex gap-3 items-start">
                <div className="flex-1">
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
                    End date from SLA:{" "}
                    <span className="text-stone-600 font-medium">
                      {startDate
                        ? new Date(computedTargetDate()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </span>
                  </p>
                </div>
                <div className="w-36 flex-shrink-0">
                  <label className="block text-xs font-medium text-stone-600 mb-1">Recurrence</label>
                  <select
                    value={recurrence}
                    onChange={e => setRecurrence(e.target.value as typeof recurrence)}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  >
                    <option value="None">One-off</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </div>
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
              {loading
                ? "Creating…"
                : linkedFacilityIds.size > 1
                  ? `Create ${linkedFacilityIds.size} Goals`
                  : "Create Goal"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
