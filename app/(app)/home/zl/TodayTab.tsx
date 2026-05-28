"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight, ChevronLeft, LayoutDashboard, Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, Filter, ChevronDown, ChevronUp, Mic, Square, Loader2, Paperclip } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import Avatar from "@/components/Avatar";
import type { ActivityGoal, Activity, ChecklistItem, Goal, TeamMember, ZLTeamActivity, TabKey } from "../_lib/types";
import { fmtTime, fmtDate, fmtDateShort, isToday, daysDiff, daysAgo, activityMeta, groupByDay, fmtDomain, groupBySla, slaHeaderLabel, engLevel, istTodayStr, shiftIstDate } from "../_lib/helpers";
import { STATUS_BADGE, STATUS_DOT, CHECKLIST_STATUS_DOT, EVENT_TYPE_COLOR, ACTIVITY_TYPE_STYLE, DESIGNATION_ORDER, DESIGNATION_COLOR, PITSTOP_STATUS_COLOR } from "../_lib/constants";
import type { DomainStat, ClusterStat, ClusterStatus, RPHealthStat, ZLHealthStat, RPPitstopDetail, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop, AdminPersonHealth, AdminDelayedPitstop, AdminOverdueActivity, AdminEngagementStat, AdminCityCoverage, LeaderTeamMember, RPClusterDeckCluster, FacilityLayerConfigLite } from "../page";
import { ClusterTodayView } from "../_shared/ClusterTodayView";
import { EmptyState, SectionTitle, WeekCard } from "../_shared/Primitives";
import { RPChecklistRow } from "../_shared/RPChecklistRow";
import { ZLOverdueCarousel, ZLTodayCarousel } from "../_shared/ZLOverdue";

export function ZLTodayTab({
  userId,
  teamMembers,
  weekChecklists,
  zlOverdueActivities,
  zlMyActivities,
  clusterStatus,
}: {
  userId: string;
  teamMembers: TeamMember[];
  weekChecklists: ChecklistItem[];
  zlOverdueActivities: ZLTeamActivity[];
  zlMyActivities: ZLTeamActivity[];
  clusterStatus: ClusterStatus[];
}) {
  const [expandedAttentionIds, setExpandedAttentionIds] = useState<Set<string>>(new Set());
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<Set<string>>(new Set());
  const [completedActivityIds, setCompletedActivityIds] = useState<Set<string>>(new Set());
  const [completedChecklistIds, setCompletedChecklistIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [weekExpanded, setWeekExpanded] = useState(false);

  function toggleId(id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function handleDone(activityId: string) {
    setLoadingDoneId(activityId);
    await fetch(`/api/pitstop-events/${activityId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Done" }),
    });
    setCompletedActivityIds(prev => new Set([...prev, activityId]));
    setLoadingDoneId(null);
  }

  function getClusterName(clusterId: string | null | undefined) {
    if (!clusterId) return null;
    return clusterStatus.find(c => c.clusterId === clusterId)?.name ?? null;
  }

  // ZL's own activities
  const myOverdue = zlOverdueActivities.filter(
    a => a.pitstops[0]?.pitstop.ownerId === userId && !completedActivityIds.has(a.id)
  );
  const myToday = zlMyActivities.filter(
    a => isToday(a.scheduledAt) && !completedActivityIds.has(a.id)
  );
  const myWeek = zlMyActivities.filter(
    a => !isToday(a.scheduledAt) && !completedActivityIds.has(a.id)
  );

  // Per-RP overdue map (excluding ZL's own)
  const rpOverdueMap = useMemo(() => {
    const map = new Map<string, ZLTeamActivity[]>();
    for (const a of zlOverdueActivities) {
      if (completedActivityIds.has(a.id)) continue;
      const ownerId = a.pitstops[0]?.pitstop.ownerId;
      if (!ownerId || ownerId === userId) continue;
      if (!map.has(ownerId)) map.set(ownerId, []);
      map.get(ownerId)!.push(a);
    }
    return map;
  }, [zlOverdueActivities, completedActivityIds, userId]);

  // Per-RP checklist map (excluding ZL's own)
  const rpChecklistMap = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const ci of weekChecklists) {
      if (completedChecklistIds.has(ci.id) || ci.pitstop.ownerId === userId) continue;
      if (!map.has(ci.pitstop.ownerId)) map.set(ci.pitstop.ownerId, []);
      map.get(ci.pitstop.ownerId)!.push(ci);
    }
    return map;
  }, [weekChecklists, completedChecklistIds, userId]);

  const attentionRPs = teamMembers
    .filter(rp => (rpOverdueMap.get(rp.id)?.length ?? 0) > 0)
    .sort((a, b) => (rpOverdueMap.get(b.id)?.length ?? 0) - (rpOverdueMap.get(a.id)?.length ?? 0));

  const checklistRPs = teamMembers.filter(rp => (rpChecklistMap.get(rp.id)?.length ?? 0) > 0);

  const allClear = attentionRPs.length === 0 && myOverdue.length === 0 && myToday.length === 0 && checklistRPs.length === 0;

  // Inline activity row for ZL's own overdue/today
  function ZLActivityRow({ a, isOverdue }: { a: ZLTeamActivity; isOverdue: boolean }) {
    const goal = a.pitstops[0]?.pitstop.goal;
    const isOwner = a.pitstops[0]?.pitstop.ownerId === userId;
    const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
    const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
    const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
        isOverdue ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"
      }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
            {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
            {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
            {isAttendee && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
          </div>
          <p className={`text-xs ${isOverdue ? "text-amber-700" : "text-stone-400"}`}>
            {isOverdue ? `${daysAgo(a.scheduledAt)}d ago` : fmtTime(a.scheduledAt)}
            {a.location ? ` · ${a.location}` : ""}
          </p>
          {(goal?.title || domain || geo) && (
            <p className="text-[11px] text-stone-400 truncate mt-0.5">
              {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
          className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex-shrink-0">
          {loadingDoneId === a.id ? "…" : "Done"}
        </button>
      </div>
    );
  }

  // ZL's own work as cluster cards. Filter overdue/today/week down to items
  // whose pitstop is owned by this ZL, then hand off to ClusterTodayView for
  // the same layout RPs see. Team breakdown sections render below.
  const myOwnOverdue = zlOverdueActivities.filter(
    a => a.pitstops[0]?.pitstop.ownerId === userId && !completedActivityIds.has(a.id)
  );
  const myOwnToday = zlMyActivities.filter(
    a => isToday(a.scheduledAt)
      && a.pitstops[0]?.pitstop.ownerId === userId
      && !completedActivityIds.has(a.id)
  );
  const myOwnWeek = zlMyActivities.filter(
    a => !isToday(a.scheduledAt)
      && a.pitstops[0]?.pitstop.ownerId === userId
      && !completedActivityIds.has(a.id)
  );
  const myOwnChecklists = weekChecklists.filter(
    ci => ci.pitstop.ownerId === userId && !completedChecklistIds.has(ci.id)
  );

  return (
    <div className="space-y-8">

      {/* My work — cluster-card view (same layout as the RP Today tab). */}
      <ClusterTodayView
        userId={userId}
        overdueActivities={myOwnOverdue as unknown as Activity[]}
        todayActivities={myOwnToday as unknown as Activity[]}
        weekActivities={myOwnWeek as unknown as Activity[]}
        weekChecklists={myOwnChecklists}
      />

      {/* Team attention — RPs with overdue activities */}
      {attentionRPs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <SectionTitle>Team attention</SectionTitle>
          </div>
          <div className="space-y-2">
            {attentionRPs.map(rp => {
              const items = rpOverdueMap.get(rp.id) ?? [];
              const oldestDays = Math.max(...items.map(a => daysAgo(a.scheduledAt)));
              const expanded = expandedAttentionIds.has(rp.id);
              return (
                <div key={rp.id} className="rounded-xl border border-amber-200 overflow-hidden">
                  <button
                    onClick={() => toggleId(rp.id, setExpandedAttentionIds)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100/70 transition-colors text-left"
                  >
                    <Avatar name={rp.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                      <p className="text-xs text-stone-400 truncate">{(rp.rpClusters ?? []).map(c => c.name).join(", ") || "No cluster"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-amber-700">{items.length} overdue</span>
                      {oldestDays > 0 && (
                        <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">oldest {oldestDays}d</span>
                      )}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100 bg-white">
                      {items.map(a => {
                        const goal = a.pitstops[0]?.pitstop.goal;
                        const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
                        const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
                        return (
                          <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                                {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
                              </div>
                              <p className="text-xs text-amber-700">{daysAgo(a.scheduledAt)}d ago</p>
                              {(goal?.title || domain || geo) && (
                                <p className="text-[11px] text-stone-400 truncate mt-0.5">
                                  {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                            <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
                              className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0 transition-colors">
                              {loadingDoneId === a.id ? "…" : "Done"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ZL's own overdue — carousel on mobile, list on desktop */}
      {myOverdue.length > 0 && (
        <>
          {/* Mobile carousel */}
          <div className="sm:hidden">
            <ZLOverdueCarousel items={myOverdue} loadingDoneId={loadingDoneId} onDone={handleDone} />
          </div>
          {/* Desktop list */}
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <SectionTitle>Your update needed</SectionTitle>
            </div>
            <div className="space-y-2">
              {myOverdue.map(a => <ZLActivityRow key={a.id} a={a} isOverdue />)}
            </div>
          </div>
        </>
      )}

      {/* ZL's today */}
      {myToday.length === 0 ? (
        <div>
          <SectionTitle>Today</SectionTitle>
          <EmptyState message={myOverdue.length > 0 || attentionRPs.length > 0 ? "Nothing else scheduled for today." : "Nothing scheduled for today."} />
        </div>
      ) : (
        <>
          {/* Mobile carousel */}
          <div className="sm:hidden">
            <ZLTodayCarousel items={myToday} loadingDoneId={loadingDoneId} onDone={handleDone} />
          </div>
          {/* Desktop list */}
          <div className="hidden sm:block">
            <SectionTitle>Today</SectionTitle>
            <div className="space-y-2 mt-3">
              {myToday.map(a => <ZLActivityRow key={a.id} a={a} isOverdue={false} />)}
            </div>
          </div>
        </>
      )}

      {/* Team checklists */}
      {checklistRPs.length > 0 && (
        <div>
          <SectionTitle>Team checklists</SectionTitle>
          <div className="space-y-2">
            {checklistRPs.map(rp => {
              const items = rpChecklistMap.get(rp.id) ?? [];
              const overdueCount = items.filter(ci => {
                const ms = ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : null;
                return ms !== null && ms < Date.now();
              }).length;
              const expanded = expandedChecklistIds.has(rp.id);
              return (
                <div key={rp.id} className="rounded-xl border border-stone-200 overflow-hidden">
                  <button
                    onClick={() => toggleId(rp.id, setExpandedChecklistIds)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/70 transition-colors text-left"
                  >
                    <Avatar name={rp.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                      <p className="text-xs text-stone-400 truncate">{(rp.rpClusters ?? []).map(c => c.name).join(", ") || "No cluster"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-medium text-violet-700">{items.length} open</span>
                      {overdueCount > 0 && (
                        <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{overdueCount} overdue</span>
                      )}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100 bg-white">
                      {items.map(ci => (
                        <RPChecklistRow key={ci.id} item={ci}
                          onCompleted={id => setCompletedChecklistIds(prev => new Set([...prev, id]))} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All clear */}
      {allClear && <EmptyState message="All caught up — no overdue items for you or your team." />}

      {/* Coming up this week */}
      {myWeek.length > 0 && (
        <div>
          <button
            onClick={() => setWeekExpanded(e => !e)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider hover:text-stone-600 transition-colors mb-2"
          >
            Coming up this week ({myWeek.length})
            {weekExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {weekExpanded && (
            <div className="space-y-5">
              {groupByDay(myWeek, a => a.scheduledAt).map(({ label, items }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">{label}</p>
                  <div className="space-y-2">
                    {items.map(a => {
                      const ps = a.pitstops[0]?.pitstop;
                      const g = ps?.goal;
                      const domain = g?.needsDomain ? fmtDomain(g.needsDomain) : null;
                      const geo = g?.needsSettlement?.name ?? g?.needsCluster?.name ?? g?.needsZone?.name ?? null;
                      const isOwner = ps?.ownerId === userId;
                      const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
                      const role = isOwner ? "Owner" : isAttendee ? "Attendee" : null;
                      return <WeekCard key={a.id} title={a.title} type={a.type} scheduledAt={a.scheduledAt} location={a.location} goalTitle={g?.title} domain={domain} geo={geo} role={role} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── RP Today tab — flat priority list ────────────────────────────────────────

const PITSTOP_STATUS_PRIORITY: Record<string, number> = {
  InProgress: 0, Upcoming: 1, Blocked: 2,
};

