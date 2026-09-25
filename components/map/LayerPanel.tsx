"use client";

import type { ReactNode } from "react";
import { type LayerConfig, type LayerKey, type MapCity } from "@/lib/layers";
import type { FacilityLayer } from "@/components/map/MapDashboard";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import {
  HEALTH_WORK_COLOR, NO_HEALTH_WORK_COLOR, type ColorBy,
  HEALTH_WORK_KM, MAX_FACILITY_KM, SCHOOL_TYPES,
  type ClusterQuery, type ClusterRow, type QueryDimension,
  clusterMatches, hasHealthWork, schoolsWithin, canteensWithin, isQueryActive,
  normName, clustersToCsv, EMPTY_QUERY,
} from "@/lib/clusterQuery";

export const HEALTH_CENTRE_TYPES = [
  { key: "CRC",                        label: "CRC",                          color: "#7c3aed" },
  { key: "Foundation Health Centre",   label: "Foundation Health Centre",     color: "#0284c7" },
  { key: "Government Health Centre",   label: "Govt Health Centre (PHC/CHC)", color: "#059669" },
  { key: "Referral Helpdesk Hospital", label: "Referral Hospital",            color: "#d97706" },
  { key: "Super Speciality Hospital",  label: "Super Speciality",             color: "#dc2626" },
];

const COLOR_BY_OPTIONS: { key: ColorBy; label: string; hint: string }[] = [
  { key: "none",     label: "Nothing",       hint: "Neutral outlines, easiest to read" },
  { key: "partner",  label: "Partner",       hint: "Each partner's settlements in its colour" },
  { key: "health",   label: "Health work",   hint: `Clusters with a health centre ≤${HEALTH_WORK_KM} km` },
  { key: "progress", label: "Goal progress", hint: "Red / amber / green goal health" },
  { key: "needs",    label: "Needs",         hint: "Demand, gap or coverage by domain" },
];

interface LayerPanelProps {
  onClose?: () => void;
  activeCity: MapCity;
  onCityChange: (city: MapCity) => void;
  tab: "clusters" | "map";
  onTabChange: (t: "clusters" | "map") => void;

  query: ClusterQuery;
  onQueryChange: (q: ClusterQuery) => void;
  /** Every cluster in the active city, with partners attached. */
  rows: ClusterRow[];
  matched: ClusterRow[];
  mineClusters: Set<string> | null;
  loading: boolean;
  activeCluster: string | null;
  onClusterSelect: (cluster: string | null) => void;
  /** Label of a map click selection (settlement / zone / cluster) that currently overrides the filters. */
  selectionLabel: string | null;
  onClearSelection: () => void;

  partnerLayers: LayerConfig[];
  colorBy: ColorBy;
  onColorByChange: (c: ColorBy) => void;
  visibleLayers: Set<LayerKey>;
  onToggle: (key: LayerKey) => void;
  facilityLayers: FacilityLayer[];
  staticPointLayers: LayerConfig[];
  featureCounts: Partial<Record<LayerKey, number>>;
  pointCounts: { schools: number; health: number; canteens: number };
  healthTypes: Set<string>;
  onHealthTypesChange: (types: Set<string>) => void;
}

function Chip({ active, disabled, onClick, children, count, color }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; count?: number; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled && !active}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium transition-colors ${
        active
          ? "bg-indigo-600 border-indigo-600 text-white"
          : disabled
          ? "border-slate-100 text-slate-300 cursor-not-allowed"
          : "border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />}
      <span>{children}</span>
      {count !== undefined && (
        <span className={`text-[10px] font-bold ${active ? "text-indigo-100" : "text-slate-400"}`}>{count}</span>
      )}
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
      {hint && <p className="text-[11px] text-slate-400 mb-1.5">{hint}</p>}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, children, count, color }: {
  checked: boolean; onChange: () => void; children: ReactNode; count?: number; color?: string;
}) {
  return (
    <label className="flex items-center gap-2 py-1 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-indigo-600 w-3.5 h-3.5" />
      {color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />}
      <span className="flex-1 text-xs text-slate-700">{children}</span>
      {count !== undefined && <span className="text-[11px] font-semibold text-slate-400">{count}</span>}
    </label>
  );
}

const zoneLabel = (z: string) => z.replace(/^Chennai\s*[–-]\s*/u, "");

export default function LayerPanel(props: LayerPanelProps) {
  const {
    onClose, activeCity, onCityChange, tab, onTabChange,
    query, onQueryChange, rows, matched, mineClusters, loading,
    activeCluster, onClusterSelect, selectionLabel, onClearSelection,
    partnerLayers, colorBy, onColorByChange,
  } = props;

  const set = (patch: Partial<ClusterQuery>) => onQueryChange({ ...query, ...patch });
  const toggleIn = (s: Set<string>, v: string) => {
    const next = new Set(s);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  };
  // How many clusters match the other filters plus this option.
  const countWith = (skip: QueryDimension, test: (c: ClusterRow) => boolean) =>
    rows.filter((c) => clusterMatches(c, query, mineClusters, skip) && test(c)).length;

  const zones = Array.from(new Set(rows.map((c) => c.zone))).sort();
  const partnerLabel = (key: string) => partnerLayers.find((l) => l.key === key)?.label ?? key;
  const hasFacilities = activeCity === "bangalore";
  const active = isQueryActive(query);

  function downloadCsv() {
    const csv = clustersToCsv(matched, query, partnerLabel);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clusters-${activeCity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SurfaceProvider id="map.layer_panel">
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">U</span>
          </div>
          <span className="font-bold text-slate-800 text-sm flex-1">Programme Map</span>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Close panel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold">
          {(["bangalore", "chennai"] as const).map((c, i) => (
            <button
              key={c}
              onClick={() => onCityChange(c)}
              className={`flex-1 py-1.5 capitalize transition-colors ${i ? "border-l border-slate-200" : ""} ${
                activeCity === c ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Selection made on the map overrides the filters until cleared */}
      {selectionLabel && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between flex-shrink-0">
          <div className="text-xs font-semibold text-amber-900 truncate pr-2">Showing {selectionLabel}</div>
          <button onClick={onClearSelection} className="text-xs text-amber-700 hover:text-amber-900 font-bold flex-shrink-0">
            ✕ Back
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        {([["clusters", "Find clusters"], ["map", "Map display"]] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`flex-1 text-xs font-semibold py-2 transition-colors ${
              tab === t ? "text-indigo-600 border-b-2 border-indigo-500" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-16 sm:pb-0">
        {tab === "clusters" && (
          <div className="px-3 py-3 space-y-4">
            <Section title="Zone">
              <div className="flex flex-wrap gap-1">
                {zones.map((z) => {
                  const n = countWith("zone", (c) => c.zone === z);
                  return (
                    <Chip key={z} active={query.zones.has(z)} disabled={n === 0} count={n}
                      onClick={() => set({ zones: toggleIn(query.zones, z) })}>
                      {zoneLabel(z)}
                    </Chip>
                  );
                })}
              </div>
            </Section>

            <Section title="Partner">
              <div className="flex flex-wrap gap-1">
                {partnerLayers.map((l) => {
                  const n = countWith("partner", (c) => c.partners.includes(l.key));
                  return (
                    <Chip key={l.key} active={query.partners.has(l.key)} disabled={n === 0} count={n} color={l.color}
                      onClick={() => set({ partners: toggleIn(query.partners, l.key) })}>
                      {l.label}
                    </Chip>
                  );
                })}
              </div>
            </Section>

            {hasFacilities && (
              <Section title="Health work" hint={`Health centre within ${HEALTH_WORK_KM} km of a settlement`}>
                <div className="flex flex-wrap gap-1">
                  <Chip active={query.health === "any"} onClick={() => set({ health: "any" })}>Any</Chip>
                  <Chip active={query.health === "yes"} count={countWith("health", hasHealthWork)}
                    onClick={() => set({ health: query.health === "yes" ? "any" : "yes" })} color={HEALTH_WORK_COLOR}>
                    Health work
                  </Chip>
                  <Chip active={query.health === "no"} count={countWith("health", (c) => !hasHealthWork(c))}
                    onClick={() => set({ health: query.health === "no" ? "any" : "no" })} color={NO_HEALTH_WORK_COLOR}>
                    No health work
                  </Chip>
                </div>
              </Section>
            )}

            {hasFacilities && (
              <Section title="Nearby facilities" hint={`Within ${query.km} km of any settlement in the cluster`}>
                <input
                  type="range" min={0.5} max={MAX_FACILITY_KM} step={0.5} value={query.km}
                  onChange={(e) => set({ km: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-600 h-1.5"
                  aria-label="Facility distance in km"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>0.5 km</span><span>{MAX_FACILITY_KM} km</span>
                </div>
                <Toggle checked={query.schools} onChange={() => set({ schools: !query.schools })}
                  count={countWith("schools", (c) => schoolsWithin(c, query) > 0)}>
                  Has a school
                </Toggle>
                {query.schools && (
                  <div className="flex flex-wrap gap-1 pl-5 pb-1">
                    {SCHOOL_TYPES.map((t) => (
                      <Chip key={t.key} active={query.schoolTypes.has(t.key)} color={t.color}
                        onClick={() => set({ schoolTypes: toggleIn(query.schoolTypes, t.key) })}>
                        {t.label}
                      </Chip>
                    ))}
                  </div>
                )}
                <Toggle checked={query.canteens} onChange={() => set({ canteens: !query.canteens })}
                  count={countWith("canteens", (c) => canteensWithin(c, query.km) > 0)}>
                  Has an Indira Canteen
                </Toggle>
              </Section>
            )}

            <Section title="My work">
              <Toggle checked={query.mine} onChange={() => set({ mine: !query.mine })}
                count={query.mine || mineClusters ? countWith("mine", (c) => mineClusters?.has(normName(c.name)) ?? false) : undefined}>
                Only clusters where I own a goal
              </Toggle>
            </Section>

            {/* Results */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2 mb-2">
                <p className="flex-1 text-sm font-bold text-slate-800">
                  {loading ? "Loading clusters…" : `${matched.length} of ${rows.length} clusters`}
                </p>
                {active && (
                  <button onClick={() => onQueryChange({ ...EMPTY_QUERY, km: query.km })}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                    Reset
                  </button>
                )}
                <button onClick={downloadCsv} disabled={!matched.length}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:text-slate-300">
                  CSV
                </button>
              </div>
              {!loading && (
                <p className="text-[11px] text-slate-400 mb-2">
                  {matched.reduce((s, c) => s + c.settlementCount, 0)} settlements in these clusters
                </p>
              )}
              <div className="space-y-1">
                {matched.map((c) => {
                  const isActive = normName(activeCluster) === normName(c.name);
                  const schools = schoolsWithin(c, query);
                  return (
                    <button
                      key={c.id}
                      onClick={() => onClusterSelect(isActive ? null : c.name)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                        isActive ? "border-indigo-400 bg-indigo-50" : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="flex-1 text-xs font-semibold text-slate-800 truncate">{c.label}</span>
                        <span className="text-[10px] text-slate-400">{zoneLabel(c.zone)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                        <span>{c.settlementCount} settlements</span>
                        {c.partners.map((p) => (
                          <span key={p} className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: partnerLayers.find((l) => l.key === p)?.color }} />
                            {partnerLabel(p)}
                          </span>
                        ))}
                        {hasFacilities && hasHealthWork(c) && (
                          <span className="font-semibold" style={{ color: HEALTH_WORK_COLOR }}>Health · {c.healthCentres.length}</span>
                        )}
                        {hasFacilities && (query.schools || schools > 0) && (
                          <span>{schools} school{schools === 1 ? "" : "s"} ≤{query.km} km</span>
                        )}
                        {hasFacilities && query.canteens && <span>{canteensWithin(c, query.km)} canteens</span>}
                      </div>
                    </button>
                  );
                })}
                {!loading && matched.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center">No cluster matches all of these filters.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "map" && <MapDisplayTab {...props} colorBy={colorBy} onColorByChange={onColorByChange} />}
      </div>
    </div>
    </SurfaceProvider>
  );
}

function MapDisplayTab({
  activeCity, colorBy, onColorByChange, partnerLayers, visibleLayers, onToggle,
  facilityLayers, staticPointLayers, featureCounts, pointCounts, healthTypes, onHealthTypesChange, query,
}: LayerPanelProps) {
  const hasFacilities = activeCity === "bangalore";
  const filtered = isQueryActive(query);
  return (
    <div className="px-3 py-3 space-y-4">
      <Section title="Colour the map by">
        <div className="space-y-0.5">
          {COLOR_BY_OPTIONS.filter((o) => hasFacilities || o.key !== "health").map((o) => (
            <label key={o.key} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${colorBy === o.key ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <input type="radio" name="colorBy" checked={colorBy === o.key} onChange={() => onColorByChange(o.key)}
                className="accent-indigo-600 mt-0.5" />
              <span>
                <span className="block text-xs font-semibold text-slate-800">{o.label}</span>
                <span className="block text-[11px] text-slate-400">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {colorBy === "partner" && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-2">
            {partnerLayers.map((l) => (
              <span key={l.key} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />{l.label}
              </span>
            ))}
          </div>
        )}
        {colorBy === "health" && (
          <div className="flex gap-3 mt-2 px-2 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: HEALTH_WORK_COLOR }} />Health work</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: NO_HEALTH_WORK_COLOR }} />No health work</span>
          </div>
        )}
      </Section>

      <Section title="Points on the map" hint={filtered ? "Only points near the matching clusters are shown" : undefined}>
        {facilityLayers.map((fl) => (
          <Toggle key={fl.layerKey} checked={visibleLayers.has(fl.layerKey)} onChange={() => onToggle(fl.layerKey)}
            color={fl.color} count={featureCounts[fl.layerKey] ?? 0}>
            {fl.label}
          </Toggle>
        ))}
        {staticPointLayers.map((l) => (
          <Toggle key={l.key} checked={visibleLayers.has(l.key)} onChange={() => onToggle(l.key)}
            color={l.color} count={featureCounts[l.key] ?? 0}>
            {l.label}
          </Toggle>
        ))}
        {hasFacilities && (
          <>
            <Toggle checked={visibleLayers.has("schools")} onChange={() => onToggle("schools")} color="#16a34a" count={pointCounts.schools}>
              Schools ≤{query.km} km
            </Toggle>
            <Toggle checked={visibleLayers.has("health_centres")} onChange={() => onToggle("health_centres")} color="#e11d48" count={pointCounts.health}>
              Health centres
            </Toggle>
            {visibleLayers.has("health_centres") && (
              <div className="pl-5 pb-1">
                {HEALTH_CENTRE_TYPES.map(({ key, label, color }) => (
                  <label key={key} className="flex items-center gap-2 py-0.5 cursor-pointer">
                    <input type="checkbox" checked={healthTypes.has(key)} className="w-3 h-3" style={{ accentColor: color }}
                      onChange={() => {
                        const next = new Set(healthTypes);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        onHealthTypesChange(next);
                      }} />
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-[11px] text-slate-600">{label}</span>
                  </label>
                ))}
              </div>
            )}
            <Toggle checked={visibleLayers.has("canteens")} onChange={() => onToggle("canteens")} color="#ea580c" count={pointCounts.canteens}>
              Indira Canteens ≤{query.km} km
            </Toggle>
          </>
        )}
      </Section>
    </div>
  );
}
