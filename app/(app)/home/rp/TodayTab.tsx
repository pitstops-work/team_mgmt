"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Filter, MapPin, Plus } from "lucide-react";
import type { Activity, ChecklistItem } from "../_lib/types";
import { isToday, getActivityCluster } from "../_lib/helpers";
import type { RPClusterDeckCluster, FacilityLayerConfigLite } from "../page";
import { ActivityCard } from "../_shared/ActivityCard";
import { ProgressChip } from "../_shared/ProgressChip";
import { NowDivider } from "../_shared/NowDivider";
import { EmptyState, SectionTitle } from "../_shared/Primitives";
import { FilterSheet } from "../_shared/FilterSheet";
import { ClusterSplitBanner } from "../_shared/ClusterSplitBanner";
import { ClusterBatchRescheduleSheet } from "../_shared/ClusterBatchRescheduleSheet";
import { useTodayFilters, type GroupBy } from "../_shared/useTodayFilters";
import { useSessionDoneIds } from "../_shared/useSessionDoneIds";
import AddActivityModal, { type ActivityModalPitstopRef, type ActivityModalUser } from "../_shared/AddActivityModal";
import { HomeTodayAPSection } from "@/components/action-points/HomeTodayAPSection";

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * RP Today — time-first cockpit. Replaces the cluster-first playing-card deck.
 *
 * When `groupBy === "none"` (default): renders Overdue → Today (with
 * NowDivider) → Next 7d collapsed.
 *
 * When `groupBy !== "none"`: sections collapse; one block per group, sorted
 * by group label (or by SLA-bucket order when grouping by SLA). Inside each
 * group, activities stay time-ordered so urgency reads top-down.
 *
 * Filter pill opens a bottom sheet (mobile) / centred sheet (desktop). The
 * legacy `RPClusterDeck` stays in `_shared/` for the planned `/route` move.
 */
export function RPTodayTab({
  userId,
  overdueActivities,
  overdueTotal,
  todayActivities,
  weekActivities,
  weekChecklists,
  addActivityPitstops,
  addActivityUsers,
}: {
  userId: string;
  overdueActivities: Activity[];
  /**
   * True overdue total from the server (independent of the `take` cap on
   * `overdueActivities`). When the rendered list is paginated, the badge
   * still shows the real number.
   */
  overdueTotal: number;
  todayActivities: Activity[];
  weekActivities: Activity[];
  weekChecklists: ChecklistItem[];
  /* Accepted but unused — see Phase 1 dispatcher. */
  doneActivities?: Activity[];
  rpClusterDeck?: RPClusterDeckCluster[];
  facilityLayerConfigs?: FacilityLayerConfigLite[];
  addActivityPitstops: ActivityModalPitstopRef[];
  addActivityUsers: ActivityModalUser[];
}) {
  const router = useRouter();
  const { ids: doneEventIds, add: addDoneEventId } = useSessionDoneIds(`rp-${userId}-done-events`);
  const { ids: doneChecklistIds, add: addDoneChecklistId } = useSessionDoneIds(`rp-${userId}-done-checklists`);
  const [showWeek, setShowWeek] = useState(false);
  // Overdue expands by default. The earlier "collapsed to keep the cockpit
  // short" default surfaced the count in the ProgressChip but hid the items
  // themselves behind a small amber expander that RPs were missing — they
  // could see "3 overdue" in the badge but had no idea where to click to act
  // on them. ZL TodayTab already renders this list expanded; we match.
  const [showOverdue, setShowOverdue] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [batchCluster, setBatchCluster] = useState<{ id: string; name: string } | null>(null);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const onRescheduled = () => router.refresh();

  // All activities feed the filter universe so the filter chrome is stable
  // even after a section is exhausted.
  const allActivities = useMemo(
    () => [...overdueActivities, ...todayActivities, ...weekActivities],
    [overdueActivities, todayActivities, weekActivities]
  );

  const {
    filters, setFilter, clearFilters, activeCount,
    groupBy, setGroupBy,
    matches, options, groupKey,
  } = useTodayFilters(allActivities);

  // Activity → linked checklist lookup.
  const activityChecklistMap = useMemo(() => {
    const m = new Map<string, ChecklistItem>();
    for (const ci of weekChecklists) {
      if (doneChecklistIds.has(ci.id)) continue;
      for (const a of ci.activities) m.set(a.id, ci);
    }
    return m;
  }, [weekChecklists, doneChecklistIds]);

  // Filtered sub-buckets — used both for the un-grouped sections view and
  // for grouped output.
  const filteredOverdue = useMemo(
    () => overdueActivities.filter(a => !doneEventIds.has(a.id) && matches(a)),
    [overdueActivities, doneEventIds, matches]
  );
  const filteredToday = useMemo(
    () => todayActivities.filter(matches)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [todayActivities, matches]
  );
  const filteredWeek = useMemo(
    () => weekActivities
      .filter(a => !isToday(a.scheduledAt))
      .filter(matches)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [weekActivities, matches]
  );

  const todayDoneCount = filteredToday.filter(a => a.status === "Done" || doneEventIds.has(a.id)).length;
  const todayTotal = filteredToday.length;
  // True overdue count = server-side total - items we've optimistically marked
  // done in this session that the server hasn't reflected back yet. Bounded
  // below by 0 in case the server has already caught up (would otherwise show
  // a negative on the first frame after refresh).
  const optimisticallyDoneVisible = overdueActivities.reduce(
    (n, a) => (doneEventIds.has(a.id) ? n + 1 : n),
    0,
  );
  const overdueCount = Math.max(0, overdueTotal - optimisticallyDoneVisible);

  // Now divider index for the un-grouped layout.
  const nowMs = Date.now();
  const nowIdx = useMemo(() => {
    const i = filteredToday.findIndex(a => new Date(a.scheduledAt).getTime() >= nowMs);
    return i === -1 ? filteredToday.length : i;
  }, [filteredToday, nowMs]);

  function handleCompleted(eventId: string, checklistItemId?: string) {
    // Persist optimistic completion in sessionStorage so it survives both the
    // router.refresh below and a navigate-away/back. The hook handles storage.
    addDoneEventId(eventId);
    if (checklistItemId) addDoneChecklistId(checklistItemId);
    router.refresh();
  }

  // ── Grouped view (all sections collapse into one keyed list) ────────────────
  const groupedItems = useMemo(() => {
    if (groupBy === "none") return null;
    const all = [...filteredOverdue, ...filteredToday, ...filteredWeek];
    const groups = new Map<string, { label: string; items: Activity[] }>();
    for (const a of all) {
      const { key, label } = groupKey(a, nowMs);
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(a);
    }
    // SLA grouping has its own natural order; everything else: alpha by label.
    const entries = [...groups.entries()];
    if (groupBy === "sla") entries.sort(([a], [b]) => a.localeCompare(b));
    else entries.sort(([, a], [, b]) => a.label.localeCompare(b.label));
    return entries.map(([key, g]) => ({
      key, label: g.label,
      items: g.items.slice().sort((x, y) =>
        new Date(x.scheduledAt).getTime() - new Date(y.scheduledAt).getTime()
      ),
    }));
  }, [groupBy, filteredOverdue, filteredToday, filteredWeek, groupKey, nowMs]);

  return (
    <div className="space-y-6">
      {/* Sticky header: progress + filter pill + group-by */}
      <div className="sticky top-0 z-20 -mx-5 sm:-mx-8 px-5 sm:px-8 py-3 bg-white/95 backdrop-blur border-b border-stone-100">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <ProgressChip done={todayDoneCount} total={todayTotal} overdueCount={overdueCount} />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAddActivity(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New activity
            </button>
            <button
              onClick={() => setSheetOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                activeCount > 0
                  ? "bg-sky-50 border-sky-200 text-sky-700"
                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter{activeCount > 0 ? ` · ${activeCount}` : ""}
            </button>
            <GroupBySelect value={groupBy} onChange={setGroupBy} />
          </div>
        </div>
      </div>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        setFilter={setFilter}
        clearFilters={clearFilters}
        options={options}
        activeCount={activeCount}
      />

      {/* Follow-up action points raised on past visits — RP scope is "mine".
          Renders nothing when there are no overdue / due-today APs. */}
      <HomeTodayAPSection scope="mine" currentUserId={userId} />

      {/* Cluster-split heads-up: when today's activities span 2+ clusters,
          surface the breakdown so the RP sees the travel implication up front.
          Reflects filteredToday so it disappears when the RP narrows to one
          cluster intentionally. Tapping a pill opens the batch reschedule
          sheet for that cluster's events. */}
      <ClusterSplitBanner
        clusters={filteredToday.map(getActivityCluster)}
        onMoveCluster={setBatchCluster}
      />

      {batchCluster && (
        <ClusterBatchRescheduleSheet
          open
          onClose={() => setBatchCluster(null)}
          clusterName={batchCluster.name}
          events={filteredToday
            .filter(a => getActivityCluster(a)?.id === batchCluster.id)
            .map(a => ({ id: a.id, title: a.title, scheduledAt: a.scheduledAt }))}
          onRescheduled={onRescheduled}
        />
      )}

      {/* Grouped view */}
      {groupedItems ? (
        groupedItems.length === 0
          ? <EmptyState message="No activities match these filters." />
          : groupedItems.map(g => (
            <section key={g.key}>
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">{g.label || "—"}</h3>
                <span className="text-[10px] text-stone-400">{g.items.length}</span>
              </div>
              <div className="space-y-1.5">
                {g.items.map(a => {
                  const isOver = overdueActivities.some(o => o.id === a.id);
                  const done = a.status === "Done" || doneEventIds.has(a.id);
                  return (
                    <ActivityCard
                      key={a.id}
                      activity={a}
                      linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                      onCompleted={handleCompleted}
                      onRescheduled={onRescheduled}
                      isOverdue={isOver}
                      isDone={done}
                    />
                  );
                })}
              </div>
            </section>
          ))
      ) : (
        <>
          {/* Overdue (only when un-grouped + >0) — expanded by default; the
              ProgressChip badge alone wasn't surfacing the items enough. The
              RP can still collapse via the chevron when the cockpit is busy. */}
          {overdueCount > 0 && (
            <section>
              <button
                onClick={() => setShowOverdue(v => !v)}
                className="w-full flex items-center justify-between gap-2 py-2 text-left"
                aria-expanded={showOverdue}
              >
                <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                  Overdue ({overdueCount})
                </span>
                {showOverdue ? <ChevronUp className="w-3.5 h-3.5 text-amber-700" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-700" />}
              </button>
              {showOverdue && (
                <div className="space-y-2">
                  {filteredOverdue.map(a => (
                    <ActivityCard
                      key={a.id}
                      activity={a}
                      linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                      onCompleted={handleCompleted}
                      onRescheduled={onRescheduled}
                      isOverdue
                      variant="card"
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Today */}
          <section>
            <SectionTitle>Today</SectionTitle>
            {filteredToday.length === 0 ? (
              <EmptyState message={activeCount > 0 ? "No activities match these filters." : "Nothing scheduled for today."} />
            ) : (
              <div className="space-y-1.5">
                {filteredToday.map((a, i) => {
                  const done = a.status === "Done" || doneEventIds.has(a.id);
                  const showDivider = i === nowIdx && nowIdx > 0 && nowIdx < filteredToday.length;
                  return (
                    <div key={a.id}>
                      {showDivider && <NowDivider />}
                      <ActivityCard
                        activity={a}
                        linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                        onCompleted={handleCompleted}
                        onRescheduled={onRescheduled}
                        isDone={done}
                      />
                    </div>
                  );
                })}
                {nowIdx === filteredToday.length && filteredToday.length > 0 && <NowDivider />}
              </div>
            )}
          </section>

          {/* Next 7 days — collapsed */}
          <section>
            <button onClick={() => setShowWeek(v => !v)} className="w-full flex items-center gap-2 py-2 text-left">
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                Next 7 days ({filteredWeek.length})
              </span>
              {showWeek ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
            </button>
            {showWeek && (
              filteredWeek.length === 0 ? (
                <EmptyState message={activeCount > 0 ? "No matching activities this week." : "No upcoming activities this week."} />
              ) : (
                <div className="space-y-1.5">
                  {filteredWeek.map(a => (
                    <ActivityCard
                      key={a.id}
                      activity={a}
                      linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                      onCompleted={handleCompleted}
                      onRescheduled={onRescheduled}
                    />
                  ))}
                </div>
              )
            )}
          </section>
        </>
      )}

      {/* Quick links footer */}
      <div className="flex items-center gap-3 pt-2 text-[11px] text-stone-400">
        <Link href="/route" className="hover:text-sky-600 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          Plan route
        </Link>
        <Link href="/activities" className="hover:text-sky-600">
          Calendar view
        </Link>
      </div>

      {showAddActivity && (
        <AddActivityModal
          pitstops={addActivityPitstops}
          users={addActivityUsers}
          defaultDate={todayYMD()}
          onClose={() => setShowAddActivity(false)}
          onSaved={() => { setShowAddActivity(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function GroupBySelect({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as GroupBy)}
      className="text-xs border border-stone-200 rounded-full px-2.5 py-1.5 bg-white text-stone-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
      aria-label="Group by"
    >
      <option value="none">Group: None</option>
      <option value="cluster">Group: Cluster</option>
      <option value="settlement">Group: Settlement</option>
      <option value="goal">Group: Goal</option>
      <option value="domain">Group: Domain</option>
      <option value="type">Group: Type</option>
      <option value="sla">Group: SLA bucket</option>
    </select>
  );
}
