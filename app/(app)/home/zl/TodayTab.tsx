"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Filter, Plus } from "lucide-react";
import type { Activity, ChecklistItem, TeamMember, ZLTeamActivity } from "../_lib/types";
import { isToday } from "../_lib/helpers";
import type { ClusterStatus } from "../page";
import { ActivityCard } from "../_shared/ActivityCard";
import { ProgressChip } from "../_shared/ProgressChip";
import { NowDivider } from "../_shared/NowDivider";
import { EmptyState, SectionTitle } from "../_shared/Primitives";
import { FilterSheet } from "../_shared/FilterSheet";
import { useTodayFilters, type GroupBy } from "../_shared/useTodayFilters";
import { TeamSlaPanel, TeamOverduePanel } from "../TeamPerformance";
import { TeamTodayStripe } from "./TeamTodayStripe";
import { RescheduleAlertsPanel } from "./RescheduleAlertsPanel";
import { useSessionDoneIds } from "../_shared/useSessionDoneIds";
import { HomeTodayAPSection } from "@/components/action-points/HomeTodayAPSection";
import { PlanMonthCTA } from "@/components/pitstops/PlanMonthCTA";
import type { RPHealthStat } from "../page";
import AddActivityModal, { type ActivityModalPitstopRef, type ActivityModalUser } from "../_shared/AddActivityModal";

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * ZL Today — supervisory cockpit. Phase 4.1 lands the "My today" stripe (the
 * ZL's own activities, rendered through the same time-first cockpit as RP)
 * plus the TeamSlaPanel / TeamOverduePanel rollups previously gated to
 * Leader / Other only.
 *
 * Phase 4.2 will add the per-reportee Team today stripe (donut + slip counts,
 * expandable inline). Phase 4.3 will add the Reschedule alerts panel reading
 * recent ActivityRescheduled notifications.
 */
export function ZLTodayTab({
  userId,
  teamMembers,
  weekChecklists,
  zlOverdueActivities,
  zlMyActivities,
  clusterStatus,
  rpTeamHealth = [],
  addActivityPitstops,
  addActivityUsers,
}: {
  userId: string;
  teamMembers: TeamMember[];
  weekChecklists: ChecklistItem[];
  zlOverdueActivities: ZLTeamActivity[];
  zlMyActivities: ZLTeamActivity[];
  clusterStatus: ClusterStatus[];
  rpTeamHealth?: RPHealthStat[];
  addActivityPitstops: ActivityModalPitstopRef[];
  addActivityUsers: ActivityModalUser[];
}) {
  const router = useRouter();
  const { ids: doneEventIds, add: addDoneEventId } = useSessionDoneIds(`zl-${userId}-done-events`);
  const { ids: doneChecklistIds, add: addDoneChecklistId } = useSessionDoneIds(`zl-${userId}-done-checklists`);
  const [showWeek, setShowWeek] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);

  // ── ZL's own activities — split out from the team views ─────────────────
  // The `zlMyActivities` prop covers a whole week of activities the ZL is
  // personally attached to (as owner or attendee). We bucket on the client
  // so the time-first sections stay in sync with optimistic completion state.
  const myAll: Activity[] = useMemo(
    () => [
      ...zlMyActivities.filter(a => a.pitstops[0]?.pitstop.ownerId === userId).map(toActivity),
      // Also include team-overdue rows where the ZL is the owner — they live
      // on the overdue list, not zlMyActivities.
      ...zlOverdueActivities.filter(a => a.pitstops[0]?.pitstop.ownerId === userId).map(toActivity),
    ],
    [zlMyActivities, zlOverdueActivities, userId]
  );

  const {
    filters, setFilter, clearFilters, activeCount,
    groupBy, setGroupBy,
    matches, options, groupKey,
  } = useTodayFilters(myAll);

  // Linked checklist lookup (same pattern as RP).
  const activityChecklistMap = useMemo(() => {
    const m = new Map<string, ChecklistItem>();
    for (const ci of weekChecklists) {
      if (doneChecklistIds.has(ci.id)) continue;
      for (const a of ci.activities) m.set(a.id, ci);
    }
    return m;
  }, [weekChecklists, doneChecklistIds]);

  const nowMs = Date.now();
  const myOverdue = useMemo(
    () => myAll.filter(a => new Date(a.scheduledAt).getTime() < dayStart() && a.status !== "Done" && !doneEventIds.has(a.id) && matches(a)),
    [myAll, doneEventIds, matches]
  );
  const myToday = useMemo(
    () => myAll
      .filter(a => isToday(a.scheduledAt))
      .filter(matches)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [myAll, matches]
  );
  const myWeek = useMemo(
    () => myAll
      .filter(a => new Date(a.scheduledAt).getTime() >= dayEnd() && new Date(a.scheduledAt).getTime() < dayEnd() + 7 * 86_400_000)
      .filter(matches)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [myAll, matches]
  );

  const todayDoneCount = myToday.filter(a => a.status === "Done" || doneEventIds.has(a.id)).length;
  const todayTotal = myToday.length;

  const nowIdx = useMemo(() => {
    const i = myToday.findIndex(a => new Date(a.scheduledAt).getTime() >= nowMs);
    return i === -1 ? myToday.length : i;
  }, [myToday, nowMs]);

  function handleCompleted(eventId: string, checklistItemId?: string) {
    addDoneEventId(eventId);
    if (checklistItemId) addDoneChecklistId(checklistItemId);
    router.refresh();
  }
  const onRescheduled = () => router.refresh();

  const groupedItems = useMemo(() => {
    if (groupBy === "none") return null;
    const all = [...myOverdue, ...myToday, ...myWeek];
    const groups = new Map<string, { label: string; items: Activity[] }>();
    for (const a of all) {
      const { key, label } = groupKey(a, nowMs);
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(a);
    }
    const entries = [...groups.entries()];
    if (groupBy === "sla") entries.sort(([a], [b]) => a.localeCompare(b));
    else entries.sort(([, a], [, b]) => a.label.localeCompare(b.label));
    return entries.map(([key, g]) => ({
      key, label: g.label,
      items: g.items.slice().sort((x, y) => new Date(x.scheduledAt).getTime() - new Date(y.scheduledAt).getTime()),
    }));
  }, [groupBy, myOverdue, myToday, myWeek, groupKey, nowMs]);

  return (
    <div className="space-y-8">
      {/* ── My today stripe ──────────────────────────────────────────────── */}
      <section>
        <div className="sticky top-0 z-20 -mx-5 sm:-mx-8 px-5 sm:px-8 py-3 bg-white/95 backdrop-blur border-b border-stone-100">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <ProgressChip done={todayDoneCount} total={todayTotal} overdueCount={myOverdue.length} />
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
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value as GroupBy)}
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

        <div className="mt-4">
          <SectionTitle>My today</SectionTitle>

          {groupedItems ? (
            groupedItems.length === 0
              ? <EmptyState message="No activities match these filters." />
              : groupedItems.map(g => (
                <section key={g.key} className="mt-4">
                  <div className="flex items-baseline gap-2 mb-2">
                    <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">{g.label || "—"}</h3>
                    <span className="text-[10px] text-stone-400">{g.items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {g.items.map(a => {
                      const done = a.status === "Done" || doneEventIds.has(a.id);
                      const over = new Date(a.scheduledAt).getTime() < dayStart() && !done;
                      return (
                        <ActivityCard
                          key={a.id}
                          activity={a}
                          linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                          onCompleted={handleCompleted}
                          onRescheduled={onRescheduled}
                          isOverdue={over}
                          isDone={done}
                        />
                      );
                    })}
                  </div>
                </section>
              ))
          ) : (
            <>
              {myOverdue.length > 0 && (
                <div className="mt-2">
                  <h4 className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-2">
                    Overdue ({myOverdue.length})
                  </h4>
                  <div className="space-y-2">
                    {myOverdue.map(a => (
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
                </div>
              )}

              <div className="mt-4">
                <h4 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Today</h4>
                {myToday.length === 0 ? (
                  <EmptyState message={activeCount > 0 ? "No activities match these filters." : "Nothing scheduled for today."} />
                ) : (
                  <div className="space-y-1.5">
                    {myToday.map((a, i) => {
                      const done = a.status === "Done" || doneEventIds.has(a.id);
                      const showDivider = i === nowIdx && nowIdx > 0 && nowIdx < myToday.length;
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
                    {nowIdx === myToday.length && myToday.length > 0 && <NowDivider />}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button onClick={() => setShowWeek(v => !v)} className="w-full flex items-center gap-2 py-2 text-left">
                  <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                    Next 7 days ({myWeek.length})
                  </span>
                  {showWeek ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                </button>
                {showWeek && (
                  myWeek.length === 0 ? (
                    <EmptyState message="No upcoming activities this week." />
                  ) : (
                    <div className="space-y-1.5">
                      {myWeek.map(a => (
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
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Team follow-ups (action points raised by RPs in this ZL's tree) ── */}
      <HomeTodayAPSection scope="team" currentUserId={userId} />

      {/* ── Plan your month / visit calendar discoverability ────────────── */}
      <PlanMonthCTA />

      {/* ── Reschedule alerts (Phase 4.3) ───────────────────────────────── */}
      <RescheduleAlertsPanel />

      {/* ── Team today stripe (Phase 4.2) ───────────────────────────────── */}
      <section>
        <SectionTitle>Team today</SectionTitle>
        <TeamTodayStripe
          teamMembers={teamMembers}
          rpTeamHealth={rpTeamHealth}
          teamOverdueActivities={zlOverdueActivities}
        />
      </section>

      {/* ── Team rollups ─────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Team SLA</SectionTitle>
        <TeamSlaPanel />
      </section>

      <section>
        <SectionTitle>Team overdue</SectionTitle>
        <TeamOverduePanel />
      </section>

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

/**
 * Convert a `ZLTeamActivity` (the leaner team shape) into the `Activity` shape
 * `ActivityCard` consumes. The few missing fields (`pitstop.id`, `pitstop.title`)
 * we synthesize so the row still links / labels sensibly; falls back to "—" if
 * upstream gives us nothing.
 */
function toActivity(a: ZLTeamActivity): Activity {
  const ps = a.pitstops[0]?.pitstop;
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    scheduledAt: a.scheduledAt,
    location: a.location ?? null,
    status: a.status,
    attendees: a.attendees,
    pitstops: ps ? [{
      pitstop: {
        id: "",          // ZL team query omits pitstop.id; row hides the link when empty
        title: "",
        ownerId: ps.ownerId,
        goal: ps.goal as Activity["pitstops"] extends (infer P)[] ? P extends { pitstop: { goal: infer G } } ? G : never : never,
      },
    }] : [],
  };
}

function dayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}
function dayEnd() {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime();
}
