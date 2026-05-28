"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import type { Activity, ChecklistItem } from "../_lib/types";
import { isToday } from "../_lib/helpers";
import type { RPClusterDeckCluster, FacilityLayerConfigLite } from "../page";
import { ActivityCard } from "../_shared/ActivityCard";
import { ProgressChip } from "../_shared/ProgressChip";
import { NowDivider } from "../_shared/NowDivider";
import { EmptyState, SectionTitle } from "../_shared/Primitives";

/**
 * RP Today — time-first cockpit. Replaces the cluster-first playing-card deck.
 *
 * Layout:
 *  - sticky header with progress chip (Today X/Y · N overdue)
 *  - Overdue section (only when >0)
 *  - Today section, time-sorted, with `<NowDivider />` between past- and
 *    later-now items
 *  - Next 7 days, collapsed by default
 *
 * Cluster is rendered as a chip on each row, never as the primary axis.
 * The previous `RPClusterDeck` survives in `_shared/` and is destined for the
 * `/route` planning surface (decoupled from this rebuild).
 *
 * Filter + Group-by chrome ships in Phase 2.2.
 */
export function RPTodayTab({
  userId,
  overdueActivities,
  todayActivities,
  weekActivities,
  weekChecklists,
}: {
  userId: string;
  overdueActivities: Activity[];
  todayActivities: Activity[];
  weekActivities: Activity[];
  weekChecklists: ChecklistItem[];
  /* Accepted but unused — handed in by the page-level loader; kept on the
     signature so we don't have to fork prop-passing in HomeView. */
  doneActivities?: Activity[];
  rpClusterDeck?: RPClusterDeckCluster[];
  facilityLayerConfigs?: FacilityLayerConfigLite[];
}) {
  // Local optimistic completion state. Server PATCHes happen inside ActivityCard;
  // we only track ids here so the UI hides them without a round-trip.
  const [doneEventIds, setDoneEventIds] = useState<Set<string>>(new Set());
  const [doneChecklistIds, setDoneChecklistIds] = useState<Set<string>>(new Set());
  const [showWeek, setShowWeek] = useState(false);

  // Activity → linked checklist lookup. Mirrors the legacy pattern in
  // `RPClusterDeck`: only "Activity" completionType checklists own the eventId.
  const activityChecklistMap = useMemo(() => {
    const m = new Map<string, ChecklistItem>();
    for (const ci of weekChecklists) {
      if (doneChecklistIds.has(ci.id)) continue;
      for (const a of ci.activities) m.set(a.id, ci);
    }
    return m;
  }, [weekChecklists, doneChecklistIds]);

  // Today partitioning. `todayActivities` from the page already covers all
  // activities scheduled today (open + done). We bucket on the client so the
  // progress chip and ordering stay in sync with optimistic state.
  const todayList = useMemo(() => {
    return todayActivities
      .slice()
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [todayActivities]);

  const nowMs = Date.now();
  const todayDoneCount = todayList.filter(a => a.status === "Done" || doneEventIds.has(a.id)).length;
  const todayTotal = todayList.length;

  // Find the insertion index for `<NowDivider />`: first item whose scheduledAt
  // is strictly after `now`. If everything is past, divider sits at the end;
  // if everything is future, it sits at the start.
  const nowIdx = useMemo(() => {
    const i = todayList.findIndex(a => new Date(a.scheduledAt).getTime() >= nowMs);
    return i === -1 ? todayList.length : i;
  }, [todayList, nowMs]);

  // Week list — exclude items already scheduled today.
  const weekList = useMemo(() => {
    return weekActivities
      .filter(a => !isToday(a.scheduledAt))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [weekActivities]);

  const visibleOverdue = overdueActivities.filter(a => !doneEventIds.has(a.id));
  const overdueCount = visibleOverdue.length;

  function handleCompleted(eventId: string, checklistItemId?: string) {
    setDoneEventIds(prev => new Set(prev).add(eventId));
    if (checklistItemId) setDoneChecklistIds(prev => new Set(prev).add(checklistItemId));
  }

  return (
    <div className="space-y-6">
      {/* Sticky header — progress + (Phase 2.2) Filter pill + Group-by go here */}
      <div className="sticky top-0 z-10 -mx-5 sm:-mx-8 px-5 sm:px-8 py-3 bg-white/95 backdrop-blur border-b border-stone-100">
        <ProgressChip done={todayDoneCount} total={todayTotal} overdueCount={overdueCount} />
      </div>

      {/* Overdue */}
      {overdueCount > 0 && (
        <section>
          <SectionTitle>
            <span className="text-amber-700">Overdue ({overdueCount})</span>
          </SectionTitle>
          <div className="space-y-2">
            {visibleOverdue.map(a => (
              <ActivityCard
                key={a.id}
                activity={a}
                linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                onCompleted={handleCompleted}
                isOverdue
                variant="card"
              />
            ))}
          </div>
        </section>
      )}

      {/* Today */}
      <section>
        <SectionTitle>Today</SectionTitle>
        {todayList.length === 0 ? (
          <EmptyState message="Nothing scheduled for today." />
        ) : (
          <div className="space-y-1.5">
            {todayList.map((a, i) => {
              const done = a.status === "Done" || doneEventIds.has(a.id);
              const showDivider = i === nowIdx && nowIdx > 0 && nowIdx < todayList.length;
              return (
                <div key={a.id}>
                  {showDivider && <NowDivider />}
                  <ActivityCard
                    activity={a}
                    linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                    onCompleted={handleCompleted}
                    isDone={done}
                  />
                </div>
              );
            })}
            {/* Edge-case dividers: all items are in the past or all in the future */}
            {nowIdx === todayList.length && todayList.length > 0 && <NowDivider />}
            {nowIdx === 0 && todayList.length > 0 && (
              /* divider already rendered above before the first item; nothing extra */
              null
            )}
          </div>
        )}
      </section>

      {/* Next 7 days — collapsed peek */}
      <section>
        <button
          onClick={() => setShowWeek(v => !v)}
          className="w-full flex items-center gap-2 py-2 text-left"
        >
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
            Next 7 days ({weekList.length})
          </span>
          {showWeek ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
        </button>
        {showWeek && (
          weekList.length === 0 ? (
            <EmptyState message="No upcoming activities this week." />
          ) : (
            <div className="space-y-1.5">
              {weekList.map(a => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                  onCompleted={handleCompleted}
                />
              ))}
            </div>
          )
        )}
      </section>

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
    </div>
  );
}
