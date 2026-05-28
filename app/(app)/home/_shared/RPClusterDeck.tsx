"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight, ChevronLeft, LayoutDashboard, Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, Filter, ChevronDown, ChevronUp, Mic, Square, Loader2, Paperclip } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import Avatar from "@/components/Avatar";
import dynamic from "next/dynamic";
const ClusterMiniMap = dynamic(() => import("@/components/home/ClusterMiniMap"), { ssr: false });
import type { ActivityGoal, Activity, ChecklistItem, Goal, TeamMember, ZLTeamActivity, TabKey } from "../_lib/types";
import { fmtTime, fmtDate, fmtDateShort, isToday, daysDiff, daysAgo, activityMeta, groupByDay, fmtDomain, groupBySla, slaHeaderLabel, engLevel, istTodayStr, shiftIstDate } from "../_lib/helpers";
import { STATUS_BADGE, STATUS_DOT, CHECKLIST_STATUS_DOT, EVENT_TYPE_COLOR, ACTIVITY_TYPE_STYLE, DESIGNATION_ORDER, DESIGNATION_COLOR, PITSTOP_STATUS_COLOR } from "../_lib/constants";
import type { DomainStat, ClusterStat, ClusterStatus, RPHealthStat, ZLHealthStat, RPPitstopDetail, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop, AdminPersonHealth, AdminDelayedPitstop, AdminOverdueActivity, AdminEngagementStat, AdminCityCoverage, LeaderTeamMember, RPClusterDeckCluster, FacilityLayerConfigLite } from "../page";
import { WeekCard, EmptyState, SectionTitle } from "../_shared/Primitives";
import { RPActivityRow } from "../_shared/RPActivityRow";
import { RPChecklistRow } from "../_shared/RPChecklistRow";

type RPDeckBucket = {
  clusterId: string;
  clusterName: string;
  overdue: Activity[];
  today: Activity[];
  checklists: ChecklistItem[];
  week: Activity[];
};

export function RPClusterDeck({
  userId,
  overdueActivities,
  todayActivities,
  weekActivities,
  weekChecklists,
  clusters,
  facilityLayerConfigs,
}: {
  userId: string;
  overdueActivities: Activity[];
  todayActivities: Activity[];
  weekActivities: Activity[];
  weekChecklists: ChecklistItem[];
  clusters: RPClusterDeckCluster[];
  facilityLayerConfigs: FacilityLayerConfigLite[];
}) {
  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  // Per-cluster filter (settlement OR facility id; never both)
  const [filterByCluster, setFilterByCluster] = useState<Map<string, { kind: "settlement" | "facility"; id: string; label: string } | null>>(new Map());

  // Carousel scroll → activeIdx
  const carouselRef = useRef<HTMLDivElement>(null);
  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  const completedActivityIds = useMemo(
    () => new Set(
      weekChecklists
        .filter(ci => completedItemIds.has(ci.id))
        .flatMap(ci => ci.activities.map(a => a.id))
    ),
    [weekChecklists, completedItemIds]
  );
  const activityChecklistMap = useMemo(() => {
    const m = new Map<string, ChecklistItem>();
    for (const ci of weekChecklists) {
      if (completedItemIds.has(ci.id)) continue;
      for (const act of ci.activities) m.set(act.id, ci);
    }
    return m;
  }, [weekChecklists, completedItemIds]);
  const isVisible = (a: Activity) => !doneIds.has(a.id) && !completedActivityIds.has(a.id);

  async function handleDone(eventId: string) {
    setLoadingDoneId(eventId);
    try {
      await fetch(`/api/pitstop-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      setDoneIds(prev => new Set([...prev, eventId]));
      const linkedIds = weekChecklists
        .filter(ci => ci.completionType === "Activity" && ci.activities.some(a => a.id === eventId))
        .map(ci => ci.id);
      if (linkedIds.length > 0) setCompletedItemIds(prev => new Set([...prev, ...linkedIds]));
    } finally {
      setLoadingDoneId(null);
    }
  }
  const handleCompleted = (id: string) => setCompletedItemIds(prev => new Set([...prev, id]));

  // Cluster facility colors — looked up by layerKey.
  const facilityColors = useMemo(
    () => Object.fromEntries(facilityLayerConfigs.map(c => [c.layerKey, c.color])),
    [facilityLayerConfigs]
  );

  const clusterIdSet = useMemo(() => new Set(clusters.map(c => c.id)), [clusters]);

  // Bucket items by cluster. Items whose goal.needsCluster.id isn't in the
  // assigned cluster set (or items with no cluster) get aggregated into a
  // synthetic "Other" bucket appended at the end of the deck.
  const buckets = useMemo(() => {
    const map = new Map<string, RPDeckBucket>();
    for (const c of clusters) map.set(c.id, { clusterId: c.id, clusterName: c.name, overdue: [], today: [], checklists: [], week: [] });
    const OTHER = "__rp_other__";
    const ensureOther = () => {
      if (!map.has(OTHER)) map.set(OTHER, { clusterId: OTHER, clusterName: "Other work", overdue: [], today: [], checklists: [], week: [] });
      return map.get(OTHER)!;
    };
    const clusterOf = (cid: string | null | undefined) =>
      cid && clusterIdSet.has(cid) ? map.get(cid)! : ensureOther();

    // Overdue (page.tsx-fetched past-due + past-time-today)
    const pastDueToday = todayActivities.filter(a => new Date(a.scheduledAt) < now && a.status === "Scheduled" && isVisible(a));
    const overdueItems = [
      ...overdueActivities.filter(a => isVisible(a)),
      ...pastDueToday,
    ].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    for (const a of overdueItems) clusterOf(a.pitstops?.[0]?.pitstop?.goal?.needsCluster?.id).overdue.push(a);

    // Today (upcoming)
    const todayItems = todayActivities.filter(a => new Date(a.scheduledAt) >= now && a.status === "Scheduled" && isVisible(a));
    todayItems.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    for (const a of todayItems) clusterOf(a.pitstops?.[0]?.pitstop?.goal?.needsCluster?.id).today.push(a);

    // Checklists
    const openChecklists = weekChecklists
      .filter(ci => !completedItemIds.has(ci.id))
      .sort((a, b) => {
        const aMs = a.pitstop.targetDate ? new Date(a.pitstop.targetDate).getTime() : Infinity;
        const bMs = b.pitstop.targetDate ? new Date(b.pitstop.targetDate).getTime() : Infinity;
        return aMs - bMs;
      });
    for (const ci of openChecklists) clusterOf(ci.pitstop.goal.needsCluster?.id).checklists.push(ci);

    // Week (rest of week, after today)
    const weekItems = weekActivities.filter(a => new Date(a.scheduledAt) > todayEnd && a.status === "Scheduled");
    weekItems.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    for (const a of weekItems) clusterOf(a.pitstops?.[0]?.pitstop?.goal?.needsCluster?.id).week.push(a);

    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, clusterIdSet, overdueActivities, todayActivities, weekActivities, weekChecklists, doneIds, completedItemIds]);

  // Card order: assigned clusters first (matching the input order), then Other if non-empty.
  const orderedCards: RPDeckBucket[] = useMemo(() => {
    const assigned = clusters.map(c => buckets.get(c.id)!).filter(Boolean);
    const other = buckets.get("__rp_other__");
    if (other && (other.overdue.length + other.today.length + other.checklists.length + other.week.length > 0)) {
      return [...assigned, other];
    }
    return assigned;
  }, [clusters, buckets]);

  return (
    <div className="-mx-5 sm:-mx-8">
      {/* Mobile carousel + desktop stack. The negative margins above let the
          card go full-bleed inside the standard tab content padding. */}
      <div className="sm:hidden">
        {orderedCards.length > 1 && (
          <div className="flex items-center justify-between px-5 mb-2">
            <span className="text-xs text-stone-400 tabular-nums">
              {Math.min(activeIdx + 1, orderedCards.length)} of {orderedCards.length}
            </span>
            <span className="text-[11px] text-stone-400 truncate ml-2">← swipe between clusters →</span>
          </div>
        )}
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {orderedCards.map((bucket, idx) => {
            const cluster = clusters.find(c => c.id === bucket.clusterId) ?? null;
            const isMapNeighbor = Math.abs(idx - activeIdx) <= 1;
            return (
              <div key={bucket.clusterId} className="snap-start flex-shrink-0 w-full">
                <RPClusterCard
                  userId={userId}
                  bucket={bucket}
                  cluster={cluster}
                  facilityColors={facilityColors}
                  activeFilter={filterByCluster.get(bucket.clusterId) ?? null}
                  setActiveFilter={(f) => setFilterByCluster(prev => new Map(prev).set(bucket.clusterId, f))}
                  activityChecklistMap={activityChecklistMap}
                  onDone={handleDone}
                  onCompleted={handleCompleted}
                  loadingDoneId={loadingDoneId}
                  mountMap={isMapNeighbor}
                />
              </div>
            );
          })}
        </div>
        {orderedCards.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {orderedCards.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-200 ${
                i === activeIdx ? "w-4 bg-stone-700" : "w-1.5 bg-stone-200"
              }`} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: stack the cards vertically, all maps mounted. */}
      <div className="hidden sm:block space-y-6 px-5 sm:px-8">
        {orderedCards.map(bucket => {
          const cluster = clusters.find(c => c.id === bucket.clusterId) ?? null;
          return (
            <RPClusterCard
              key={bucket.clusterId}
              userId={userId}
              bucket={bucket}
              cluster={cluster}
              facilityColors={facilityColors}
              activeFilter={filterByCluster.get(bucket.clusterId) ?? null}
              setActiveFilter={(f) => setFilterByCluster(prev => new Map(prev).set(bucket.clusterId, f))}
              activityChecklistMap={activityChecklistMap}
              onDone={handleDone}
              onCompleted={handleCompleted}
              loadingDoneId={loadingDoneId}
              mountMap
            />
          );
        })}
      </div>
    </div>
  );
}

type DeckFilter = { kind: "settlement" | "facility"; id: string; label: string };

export function RPClusterCard({
  userId,
  bucket,
  cluster,
  facilityColors,
  activeFilter,
  setActiveFilter,
  activityChecklistMap,
  onDone,
  onCompleted,
  loadingDoneId,
  mountMap,
}: {
  userId: string;
  bucket: RPDeckBucket;
  cluster: RPClusterDeckCluster | null;
  facilityColors: Record<string, string>;
  activeFilter: DeckFilter | null;
  setActiveFilter: (f: DeckFilter | null) => void;
  activityChecklistMap: Map<string, ChecklistItem>;
  onDone: (id: string) => void;
  onCompleted: (id: string) => void;
  loadingDoneId: string | null;
  mountMap: boolean;
}) {
  const DEFAULT_OPEN = "today"; // Today expanded by default, others collapsed.
  const [openSection, setOpenSection] = useState<string>(DEFAULT_OPEN);

  // Apply filter to each section
  const filteredItems = useMemo(() => {
    const matchActivity = (a: Activity) => {
      if (!activeFilter) return true;
      const goal = a.pitstops?.[0]?.pitstop?.goal;
      if (!goal) return false;
      if (activeFilter.kind === "settlement") return goal.needsSettlement?.id === activeFilter.id;
      return goal.linkedFacilityId === activeFilter.id;
    };
    const matchChecklist = (ci: ChecklistItem) => {
      if (!activeFilter) return true;
      const goal = ci.pitstop.goal;
      if (activeFilter.kind === "settlement") return goal.needsSettlement?.id === activeFilter.id;
      return goal.linkedFacilityId === activeFilter.id;
    };
    return {
      overdue: bucket.overdue.filter(matchActivity),
      today: bucket.today.filter(matchActivity),
      checklists: bucket.checklists.filter(matchChecklist),
      week: bucket.week.filter(matchActivity),
    };
  }, [bucket, activeFilter]);

  // Settlement/facility ids to highlight = union of settlement/facility ids referenced
  // by any open item in this cluster (pre-filter, so the map context stays stable).
  const highlightedSettlementIds = useMemo(() => {
    const s = new Set<string>();
    const addFromActivities = (arr: Activity[]) => {
      for (const a of arr) {
        const id = a.pitstops?.[0]?.pitstop?.goal?.needsSettlement?.id;
        if (id) s.add(id);
      }
    };
    addFromActivities(bucket.overdue);
    addFromActivities(bucket.today);
    addFromActivities(bucket.week);
    for (const ci of bucket.checklists) {
      const id = ci.pitstop.goal.needsSettlement?.id;
      if (id) s.add(id);
    }
    return s;
  }, [bucket]);
  const highlightedFacilityIds = useMemo(() => {
    const s = new Set<string>();
    const addFromActivities = (arr: Activity[]) => {
      for (const a of arr) {
        const id = a.pitstops?.[0]?.pitstop?.goal?.linkedFacilityId;
        if (id) s.add(id);
      }
    };
    addFromActivities(bucket.overdue);
    addFromActivities(bucket.today);
    addFromActivities(bucket.week);
    for (const ci of bucket.checklists) {
      const id = ci.pitstop.goal.linkedFacilityId;
      if (id) s.add(id);
    }
    return s;
  }, [bucket]);

  const selectedSettlementId = activeFilter?.kind === "settlement" ? activeFilter.id : null;
  const selectedFacilityId = activeFilter?.kind === "facility" ? activeFilter.id : null;

  const settlementName = (sid: string) => cluster?.settlements.find(s => s.id === sid)?.name ?? "Settlement";
  const facilityName = (fid: string) => cluster?.layerFeatures.find(f => f.id === fid)?.name ?? "Facility";

  const totalCount = filteredItems.overdue.length + filteredItems.today.length + filteredItems.checklists.length + filteredItems.week.length;

  return (
    <article className="bg-white border-y sm:border sm:rounded-2xl border-stone-200 overflow-hidden flex flex-col" style={{ minHeight: "calc(100dvh - 220px)" }}>
      {/* Cluster header */}
      <header className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center gap-2 min-w-0">
        <MapPin className="w-4 h-4 text-stone-400 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-stone-800 truncate flex-1">{bucket.clusterName}</h3>
        {cluster && (
          <Link
            href={`/map?cluster=${encodeURIComponent(cluster.name)}`}
            className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5 flex-shrink-0"
          >
            Open in map <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </header>

      {/* Map area */}
      <div className="relative bg-stone-100" style={{ height: "42dvh", minHeight: 220 }}>
        {cluster && mountMap ? (
          <ClusterMiniMap
            clusterId={cluster.id}
            clusterGeometry={cluster.geometry}
            settlements={cluster.settlements}
            facilities={cluster.layerFeatures}
            highlightedSettlementIds={highlightedSettlementIds}
            highlightedFacilityIds={highlightedFacilityIds}
            facilityColors={facilityColors}
            selectedSettlementId={selectedSettlementId}
            selectedFacilityId={selectedFacilityId}
            onSettlementTap={(id) => setActiveFilter({ kind: "settlement", id, label: settlementName(id) })}
            onFacilityTap={(id) => setActiveFilter({ kind: "facility", id, label: facilityName(id) })}
            onClear={() => setActiveFilter(null)}
          />
        ) : cluster ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-400">Map loading…</div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-400 italic">No map for this group</div>
        )}
      </div>

      {/* Filter chip */}
      {activeFilter && (
        <div className="px-4 py-2 bg-sky-50 border-b border-sky-100 flex items-center gap-2 text-xs">
          <span className="text-sky-700">
            Showing <strong className="font-semibold">{activeFilter.label}</strong> only
          </span>
          <span className="text-sky-400">·</span>
          <button onClick={() => setActiveFilter(null)} className="text-sky-700 hover:text-sky-900 font-medium">
            Clear
          </button>
        </div>
      )}

      {/* Sections — Today open by default; one section open at a time keeps the
          card compact. Tapping a closed section opens it (and closes the other). */}
      <div className="divide-y divide-stone-100 overflow-y-auto flex-1">
        {totalCount === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-stone-400">{activeFilter ? "Nothing here for this filter." : "You're all caught up for today."}</p>
          </div>
        )}
        <DeckSection
          sectionKey="overdue"
          label="Needs your update"
          icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
          badgeClass="bg-amber-100 text-amber-700"
          count={filteredItems.overdue.length}
          isOpen={openSection === "overdue"}
          onToggle={() => setOpenSection(prev => prev === "overdue" ? "" : "overdue")}
          hideWhenEmpty
        >
          <div className="px-3 pb-3 space-y-2">
            {filteredItems.overdue.map(a => (
              <RPActivityRow
                key={a.id} a={a} userId={userId} isOverdue
                linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                onDone={onDone} onCompleted={onCompleted}
                isLoadingDone={loadingDoneId === a.id}
              />
            ))}
          </div>
        </DeckSection>

        <DeckSection
          sectionKey="today"
          label="Today"
          icon={null}
          badgeClass={filteredItems.today.length === 0 ? "bg-stone-100 text-stone-400" : "bg-sky-100 text-sky-700"}
          count={filteredItems.today.length}
          isOpen={openSection === "today"}
          onToggle={() => setOpenSection(prev => prev === "today" ? "" : "today")}
        >
          {filteredItems.today.length === 0 ? (
            <p className="px-4 pb-3 text-xs text-stone-400 italic">Nothing scheduled for today.</p>
          ) : (
            <div className="px-3 pb-3 space-y-2">
              {filteredItems.today.map(a => (
                <RPActivityRow
                  key={a.id} a={a} userId={userId} isOverdue={false}
                  linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                  onDone={onDone} onCompleted={onCompleted}
                  isLoadingDone={loadingDoneId === a.id}
                />
              ))}
            </div>
          )}
        </DeckSection>

        <DeckSection
          sectionKey="checklists"
          label="Open checklists"
          icon={null}
          badgeClass="bg-violet-100 text-violet-700"
          count={filteredItems.checklists.length}
          isOpen={openSection === "checklists"}
          onToggle={() => setOpenSection(prev => prev === "checklists" ? "" : "checklists")}
          hideWhenEmpty
        >
          <div className="px-3 pb-3 space-y-2">
            {filteredItems.checklists.map(ci => (
              <div key={ci.id} className="rounded-xl border border-stone-100 overflow-hidden bg-white">
                <RPChecklistRow item={ci} onCompleted={onCompleted} />
              </div>
            ))}
          </div>
        </DeckSection>

        <DeckSection
          sectionKey="week"
          label="Coming up this week"
          icon={null}
          badgeClass={filteredItems.week.length === 0 ? "bg-stone-100 text-stone-400" : "bg-stone-200 text-stone-700"}
          count={filteredItems.week.length}
          isOpen={openSection === "week"}
          onToggle={() => setOpenSection(prev => prev === "week" ? "" : "week")}
        >
          {filteredItems.week.length === 0 ? (
            <p className="px-4 pb-3 text-xs text-stone-400 italic">Nothing else scheduled this week.</p>
          ) : (
            <div className="px-3 pb-3 space-y-2">
              {filteredItems.week.map(a => (
                <RPActivityRow
                  key={a.id} a={a} userId={userId} isOverdue={false}
                  linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                  onDone={onDone} onCompleted={onCompleted}
                  isLoadingDone={loadingDoneId === a.id}
                />
              ))}
            </div>
          )}
        </DeckSection>
      </div>
    </article>
  );
}

export function DeckSection({
  label, icon, badgeClass, count, isOpen, onToggle, children, hideWhenEmpty = false,
}: {
  sectionKey: string;
  label: string;
  icon: React.ReactNode;
  badgeClass: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  hideWhenEmpty?: boolean;
}) {
  if (hideWhenEmpty && count === 0) return null;
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
      >
        {icon}
        <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">{label}</p>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badgeClass}`}>{count}</span>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
      </button>
      {isOpen && children}
    </div>
  );
}

// ── Tab: Admin Field Coverage ─────────────────────────────────────────────────

