"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

type DomainActuals = Record<string, { done: number; inProgress: number }>;
type Existing = Record<string, number>;
type Targets = Record<string, number>;
type DomainConfig = { domain: string; label: string; color: string; domainType: string; civicGroup?: string }[];

// Civic group → JSONB key → display label + good/bad classification
const CIVIC_GROUPS: Record<string, { key: string; label: string; good?: boolean }[]> = {
  borewell: [
    { key: "individual",    label: "Individual",     good: true },
    { key: "public",        label: "Public",         good: false },
    { key: "shared",        label: "Shared",         good: false },
    { key: "privateTanker", label: "Private Tanker", good: false },
    { key: "na",            label: "NA / None",      good: false },
  ],
  toiletConnection: [
    { key: "sewerage",   label: "Sewerage",     good: true },
    { key: "soakPit",    label: "Soak Pit",     good: false },
    { key: "noSewerage", label: "No Sewerage",  good: false },
  ],
  toiletFacility: [
    { key: "individual",  label: "Individual",          good: true },
    { key: "shared",      label: "Shared",              good: false },
    { key: "public",      label: "Public",              good: false },
    { key: "publicPaid",  label: "Public Paid",         good: false },
    { key: "noFacility",  label: "No Toilet Facility",  good: false },
  ],
  waterSupply: [
    { key: "individual",    label: "Individual",     good: true },
    { key: "public",        label: "Public",         good: false },
    { key: "shared",        label: "Shared",         good: false },
    { key: "privateTanker", label: "Private Tanker", good: false },
  ],
};

type CivicData = {
  borewell?: Record<string, number> | null;
  toiletConnection?: Record<string, number> | null;
  toiletFacility?: Record<string, number> | null;
  waterSupply?: Record<string, number> | null;
  borewellNeedScore?: number | null;
  toiletConnNeedScore?: number | null;
  toiletFacNeedScore?: number | null;
  waterSupplyNeedScore?: number | null;
} | null;

interface NeedsData {
  settlement?: { id: string; name: string } | null;
  cluster?: { id: string; name: string } | null;
  zone?: { id: string; name: string } | null;
  assessedCount?: number;
  settlementCount?: number;
  domainConfig?: DomainConfig;
  assessment?: {
    id: string;
    assessmentYear: number;
    assessedAt: string;
    assessedBy: { name: string | null };
    totalHouseholds: number;
    entitlements: {
      scheme: { id: string; name: string; parentId: string | null };
      eligibleHouseholds: number;
      enrolledHouseholds: number;
      surveyEnrolled: number | null;
    }[];
    roads: Record<string, unknown> | null;
    water: Record<string, unknown> | null;
    sanitation: Record<string, unknown> | null;
    electricity: Record<string, unknown> | null;
    waste: Record<string, unknown> | null;
    drainageStorm: Record<string, unknown> | null;
  } | null;
  pop: { totalHouseholds: number; children6m3yr: number; children4to14: number; youth15to21: number; elderly60plus: number };
  existing: Existing;
  targets: Targets;
  actuals: DomainActuals;
  addressable?: Record<string, number>;
  civicData?: CivicData;
  civicAvg?: { borewellNeedScore: number | null; toiletConnNeedScore: number | null; toiletFacNeedScore: number | null; waterSupplyNeedScore: number | null } | null;
  entitlements?: { id: string; name: string; parentId: string | null; eligible: number; enrolled: number }[];
}


// Civic domain row — shows % breakdown for each sub-category
function CivicDomainRow({ label, color, civicGroup, civicData, avgNeedScore }: {
  label: string;
  color: string;
  civicGroup: string;
  civicData: CivicData;
  avgNeedScore?: number | null;
}) {
  const groupDef = CIVIC_GROUPS[civicGroup];
  const data = civicData ? (civicData as Record<string, Record<string, number> | null | undefined>)[civicGroup] : null;

  if (!data && avgNeedScore == null) {
    return (
      <div className="py-1.5 border-b border-slate-50 last:border-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-xs text-slate-700 flex-1">{label}</span>
          <span className="text-[10px] text-slate-300 italic">No data</span>
        </div>
      </div>
    );
  }

  // If we have aggregate need score but no per-category breakdown (cluster/zone level)
  if (!data && avgNeedScore != null) {
    const goodScore = Math.round(100 - avgNeedScore);
    const needColor = avgNeedScore >= 60 ? "#ef4444" : avgNeedScore >= 30 ? "#f59e0b" : "#10b981";
    return (
      <div className="py-1.5 border-b border-slate-50 last:border-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-xs text-slate-700 flex-1">{label}</span>
          <span className="text-[10px] font-bold" style={{ color: needColor }}>{goodScore}% good</span>
        </div>
        <div className="flex items-center gap-1.5 pl-4">
          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${goodScore}%`, background: color + "cc" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!groupDef || !data) return null;
  const maxPct = Math.max(...groupDef.map(g => data[g.key] ?? 0), 1);

  return (
    <div className="py-1.5 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-xs text-slate-700 flex-1">{label}</span>
      </div>
      <div className="pl-4 space-y-0.5">
        {groupDef.map(({ key, label: subLabel, good }) => {
          const pct = data[key] ?? 0;
          if (pct === 0) return null;
          const barColor = good ? "#10b981" : "#f87171";
          const barWidth = Math.round((pct / maxPct) * 100);
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-28 flex-shrink-0 truncate">{subLabel}</span>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${barWidth}%`, background: barColor }} />
              </div>
              <span className="text-[10px] font-semibold text-slate-600 w-8 text-right flex-shrink-0">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NeedsRow({ label, color, existing, addressable, apfTarget, done, inProgress, onAdd }: {
  label: string; color: string; existing: number; addressable: number | null; apfTarget: number; done: number; inProgress: number;
  onAdd?: () => void;
}) {
  const planned = done + inProgress;
  const gap = Math.max(0, apfTarget - done);
  const pct = apfTarget > 0 ? Math.min(100, Math.round((done / apfTarget) * 100)) : done > 0 ? 100 : 0;
  return (
    <div className="py-1.5 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-xs text-slate-700 flex-1">{label}</span>
        <span className="text-[10px] text-slate-400">ex:{existing}</span>
        {addressable != null && (
          <span className="text-[10px] font-medium text-amber-600" title="Addressable need (field-verified)">addr:{addressable}</span>
        )}
        <span className="text-[10px] font-semibold text-slate-600">plan:{planned}</span>
        <span className="text-[10px] font-bold" style={{ color: gap === 0 ? "#10b981" : "#ef4444" }}>
          {gap === 0 ? "✓" : `-${gap}`}
        </span>
        {onAdd && gap > 0 && (
          <button
            onClick={onAdd}
            title={`Create goal for ${label} gap`}
            className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 hover:opacity-80 transition-opacity"
            style={{ background: color }}
          >
            +
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 pl-4">
        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color + "cc" }} />
        </div>
        <span className="text-[10px] text-slate-400">{done}/{planned}</span>
      </div>
    </div>
  );
}

function CivicRow({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  if (value == null || value === "" || value === false) return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[10px] font-medium text-slate-700 max-w-[50%] text-right truncate">{display}</span>
    </div>
  );
}

function SatBar({ name, eligible, enrolled }: { name: string; eligible: number; enrolled: number }) {
  if (eligible === 0) return null;
  const pct = Math.min(100, Math.round((enrolled / eligible) * 100));
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="py-1 border-b border-slate-50 last:border-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-slate-600 flex-1 truncate">{name}</span>
        <span className="text-[10px] font-bold ml-2" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-slate-400">{enrolled} enrolled</span>
        <span className="text-[9px] text-slate-400">{eligible} eligible</span>
      </div>
    </div>
  );
}

export interface NeedsGoalContext {
  needsDomain: string;
  domainLabel: string;
  domainColor: string;
  gap: number;
  existingCount: number;
  needsZoneId?: string;
  needsClusterId?: string;
  needsSettlementId?: string;
  geoLabel: string;
}

interface Props {
  mode: "settlement" | "cluster" | "zone";
  name: string;
  cluster?: string;
  zone?: string;
  settlementId?: string;
  onCreateGoal?: (ctx: NeedsGoalContext) => void;
  onSettlementLoaded?: (settlementId: string | null) => void;
}

export default function NeedsPanel({ mode, name, cluster, zone, settlementId, onCreateGoal, onSettlementLoaded }: Props) {
  const [data, setData] = useState<NeedsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"needs" | "civic" | "entitlements">("needs");
  const prevKey = `${mode}:${name}`;

  useEffect(() => {
    setData(null);
    setLoading(true);

    let url = "";
    if (mode === "settlement") {
      url = `/api/map/settlement-needs?settlement=${encodeURIComponent(name)}${cluster ? `&cluster=${encodeURIComponent(cluster)}` : ""}`;
    } else if (mode === "cluster") {
      url = `/api/map/cluster-needs?cluster=${encodeURIComponent(name)}${zone ? `&zone=${encodeURIComponent(zone)}` : ""}`;
    } else {
      url = `/api/map/zone-needs?zone=${encodeURIComponent(name)}`;
    }

    fetch(url)
      .then(r => r.json())
      .then(d => {
        setData(d);
        if (mode === "settlement" && onSettlementLoaded) {
          onSettlementLoaded(d?.settlement?.id ?? null);
        }
      })
      .catch(() => {
        setData(null);
        if (mode === "settlement" && onSettlementLoaded) onSettlementLoaded(null);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevKey]);

  if (loading) return (
    <SurfaceProvider id="map.needs_panel">
    <div className="flex items-center justify-center py-8">
      <div className="flex gap-1">
        {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
      </div>
    </div>
    </SurfaceProvider>
  );

  if (!data) return (
    <SurfaceProvider id="map.needs_panel">
    <div className="py-6 text-center text-xs text-slate-400">No assessment data found</div>
    </SurfaceProvider>
  );

  const noAssessment = !data.assessment && mode === "settlement";
  const noAssessments = (data.assessedCount ?? 0) === 0 && mode !== "settlement";

  // For settlement mode, use assessment entitlements; for cluster/zone, use aggregated entitlements
  const entitlementList = mode === "settlement"
    ? data.assessment?.entitlements?.map(e => ({
        id: e.scheme.id, name: e.scheme.name, parentId: e.scheme.parentId,
        eligible: e.eligibleHouseholds, enrolled: e.enrolledHouseholds + (e.surveyEnrolled ?? 0),
      })) ?? []
    : data.entitlements ?? [];

  const parentEntitlements = entitlementList.filter(e => !e.parentId && e.eligible > 0);
  const childEntitlements = (parentId: string) => entitlementList.filter(e => e.parentId === parentId && e.eligible > 0);

  // Coverage note for cluster/zone
  const coverageNote = mode !== "settlement" && data.settlementCount
    ? `${data.assessedCount ?? 0}/${data.settlementCount} settlements assessed`
    : null;

  return (
    <SurfaceProvider id="map.needs_panel">
    <div className="space-y-2">
      {/* Assessment metadata */}
      {mode === "settlement" && data.assessment && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-400">
            {data.assessment.assessmentYear} · {new Date(data.assessment.assessedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {data.assessment.assessedBy.name}
          </span>
          <Link href={`/needs/settlement/${data.settlement?.id}`} className="flex items-center gap-1 text-[10px] text-sky-500 hover:text-sky-700">
            Edit <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        </div>
      )}
      {mode === "settlement" && !data.assessment && data.settlement && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-amber-500">No assessment yet</span>
          <Link href={`/needs/settlement/${data.settlement.id}`} className="text-[10px] text-sky-500 hover:text-sky-700">
            + Add assessment
          </Link>
        </div>
      )}
      {coverageNote && (
        <div className="text-[10px] text-slate-400 px-1">{coverageNote}</div>
      )}

      {/* Population summary */}
      {data.pop.totalHouseholds > 0 && (
        <div className="grid grid-cols-4 gap-1 px-1 py-2 bg-slate-50 rounded-lg text-center">
          <div><p className="text-xs font-bold text-slate-800">{data.pop.totalHouseholds}</p><p className="text-[9px] text-slate-400">HH</p></div>
          <div><p className="text-xs font-bold text-pink-500">{data.pop.children6m3yr}</p><p className="text-[9px] text-slate-400">0-3yr</p></div>
          <div><p className="text-xs font-bold text-orange-500">{data.pop.children4to14}</p><p className="text-[9px] text-slate-400">4-14yr</p></div>
          <div><p className="text-xs font-bold text-purple-500">{data.pop.youth15to21}</p><p className="text-[9px] text-slate-400">15-21yr</p></div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-slate-100">
        {(["needs", "civic", "entitlements"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-[10px] font-semibold capitalize transition-colors ${activeTab === tab ? "text-sky-600 border-b-2 border-sky-500" : "text-slate-400 hover:text-slate-600"}`}>
            {tab === "needs" ? "Needs" : tab === "civic" ? "Civic" : "Schemes"}
          </button>
        ))}
      </div>

      {/* Needs tab */}
      {activeTab === "needs" && (
        <div>
          {(noAssessment || noAssessments) && !(data.domainConfig ?? []).some(d => d.domainType === "civic") ? (
            <p className="text-[10px] text-slate-400 italic py-2">No population data — add an assessment to see targets.</p>
          ) : (
            <>
              {/* Header row only for non-civic domains */}
              {(data.domainConfig ?? []).some(d => d.domainType !== "civic") && !noAssessment && !noAssessments && (
                <div className="flex items-center gap-2 px-1 pb-1 text-[9px] font-bold uppercase tracking-wide text-slate-300">
                  <span className="w-2" />
                  <span className="flex-1">Domain</span>
                  <span>ex</span>
                  <span className="text-amber-400">addr</span>
                  <span>plan</span>
                  <span>gap</span>
                </div>
              )}
              {(data.domainConfig ?? []).map(d => {
                if (d.domainType === "civic") {
                  const civicGroup = (d as { civicGroup?: string }).civicGroup ?? "";
                  const scoreKey: Record<string, keyof NonNullable<typeof data.civicAvg>> = {
                    borewell: "borewellNeedScore", toiletConnection: "toiletConnNeedScore",
                    toiletFacility: "toiletFacNeedScore", waterSupply: "waterSupplyNeedScore",
                  };
                  const avgScore = data.civicAvg?.[scoreKey[civicGroup]] ?? null;
                  return (
                    <CivicDomainRow key={d.domain}
                      label={d.label} color={d.color}
                      civicGroup={civicGroup}
                      civicData={data.civicData ?? null}
                      avgNeedScore={mode !== "settlement" ? avgScore : null}
                    />
                  );
                }
                if (noAssessment || noAssessments) return null;
                const existing   = data.existing[d.domain] ?? 0;
                const apfTarget  = Math.max(0, (data.targets[d.domain] ?? 0) - existing);
                const done       = data.actuals[d.domain]?.done ?? 0;
                const inProgress = data.actuals[d.domain]?.inProgress ?? 0;
                const gap        = Math.max(0, apfTarget - done);
                const addressable = data.addressable?.[d.domain] ?? null;
                return (
                  <NeedsRow key={d.domain}
                    label={d.label}
                    color={d.color}
                    existing={existing}
                    addressable={addressable}
                    apfTarget={apfTarget}
                    done={done}
                    inProgress={inProgress}
                    onAdd={onCreateGoal ? () => onCreateGoal({
                      needsDomain: d.domain,
                      domainLabel: d.label,
                      domainColor: d.color,
                      gap,
                      existingCount: existing,
                      needsZoneId:       data.zone?.id,
                      needsClusterId:    data.cluster?.id,
                      needsSettlementId: data.settlement?.id,
                      geoLabel: data.settlement?.name ?? data.cluster?.name ?? data.zone?.name ?? name,
                    }) : undefined}
                  />
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Civic tab — settlement mode only shows full detail; cluster/zone shows summary */}
      {activeTab === "civic" && (
        <div className="space-y-2">
          {mode === "settlement" && data.assessment ? (
            <>
              {data.assessment.roads && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Roads</p>
                  <CivicRow label="Type" value={data.assessment.roads.roadType as string} />
                  <CivicRow label="Condition" value={data.assessment.roads.condition as string} />
                  <CivicRow label="Accessibility" value={data.assessment.roads.accessibility as string} />
                  <CivicRow label="Unusable in rain" value={data.assessment.roads.unusableInRain ? "Yes" : null} />
                </div>
              )}
              {data.assessment.water && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Water</p>
                  <CivicRow label="Drinking source" value={data.assessment.water.drinkingSource as string} />
                  <CivicRow label="Quality" value={data.assessment.water.waterQuality as string} />
                  <CivicRow label="Non-potable source" value={data.assessment.water.nonPotableSource as string} />
                </div>
              )}
              {data.assessment.sanitation && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Sanitation</p>
                  <CivicRow label="Individual toilet" value={`${data.assessment.sanitation.individualToiletPct}%`} />
                  <CivicRow label="Open defecation" value={`${data.assessment.sanitation.openDefecationPct}%`} />
                  <CivicRow label="Community toilets" value={data.assessment.sanitation.communityToiletCount as number} />
                  <CivicRow label="Condition" value={data.assessment.sanitation.toiletCondition as string} />
                </div>
              )}
              {data.assessment.electricity && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Electricity</p>
                  <CivicRow label="HH connected" value={data.assessment.electricity.hhWithConnection as number} />
                  <CivicRow label="Streetlights" value={`${data.assessment.electricity.functionalStreetlights}/${data.assessment.electricity.totalStreetlights} functional`} />
                </div>
              )}
              {data.assessment.waste && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Waste</p>
                  <CivicRow label="Collection" value={data.assessment.waste.collectionType as string} />
                  <CivicRow label="Frequency" value={data.assessment.waste.frequency as string} />
                  <CivicRow label="Dump spots" value={data.assessment.waste.informalDumpsCount as number} />
                </div>
              )}
              {data.assessment.drainageStorm && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Drainage</p>
                  <CivicRow label="Storm drain" value={data.assessment.drainageStorm.drainType as string} />
                  <CivicRow label="Condition" value={data.assessment.drainageStorm.drainCondition as string} />
                  <CivicRow label="Flooding" value={data.assessment.drainageStorm.floodingOccurs ? `Yes — ${data.assessment.drainageStorm.floodLevel ?? ""}` : null} />
                </div>
              )}
              {!data.assessment.roads && !data.assessment.water && (
                <p className="text-[10px] text-slate-400 italic py-2">Civic baseline sections not filled yet.</p>
              )}
            </>
          ) : (
            <p className="text-[10px] text-slate-400 italic py-2">
              {mode === "settlement" ? "No assessment — add one to see civic data." : "Civic detail available at settlement level."}
            </p>
          )}
        </div>
      )}

      {/* Entitlements tab */}
      {activeTab === "entitlements" && (
        <div>
          {entitlementList.length === 0 ? (
            <p className="text-[10px] text-slate-400 italic py-2">No entitlement data recorded.</p>
          ) : (
            <div className="space-y-3">
              {parentEntitlements.map(parent => (
                <div key={parent.id}>
                  <SatBar name={parent.name} eligible={parent.eligible} enrolled={parent.enrolled} />
                  {childEntitlements(parent.id).map(child => (
                    <div key={child.id} className="pl-3 border-l border-slate-100 ml-1">
                      <SatBar name={child.name} eligible={child.eligible} enrolled={child.enrolled} />
                    </div>
                  ))}
                </div>
              ))}
              {/* Standalone (no parent) */}
              {entitlementList.filter(e => !e.parentId && e.eligible > 0 && !parentEntitlements.find(p => p.id === e.id)).map(e => (
                <SatBar key={e.id} name={e.name} eligible={e.eligible} enrolled={e.enrolled} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </SurfaceProvider>
  );
}
