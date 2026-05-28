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

type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };
type PMDrillDown =
  | { type: "zl-overdue"; zlId: string }
  | { type: "zl-checklists"; zlId: string }
  | { type: "rp-overdue"; rpId: string }
  | { type: "rp-checklists"; rpId: string }
  | null;

export function PMTodayTab({
  userId,
  zlMembers,
  rpMembers,
  pmZLOverdueActivities,
  pmZLChecklists,
  pmMyActivities,
  pmRPOverdueActivities,
  pmRPChecklists,
}: {
  userId: string;
  zlMembers: PMTeamMember[];
  rpMembers: PMTeamMember[];
  pmZLOverdueActivities: ZLTeamActivity[];
  pmZLChecklists: ChecklistItem[];
  pmMyActivities: ZLTeamActivity[];
  pmRPOverdueActivities: ZLTeamActivity[];
  pmRPChecklists: ChecklistItem[];
}) {
  const [completedActivityIds, setCompletedActivityIds] = useState<Set<string>>(new Set());
  const [completedChecklistIds, setCompletedChecklistIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [expandedZLIds, setExpandedZLIds] = useState<Set<string>>(new Set());
  const [expandedRPIds, setExpandedRPIds] = useState<Set<string>>(new Set());
  const [expandedZLChecklistIds, setExpandedZLChecklistIds] = useState<Set<string>>(new Set());
  const [expandedRPChecklistIds, setExpandedRPChecklistIds] = useState<Set<string>>(new Set());
  const [weekExpanded, setWeekExpanded] = useState(false);

  const now = new Date();
  const todayStart = new Date(now.toDateString()).getTime();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

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

  // ── Derived data ─────────────────────────────────────────────────────────────

  // ZL attention: ZLs with overdue activities (excluding PM's own)
  const zlAttention = zlMembers
    .map(zl => ({
      ...zl,
      overdueItems: pmZLOverdueActivities.filter(a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === zl.id),
    }))
    .filter(zl => zl.overdueItems.length > 0)
    .sort((a, b) => b.overdueItems.length - a.overdueItems.length);

  // RP attention: RPs with overdue activities, grouped by ZL
  const rpAttentionByZL = zlMembers.map(zl => ({
    zl,
    rps: rpMembers
      .filter(rp => rp.reportsToId === zl.id)
      .map(rp => ({
        ...rp,
        overdueItems: pmRPOverdueActivities.filter(a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === rp.id),
      }))
      .filter(rp => rp.overdueItems.length > 0)
      .sort((a, b) => b.overdueItems.length - a.overdueItems.length),
  })).filter(g => g.rps.length > 0);

  // ZL checklists
  const zlChecklists = zlMembers
    .map(zl => ({
      ...zl,
      items: pmZLChecklists.filter(ci => !completedChecklistIds.has(ci.id) && ci.pitstop.ownerId === zl.id),
    }))
    .filter(zl => zl.items.length > 0);

  // RP checklists grouped by ZL
  const rpChecklistsByZL = zlMembers.map(zl => ({
    zl,
    rps: rpMembers
      .filter(rp => rp.reportsToId === zl.id)
      .map(rp => ({
        ...rp,
        items: pmRPChecklists.filter(ci => !completedChecklistIds.has(ci.id) && ci.pitstop.ownerId === rp.id),
      }))
      .filter(rp => rp.items.length > 0),
  })).filter(g => g.rps.length > 0);

  const hasTeamChecklists = zlChecklists.length > 0 || rpChecklistsByZL.length > 0;

  // PM's own activities
  const myOverdue = pmZLOverdueActivities.filter(
    a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === userId
  );
  const myToday = pmMyActivities.filter(
    a => !completedActivityIds.has(a.id) && new Date(a.scheduledAt) >= now && new Date(a.scheduledAt) <= todayEnd
  );
  const myWeek = pmMyActivities.filter(
    a => !completedActivityIds.has(a.id) && new Date(a.scheduledAt) > todayEnd
  );

  const allClear = zlAttention.length === 0 && rpAttentionByZL.length === 0
    && myOverdue.length === 0 && myToday.length === 0 && !hasTeamChecklists;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* PM's own work as cluster cards. */}
      <ClusterTodayView
        userId={userId}
        overdueActivities={myOverdue as unknown as Activity[]}
        todayActivities={myToday as unknown as Activity[]}
        weekActivities={myWeek as unknown as Activity[]}
        weekChecklists={[]}
      />

      {/* ZL attention — inline expand */}
      {zlAttention.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <SectionTitle>ZL attention</SectionTitle>
          </div>
          <div className="space-y-2">
            {zlAttention.map(zl => {
              const expanded = expandedZLIds.has(zl.id);
              const oldest = Math.max(...zl.overdueItems.map(a => daysAgo(a.scheduledAt)));
              return (
                <div key={zl.id} className="rounded-xl border border-amber-200 overflow-hidden">
                  <button
                    onClick={() => toggleId(zl.id, setExpandedZLIds)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100/70 transition-colors text-left"
                  >
                    <Avatar name={zl.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{zl.name}</p>
                      <p className="text-xs text-stone-400">Zone Leader</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-amber-700">{zl.overdueItems.length} overdue</span>
                      {oldest > 0 && (
                        <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">oldest {oldest}d</span>
                      )}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100 bg-white">
                      {zl.overdueItems.map(a => {
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

      {/* RP attention — grouped by ZL, inline expand */}
      {rpAttentionByZL.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <SectionTitle>RP attention</SectionTitle>
          </div>
          <div className="space-y-4">
            {rpAttentionByZL.map(({ zl, rps }) => (
              <div key={zl.id}>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-300 inline-block" />
                  {zl.name ?? "Unnamed ZL"}
                </p>
                <div className="space-y-2">
                  {rps.map(rp => {
                    const expanded = expandedRPIds.has(rp.id);
                    const oldest = Math.max(...rp.overdueItems.map(a => daysAgo(a.scheduledAt)));
                    return (
                      <div key={rp.id} className="rounded-xl border border-amber-200 overflow-hidden">
                        <button
                          onClick={() => toggleId(rp.id, setExpandedRPIds)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100/70 transition-colors text-left"
                        >
                          <Avatar name={rp.name} size="xs" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                            <p className="text-xs text-stone-400">RP</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-semibold text-amber-700">{rp.overdueItems.length} overdue</span>
                            {oldest > 0 && (
                              <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">oldest {oldest}d</span>
                            )}
                            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                          </div>
                        </button>
                        {expanded && (
                          <div className="divide-y divide-stone-100 bg-white">
                            {rp.overdueItems.map(a => {
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
            ))}
          </div>
        </div>
      )}

      {/* PM's own overdue — carousel on mobile, list on desktop */}
      {myOverdue.length > 0 && (
        <>
          <div className="sm:hidden">
            <ZLOverdueCarousel items={myOverdue} loadingDoneId={loadingDoneId} onDone={handleDone} />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <SectionTitle>Your update needed</SectionTitle>
            </div>
            <div className="space-y-2">
              {myOverdue.map(a => {
                const goal = a.pitstops[0]?.pitstop.goal;
                const isOwner = a.pitstops[0]?.pitstop.ownerId === userId;
                const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
                const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
                const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                        {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
                        {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
                        {isAttendee && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
                      </div>
                      <p className="text-xs text-amber-700">{daysAgo(a.scheduledAt)}d overdue</p>
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
          </div>
        </>
      )}

      {/* PM's today — carousel on mobile, list on desktop */}
      {myToday.length === 0 ? (
        <div>
          <SectionTitle>Today</SectionTitle>
          <EmptyState message={myOverdue.length > 0 || zlAttention.length > 0 || rpAttentionByZL.length > 0 ? "Nothing else scheduled for today." : "Nothing scheduled for today."} />
        </div>
      ) : (
        <>
          <div className="sm:hidden">
            <ZLTodayCarousel items={myToday} loadingDoneId={loadingDoneId} onDone={handleDone} />
          </div>
          <div className="hidden sm:block">
            <SectionTitle>Today</SectionTitle>
            <div className="space-y-2 mt-3">
              {myToday.map(a => {
                const goal = a.pitstops[0]?.pitstop.goal;
                const isOwner = a.pitstops[0]?.pitstop.ownerId === userId;
                const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
                const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
                const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-stone-200 bg-white">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                        {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
                        {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
                        {isAttendee && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
                      </div>
                      <p className="text-xs text-stone-400">{fmtTime(a.scheduledAt)}{a.location ? ` · ${a.location}` : ""}</p>
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
          </div>
        </>
      )}

      {/* Team checklists — ZLs then RPs inline expand */}
      {hasTeamChecklists && (
        <div>
          <SectionTitle>Team checklists</SectionTitle>
          <div className="space-y-2 mt-3">
            {zlChecklists.map(zl => {
              const expanded = expandedZLChecklistIds.has(zl.id);
              const overdueCount = zl.items.filter(ci => {
                const ms = ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : null;
                return ms !== null && ms < Date.now();
              }).length;
              return (
                <div key={zl.id} className="rounded-xl border border-stone-200 overflow-hidden">
                  <button
                    onClick={() => toggleId(zl.id, setExpandedZLChecklistIds)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/70 transition-colors text-left"
                  >
                    <Avatar name={zl.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{zl.name}</p>
                      <p className="text-xs text-stone-400">Zone Leader</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-medium text-violet-700">{zl.items.length} open</span>
                      {overdueCount > 0 && <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{overdueCount} overdue</span>}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100 bg-white">
                      {zl.items.map(ci => (
                        <RPChecklistRow key={ci.id} item={ci} onCompleted={id => setCompletedChecklistIds(prev => new Set([...prev, id]))} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {rpChecklistsByZL.map(({ zl, rps }) => (
              <div key={zl.id} className="space-y-2">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide px-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-300 inline-block" />
                  {zl.name ?? "Unnamed ZL"} · RPs
                </p>
                {rps.map(rp => {
                  const expanded = expandedRPChecklistIds.has(rp.id);
                  const overdueCount = rp.items.filter(ci => {
                    const ms = ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : null;
                    return ms !== null && ms < Date.now();
                  }).length;
                  return (
                    <div key={rp.id} className="rounded-xl border border-stone-200 overflow-hidden">
                      <button
                        onClick={() => toggleId(rp.id, setExpandedRPChecklistIds)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/70 transition-colors text-left"
                      >
                        <Avatar name={rp.name} size="xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                          <p className="text-xs text-stone-400">RP</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-medium text-violet-700">{rp.items.length} open</span>
                          {overdueCount > 0 && <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{overdueCount} overdue</span>}
                          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                        </div>
                      </button>
                      {expanded && (
                        <div className="divide-y divide-stone-100 bg-white">
                          {rp.items.map(ci => (
                            <RPChecklistRow key={ci.id} item={ci} onCompleted={id => setCompletedChecklistIds(prev => new Set([...prev, id]))} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
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

