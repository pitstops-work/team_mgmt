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
import { RPActivityRow, RPOverdueCarousel, RPTodayCarousel } from "../_shared/RPActivityRow";
import { RPChecklistRow } from "../_shared/RPChecklistRow";

export function ClusterTodayView({
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
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  // Section open/closed state. The "today" section defaults to open so each
  // cluster card has real content visible immediately on landing. The other
  // three default to closed. `sectionOverrides` stores explicit user choices
  // keyed by "<clusterId>:<section>" so toggling persists across renders.
  const DEFAULT_OPEN_SECTIONS = new Set(["today"]);
  const [sectionOverrides, setSectionOverrides] = useState<Map<string, "open" | "closed">>(new Map());
  const isOpen = (clusterId: string, section: string) => {
    const override = sectionOverrides.get(`${clusterId}:${section}`);
    if (override) return override === "open";
    return DEFAULT_OPEN_SECTIONS.has(section);
  };
  const toggleSection = (clusterId: string, section: string) => {
    const k = `${clusterId}:${section}`;
    const current = isOpen(clusterId, section);
    setSectionOverrides(prev => {
      const next = new Map(prev);
      next.set(k, current ? "closed" : "open");
      return next;
    });
  };
  // Mobile cluster carousel state.
  const carouselRef = useRef<HTMLDivElement>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    setCarouselIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const todayMs = new Date(now.toDateString()).getTime();

  // Activities whose linked checklist was completed (any completionType) should disappear
  const completedActivityIds = useMemo(() =>
    new Set(
      weekChecklists
        .filter(ci => completedItemIds.has(ci.id))
        .flatMap(ci => ci.activities.map(a => a.id))
    ),
    [weekChecklists, completedItemIds]
  );

  // Map: activityId → linked open ChecklistItem (for action button derivation)
  const activityChecklistMap = useMemo(() => {
    const map = new Map<string, ChecklistItem>();
    for (const ci of weekChecklists) {
      if (completedItemIds.has(ci.id)) continue;
      for (const act of ci.activities) map.set(act.id, ci);
    }
    return map;
  }, [weekChecklists, completedItemIds]);

  function isVisible(a: Activity) {
    return !doneIds.has(a.id) && !completedActivityIds.has(a.id);
  }

  // Overdue: past activities + past-due-today, still Scheduled, oldest first
  const pastDueToday = todayActivities.filter(
    a => new Date(a.scheduledAt) < now && a.status === "Scheduled" && isVisible(a)
  );
  const overdueItems = [
    ...overdueActivities.filter(a => isVisible(a)),
    ...pastDueToday,
  ].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // Today: upcoming (not yet past), still Scheduled
  const todayItems = todayActivities.filter(
    a => new Date(a.scheduledAt) >= now && a.status === "Scheduled" && isVisible(a)
  );

  // Rest of week
  const weekItems = weekActivities.filter(
    a => new Date(a.scheduledAt) > todayEnd && a.status === "Scheduled"
  );

  // Checklists sorted overdue-first, then by pitstop targetDate
  const openChecklists = useMemo(() =>
    weekChecklists
      .filter(ci => !completedItemIds.has(ci.id))
      .sort((a, b) => {
        const aMs = a.pitstop.targetDate ? new Date(a.pitstop.targetDate).getTime() : Infinity;
        const bMs = b.pitstop.targetDate ? new Date(b.pitstop.targetDate).getTime() : Infinity;
        return aMs - bMs;
      }),
    [weekChecklists, completedItemIds]
  );

  function handleCompleted(checklistItemId: string) {
    setCompletedItemIds(prev => new Set([...prev, checklistItemId]));
  }

  async function handleDone(eventId: string) {
    setLoadingDoneId(eventId);
    try {
      await fetch(`/api/pitstop-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      setDoneIds(prev => new Set([...prev, eventId]));
      // Server closes Activity-type checklist items when their linked event is marked Done.
      // Mirror that here so "Open checklists" removes them immediately.
      const linkedIds = weekChecklists
        .filter(ci => ci.completionType === "Activity" && ci.activities.some(a => a.id === eventId))
        .map(ci => ci.id);
      if (linkedIds.length > 0) setCompletedItemIds(prev => new Set([...prev, ...linkedIds]));
    } finally {
      setLoadingDoneId(null);
    }
  }

  const allEmpty = overdueItems.length === 0 && todayItems.length === 0 && openChecklists.length === 0 && weekItems.length === 0;

  // Group every item by its cluster so the page renders one card per cluster.
  const UNCLUSTERED_ID = "__unclustered__";
  type Bucket = {
    id: string;
    name: string;
    overdue: Activity[];
    today: Activity[];
    checklists: ChecklistItem[];
    week: Activity[];
    earliestMs: number;
  };
  const bucketMap = new Map<string, Bucket>();
  const ensureBucket = (c: { id: string; name: string } | null | undefined): Bucket => {
    const id = c?.id ?? UNCLUSTERED_ID;
    const name = c?.name ?? "No cluster";
    let b = bucketMap.get(id);
    if (!b) { b = { id, name, overdue: [], today: [], checklists: [], week: [] , earliestMs: Infinity}; bucketMap.set(id, b); }
    return b;
  };
  const activityCluster = (a: Activity) => a.pitstops?.[0]?.pitstop?.goal?.needsCluster ?? null;
  const checklistCluster = (ci: ChecklistItem) => ci.pitstop.goal.needsCluster ?? null;
  for (const a of overdueItems)        ensureBucket(activityCluster(a)).overdue.push(a);
  for (const a of todayItems)          ensureBucket(activityCluster(a)).today.push(a);
  for (const ci of openChecklists)     ensureBucket(checklistCluster(ci)).checklists.push(ci);
  for (const a of weekItems)           ensureBucket(activityCluster(a)).week.push(a);

  // Sort items within each bucket by SLA-due (earliest first), and stamp the
  // bucket's earliest urgent date so we can order the cards too.
  const activityMs = (a: Activity) => new Date(a.scheduledAt).getTime();
  const checklistMs = (ci: ChecklistItem) =>
    ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
  for (const b of bucketMap.values()) {
    b.overdue.sort((x, y) => activityMs(x) - activityMs(y));
    b.today.sort((x, y) => activityMs(x) - activityMs(y));
    b.week.sort((x, y) => activityMs(x) - activityMs(y));
    b.checklists.sort((x, y) => checklistMs(x) - checklistMs(y));
    const candidates: number[] = [];
    if (b.overdue[0]) candidates.push(activityMs(b.overdue[0]));
    if (b.today[0]) candidates.push(activityMs(b.today[0]));
    if (b.checklists[0]) candidates.push(checklistMs(b.checklists[0]));
    if (b.week[0]) candidates.push(activityMs(b.week[0]));
    b.earliestMs = candidates.length > 0 ? Math.min(...candidates) : Number.MAX_SAFE_INTEGER;
  }

  // Most-urgent cluster first. "No cluster" bucket always last.
  const buckets = [...bucketMap.values()].sort((a, b) => {
    if (a.id === UNCLUSTERED_ID) return 1;
    if (b.id === UNCLUSTERED_ID) return -1;
    if (a.earliestMs !== b.earliestMs) return a.earliestMs - b.earliestMs;
    return a.name.localeCompare(b.name);
  });

  const nonEmptyBuckets = buckets.filter(b =>
    b.overdue.length + b.today.length + b.checklists.length + b.week.length > 0
  );

  // Render a single cluster card. Re-used by both the mobile carousel and the
  // desktop list — extracted so we don't have to fight Tailwind's responsive
  // class precedence with a dual-mode flex container.
  const renderClusterCard = (bucket: Bucket) => (
    <section
      key={bucket.id}
      className="rounded-2xl border border-stone-200 bg-white overflow-hidden"
    >
            {/* Cluster header */}
            <header className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-stone-400 flex-shrink-0" />
              <h3 className="text-sm font-semibold text-stone-800 truncate">{bucket.name}</h3>
            </header>

            <div className="divide-y divide-stone-100">
              {/* Needs your update */}
              {bucket.overdue.length > 0 && (() => {
                const open = isOpen(bucket.id, "overdue");
                return (
                  <div>
                    <button
                      onClick={() => toggleSection(bucket.id, "overdue")}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">Needs your update</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{bucket.overdue.length}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        {bucket.overdue.map(a => (
                          <RPActivityRow
                            key={a.id} a={a} userId={userId} isOverdue
                            linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                            onDone={handleDone} onCompleted={handleCompleted}
                            isLoadingDone={loadingDoneId === a.id}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Today — always rendered so the section is visible even when
                  every today-activity has already moved into "Needs your update". */}
              {(() => {
                const open = isOpen(bucket.id, "today");
                const empty = bucket.today.length === 0;
                return (
                  <div>
                    <button
                      onClick={() => toggleSection(bucket.id, "today")}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">Today</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${empty ? "bg-stone-100 text-stone-400" : "bg-sky-100 text-sky-700"}`}>{bucket.today.length}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        {empty ? (
                          <p className="text-xs text-stone-400 italic px-1 py-2">
                            {bucket.overdue.length > 0
                              ? "Nothing else scheduled for later today."
                              : "Nothing scheduled for today."}
                          </p>
                        ) : (
                          bucket.today.map(a => (
                            <RPActivityRow
                              key={a.id} a={a} userId={userId} isOverdue={false}
                              linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                              onDone={handleDone} onCompleted={handleCompleted}
                              isLoadingDone={loadingDoneId === a.id}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Open checklists — grouped by pitstop so a long list reads as
                  a small number of pitstops × items instead of one flat list. */}
              {bucket.checklists.length > 0 && (() => {
                const open = isOpen(bucket.id, "checklists");
                // Group items by pitstop, preserving the SLA-sorted order.
                const groupOrder: string[] = [];
                const groups = new Map<string, ChecklistItem[]>();
                for (const ci of bucket.checklists) {
                  const pid = ci.pitstop.id;
                  if (!groups.has(pid)) { groups.set(pid, []); groupOrder.push(pid); }
                  groups.get(pid)!.push(ci);
                }
                return (
                  <div>
                    <button
                      onClick={() => toggleSection(bucket.id, "checklists")}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">Open checklists</p>
                      <span className="text-[10px] text-stone-400 mr-1">{groupOrder.length} pitstop{groupOrder.length === 1 ? "" : "s"}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">{bucket.checklists.length}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        {groupOrder.map(pid => {
                          const items = groups.get(pid)!;
                          const first = items[0];
                          const pitstopMs = first.pitstop.targetDate ? new Date(first.pitstop.targetDate).getTime() : null;
                          const isOverduePs = pitstopMs !== null && pitstopMs < todayMs;
                          const dueLabel = pitstopMs === null
                            ? null
                            : isOverduePs
                              ? `Overdue · ${fmtDateShort(first.pitstop.targetDate!)}`
                              : `Due ${fmtDateShort(first.pitstop.targetDate!)}`;
                          return (
                            <div key={pid} className={`rounded-xl border overflow-hidden ${isOverduePs ? "border-amber-200" : "border-stone-100"}`}>
                              <Link
                                href={`/goals/${first.pitstop.goal.id}/pitstops/${first.pitstop.id}`}
                                className={`block px-3 py-2 flex items-center gap-2 min-w-0 ${isOverduePs ? "bg-amber-50" : "bg-stone-50"}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-stone-800 truncate">{first.pitstop.title}</p>
                                  <p className="text-[10px] text-stone-400 truncate">{first.pitstop.goal.title}</p>
                                </div>
                                {dueLabel && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${isOverduePs ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>{dueLabel}</span>
                                )}
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold flex-shrink-0">{items.length}</span>
                              </Link>
                              <div className="divide-y divide-stone-100 bg-white">
                                {items.map(ci => (
                                  <RPChecklistRow key={ci.id} item={ci} onCompleted={handleCompleted} compact />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Coming up this week — always render so users can see "nothing scheduled" */}
              {(() => {
                const open = isOpen(bucket.id, "week");
                const empty = bucket.week.length === 0;
                return (
                  <div>
                    <button
                      onClick={() => toggleSection(bucket.id, "week")}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">Coming up this week</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${empty ? "bg-stone-100 text-stone-400" : "bg-stone-200 text-stone-700"}`}>{bucket.week.length}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </button>
                    {open && (empty ? (
                      <div className="px-3 pb-3">
                        <p className="text-xs text-stone-400 italic px-1 py-2">Nothing else scheduled this week.</p>
                      </div>
                    ) : (
                      <div className="px-3 pb-3 space-y-2">
                        {bucket.week.map(a => (
                          <RPActivityRow
                            key={a.id} a={a} userId={userId} isOverdue={false}
                            linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                            onDone={handleDone} onCompleted={handleCompleted}
                            isLoadingDone={loadingDoneId === a.id}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
    </section>
  );

  return (
    <div>
      {allEmpty && <EmptyState message="You're all caught up for today." />}

      {/* Mobile: horizontal swipe carousel of cluster cards */}
      <div className="sm:hidden">
        {nonEmptyBuckets.length > 1 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs text-stone-400 tabular-nums">
              {Math.min(carouselIdx + 1, nonEmptyBuckets.length)} of {nonEmptyBuckets.length}
            </span>
            <span className="text-[11px] text-stone-400 truncate ml-2">
              ← swipe between clusters →
            </span>
          </div>
        )}
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {nonEmptyBuckets.map(bucket => (
            <div key={bucket.id} className="snap-start flex-shrink-0 w-full pr-[1px]">
              {renderClusterCard(bucket)}
            </div>
          ))}
        </div>
        {nonEmptyBuckets.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {nonEmptyBuckets.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-200 ${
                i === carouselIdx ? "w-4 bg-stone-700" : "w-1.5 bg-stone-200"
              }`} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: grid of cluster cards — single column on tablet, two
          columns on wide screens to use the horizontal real-estate. */}
      <div className="hidden sm:grid sm:grid-cols-1 lg:grid-cols-2 gap-4">
        {nonEmptyBuckets.map(bucket => renderClusterCard(bucket))}
      </div>
    </div>
  );
}

// ── Past tab ──────────────────────────────────────────────────────────────────
// Shows Done activities from the last 30 days using the same cluster-card +
// section layout as Today. Three sections inside each card: Today / This week
// / Earlier. For ZL/PM/Leader, an expandable per-person team breakdown follows.
