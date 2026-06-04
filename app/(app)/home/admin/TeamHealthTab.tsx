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
import { PitstopDetailCard } from "../_shared/PitstopDetailCard";
import { EmptyState, SectionTitle, HealthBar } from "../_shared/Primitives";

export function AdminTeamHealthTab({ personHealth, overdueActivities = [] }: {
  personHealth: AdminPersonHealth[];
  /** Flat overdue-activity list from `adminDash.overdueActivitiesList`. Used
   *  to drive the per-person overdue-activities drill-down. Optional so the
   *  component still mounts cleanly if a caller forgets to pass it. */
  overdueActivities?: AdminOverdueActivity[];
}) {
  const [expandedPMs, setExpandedPMs] = useState<Set<string>>(new Set());
  const [expandedZLs, setExpandedZLs] = useState<Set<string>>(new Set());
  const [expandedDelayedRP, setExpandedDelayedRP] = useState<string | null>(null);
  const [expandedDelayedZL, setExpandedDelayedZL] = useState<string | null>(null);
  const [expandedDelayedPM, setExpandedDelayedPM] = useState<string | null>(null);
  const [expandedOverdueRP, setExpandedOverdueRP] = useState<string | null>(null);
  const [expandedOverdueZL, setExpandedOverdueZL] = useState<string | null>(null);
  const [expandedOverduePM, setExpandedOverduePM] = useState<string | null>(null);

  const pms = personHealth.filter(p => p.designation === "PM");
  const zls = personHealth.filter(p => p.designation === "ZL");
  const rps = personHealth.filter(p => p.designation === "RP");

  // Index overdue activities by ownerId once so each card lookup is O(1).
  const overdueByOwner = useMemo(() => {
    const m = new Map<string, AdminOverdueActivity[]>();
    for (const a of overdueActivities) {
      if (!a.ownerId) continue;
      const list = m.get(a.ownerId);
      if (list) list.push(a); else m.set(a.ownerId, [a]);
    }
    return m;
  }, [overdueActivities]);

  function rpOverdueActs(rp: AdminPersonHealth): AdminOverdueActivity[] {
    return overdueByOwner.get(rp.userId) ?? [];
  }
  function zlAllOverdueActs(zl: AdminPersonHealth): AdminOverdueActivity[] {
    const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
    return [
      ...(overdueByOwner.get(zl.userId) ?? []),
      ...zlRPs.flatMap(r => overdueByOwner.get(r.userId) ?? []),
    ];
  }
  function pmAllOverdueActs(pm: AdminPersonHealth): AdminOverdueActivity[] {
    const pmZLs = zls.filter(z => z.reportsToId === pm.userId);
    const pmZLRPs = rps.filter(r => pmZLs.some(z => z.userId === r.reportsToId));
    const pmDirectRPs = rps.filter(r => r.reportsToId === pm.userId);
    return [
      ...(overdueByOwner.get(pm.userId) ?? []),
      ...pmZLs.flatMap(z => overdueByOwner.get(z.userId) ?? []),
      ...pmZLRPs.flatMap(r => overdueByOwner.get(r.userId) ?? []),
      ...pmDirectRPs.flatMap(r => overdueByOwner.get(r.userId) ?? []),
    ];
  }

  function togglePM(id: string) { setExpandedPMs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }); }
  function toggleZL(id: string) { setExpandedZLs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }); }

  function zlAllDelayed(zl: AdminPersonHealth): (RPPitstopDetail & { ownerName: string })[] {
    const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
    return [
      ...zl.delayedPitstops.map(p => ({ ...p, ownerName: zl.name ?? "Unnamed" })),
      ...zlRPs.flatMap(r => r.delayedPitstops.map(p => ({ ...p, ownerName: r.name ?? "Unnamed" }))),
    ];
  }

  function pmAllDelayed(pm: AdminPersonHealth): (RPPitstopDetail & { ownerName: string })[] {
    const pmZLs = zls.filter(z => z.reportsToId === pm.userId);
    const pmZLRPs = rps.filter(r => pmZLs.some(z => z.userId === r.reportsToId));
    const pmDirectRPs = rps.filter(r => r.reportsToId === pm.userId);
    return [
      ...pm.delayedPitstops.map(p => ({ ...p, ownerName: pm.name ?? "Unnamed" })),
      ...pmZLs.flatMap(z => z.delayedPitstops.map(p => ({ ...p, ownerName: z.name ?? "Unnamed" }))),
      ...pmZLRPs.flatMap(r => r.delayedPitstops.map(p => ({ ...p, ownerName: r.name ?? "Unnamed" }))),
      ...pmDirectRPs.flatMap(r => r.delayedPitstops.map(p => ({ ...p, ownerName: r.name ?? "Unnamed" }))),
    ];
  }

  function pmAgg(pm: AdminPersonHealth) {
    const pmZLs = zls.filter(z => z.reportsToId === pm.userId);
    const pmZLRPs = rps.filter(r => pmZLs.some(z => z.userId === r.reportsToId));
    const pmDirectRPs = rps.filter(r => r.reportsToId === pm.userId);
    const team = [...pmZLs, ...pmZLRPs, ...pmDirectRPs];
    return {
      zlCount: pmZLs.length,
      rpCount: pmZLRPs.length + pmDirectRPs.length,
      directRPCount: pmDirectRPs.length,
      delayed: pm.overduePitstops + team.reduce((s, m) => s + m.overduePitstops, 0),
      overdueActs: pm.overdueActivities + team.reduce((s, m) => s + m.overdueActivities, 0),
      clDone: pm.doneChecklists + team.reduce((s, m) => s + m.doneChecklists, 0),
      clTotal: pm.totalChecklists + team.reduce((s, m) => s + m.totalChecklists, 0),
    };
  }

  function zlAgg(zl: AdminPersonHealth) {
    const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
    return {
      rpCount: zlRPs.length,
      delayed: zl.overduePitstops + zlRPs.reduce((s, r) => s + r.overduePitstops, 0),
      overdueActs: zl.overdueActivities + zlRPs.reduce((s, r) => s + r.overdueActivities, 0),
      clDone: zl.doneChecklists + zlRPs.reduce((s, r) => s + r.doneChecklists, 0),
      clTotal: zl.totalChecklists + zlRPs.reduce((s, r) => s + r.totalChecklists, 0),
    };
  }

  // ZLs not under any PM in the health list
  const unmanagedZLs = zls.filter(z => !pms.some(pm => pm.userId === z.reportsToId));
  // RPs not under any ZL AND not directly under any PM in the health list
  // (RPs can report directly to a PM, skipping the ZL hop — Abdul → Shrinivas).
  const unmanagedRPs = rps.filter(
    r => !zls.some(z => z.userId === r.reportsToId)
      && !pms.some(pm => pm.userId === r.reportsToId),
  );

  function RPCard({ rp }: { rp: AdminPersonHealth }) {
    const isDelayedOpen = expandedDelayedRP === rp.userId;
    const isOverdueOpen = expandedOverdueRP === rp.userId;
    const dot = rp.overduePitstops > 0 ? "bg-red-500" : rp.overdueActivities > 0 ? "bg-amber-400" : "bg-emerald-500";
    const clPct = rp.totalChecklists > 0 ? Math.round(rp.doneChecklists / rp.totalChecklists * 100) : null;
    const rpActs = rpOverdueActs(rp);
    return (
      <div className="bg-white border border-stone-200 rounded-lg p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Avatar name={rp.name} image={rp.image} size="xs" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-stone-800 truncate">{rp.name}</p>
            {clPct !== null && <p className="text-[10px] text-stone-400">{rp.doneChecklists}/{rp.totalChecklists} · {clPct}%</p>}
          </div>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        </div>
        {rp.totalGoals > 0 && (
          <div className="mb-1.5">
            <HealthBar value={rp.completeGoals} total={rp.totalGoals} color="bg-emerald-500" />
            <p className="text-[10px] text-stone-400 mt-0.5">{rp.completeGoals}/{rp.totalGoals} goals</p>
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {rp.overduePitstops > 0 ? (
            <button type="button" onClick={() => setExpandedDelayedRP(isDelayedOpen ? null : rp.userId)}
              className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded hover:bg-red-100 flex items-center gap-0.5">
              {rp.overduePitstops} delayed {isDelayedOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
          ) : <span className="text-[10px] text-stone-300">0 delayed</span>}
          {rp.overdueActivities > 0 && (
            <button type="button" onClick={() => setExpandedOverdueRP(isOverdueOpen ? null : rp.userId)}
              className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded hover:bg-amber-100 flex items-center gap-0.5">
              {rp.overdueActivities} overdue {isOverdueOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
          )}
        </div>
        {isDelayedOpen && rp.delayedPitstops.length > 0 && (
          <div className="mt-2 space-y-1.5 border-t border-stone-100 pt-2">
            {(rp.delayedPitstops as RPPitstopDetail[]).map(p => (
              <PitstopDetailCard key={p.id} p={p} />
            ))}
          </div>
        )}
        {isOverdueOpen && rpActs.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-stone-100 pt-2">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Overdue Activities</p>
            {rpActs.map(a => <OverdueActivityCard key={a.id} a={a} showOwner={false} />)}
          </div>
        )}
      </div>
    );
  }

  if (personHealth.length === 0) {
    return <EmptyState message="No team members found." />;
  }

  return (
    <div className="space-y-3">
      {/* PM-level cards */}
      {pms.map(pm => {
        const agg = pmAgg(pm);
        const isOpen = expandedPMs.has(pm.userId);
        const pmZLs = zls.filter(z => z.reportsToId === pm.userId);
        const pmDirectRPs = rps.filter(r => r.reportsToId === pm.userId);
        const dot = agg.delayed > 0 ? "bg-red-500" : agg.overdueActs > 0 ? "bg-amber-400" : "bg-emerald-500";
        const clPct = agg.clTotal > 0 ? Math.round(agg.clDone / agg.clTotal * 100) : null;
        const pmDelayed = pmAllDelayed(pm);
        const isPMDelayedOpen = expandedDelayedPM === pm.userId;
        const pmActs = pmAllOverdueActs(pm);
        const isPMOverdueOpen = expandedOverduePM === pm.userId;
        return (
          <div key={pm.userId} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <Avatar name={pm.name} image={pm.image} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-800">{pm.name ?? "Unnamed"}</p>
                <p className="text-xs text-stone-400">{agg.zlCount} ZL{agg.zlCount !== 1 ? "s" : ""} · {agg.rpCount} RP{agg.rpCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {agg.delayed > 0 && (
                  <button type="button" onClick={() => setExpandedDelayedPM(isPMDelayedOpen ? null : pm.userId)}
                    className="text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded hover:bg-red-100 flex items-center gap-0.5">
                    {agg.delayed} delayed
                    {isPMDelayedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
                {agg.overdueActs > 0 && (
                  <button type="button" onClick={() => setExpandedOverduePM(isPMOverdueOpen ? null : pm.userId)}
                    className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded hover:bg-amber-100 flex items-center gap-0.5">
                    {agg.overdueActs} overdue
                    {isPMOverdueOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
                <span className={`w-2 h-2 rounded-full ${dot}`} />
              </div>
            </div>
            {isPMDelayedOpen && pmDelayed.length > 0 && (
              <div className="px-4 pb-3 pt-2 space-y-1.5 border-t border-red-50">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Delayed Pitstops</p>
                {pmDelayed.map(p => <PitstopDetailCard key={`${pm.userId}-${p.id}`} p={p} ownerName={p.ownerName} />)}
              </div>
            )}
            {isPMOverdueOpen && pmActs.length > 0 && (
              <div className="px-4 pb-3 pt-2 space-y-1 border-t border-amber-50">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Overdue Activities</p>
                {pmActs.map(a => <OverdueActivityCard key={`${pm.userId}-${a.id}`} a={a} showOwner />)}
              </div>
            )}
            {clPct !== null && (
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-stone-400 flex items-center gap-1"><CheckSquare className="w-3 h-3" /> Team checklist</span>
                  <span className="text-[10px] text-stone-400">{agg.clDone}/{agg.clTotal} · {clPct}%</span>
                </div>
                <HealthBar value={agg.clDone} total={agg.clTotal} color="bg-teal-500" />
              </div>
            )}
            {(pmZLs.length > 0 || pmDirectRPs.length > 0) && (
              <button type="button" onClick={() => togglePM(pm.userId)}
                className="w-full text-xs text-sky-700 bg-sky-50 border-t border-sky-100 px-4 py-2 flex items-center justify-center gap-1 hover:bg-sky-100 transition-colors">
                {isOpen ? "Hide" : "Show"} {[
                  pmZLs.length > 0 ? `${pmZLs.length} ZL${pmZLs.length !== 1 ? "s" : ""}` : null,
                  pmDirectRPs.length > 0 ? `${pmDirectRPs.length} direct RP${pmDirectRPs.length !== 1 ? "s" : ""}` : null,
                ].filter(Boolean).join(" · ")}
                {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
            {isOpen && (
              <div className="border-t border-stone-100 bg-stone-50 px-3 py-3 space-y-2">
                {pmDirectRPs.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Reports directly to PM</p>
                    {pmDirectRPs.map(rp => <RPCard key={rp.userId} rp={rp} />)}
                    {pmZLs.length > 0 && (
                      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide pt-1">Via Zone Leads</p>
                    )}
                  </>
                )}
                {pmZLs.map(zl => {
                  const zAgg = zlAgg(zl);
                  const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
                  const zlOpen = expandedZLs.has(zl.userId);
                  const zDot = zAgg.delayed > 0 ? "bg-red-500" : zAgg.overdueActs > 0 ? "bg-amber-400" : "bg-emerald-500";
                  const zClPct = zAgg.clTotal > 0 ? Math.round(zAgg.clDone / zAgg.clTotal * 100) : null;
                  const zlDelayed = zlAllDelayed(zl);
                  const isZLDelayedOpen = expandedDelayedZL === zl.userId;
                  const zlActs = zlAllOverdueActs(zl);
                  const isZLOverdueOpen = expandedOverdueZL === zl.userId;
                  return (
                    <div key={zl.userId} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <Avatar name={zl.name} image={zl.image} size="xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-stone-800">{zl.name ?? "Unnamed"}</p>
                          <p className="text-[10px] text-stone-400">
                            {zAgg.rpCount} RP{zAgg.rpCount !== 1 ? "s" : ""}
                            {zClPct !== null && <span> · {zClPct}% checklist</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {zAgg.delayed > 0 && (
                            <button type="button" onClick={() => setExpandedDelayedZL(isZLDelayedOpen ? null : zl.userId)}
                              className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-100 px-1 py-0.5 rounded hover:bg-red-100 flex items-center gap-0.5">
                              {zAgg.delayed} delayed
                              {isZLDelayedOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                            </button>
                          )}
                          {zAgg.overdueActs > 0 && (
                            <button type="button" onClick={() => setExpandedOverdueZL(isZLOverdueOpen ? null : zl.userId)}
                              className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1 py-0.5 rounded hover:bg-amber-100 flex items-center gap-0.5">
                              {zAgg.overdueActs} overdue
                              {isZLOverdueOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                            </button>
                          )}
                          <span className={`w-1.5 h-1.5 rounded-full ${zDot}`} />
                        </div>
                      </div>
                      {isZLDelayedOpen && zlDelayed.length > 0 && (
                        <div className="px-3 py-2 space-y-1.5 border-t border-red-50">
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Delayed Pitstops</p>
                          {zlDelayed.map(p => <PitstopDetailCard key={`${zl.userId}-${p.id}`} p={p} ownerName={p.ownerName} />)}
                        </div>
                      )}
                      {isZLOverdueOpen && zlActs.length > 0 && (
                        <div className="px-3 py-2 space-y-1 border-t border-amber-50">
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Overdue Activities</p>
                          {zlActs.map(a => <OverdueActivityCard key={`${zl.userId}-${a.id}`} a={a} showOwner />)}
                        </div>
                      )}
                      {zlRPs.length > 0 && (
                        <button type="button" onClick={() => toggleZL(zl.userId)}
                          className="w-full text-[10px] text-stone-500 bg-stone-50 border-t border-stone-100 px-3 py-1.5 flex items-center justify-center gap-1 hover:bg-stone-100 transition-colors">
                          {zlOpen ? "Hide" : "Show"} {zlRPs.length} RP{zlRPs.length !== 1 ? "s" : ""}
                          {zlOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                      {zlOpen && (
                        <div className="border-t border-stone-100 bg-stone-50 px-2 py-2 space-y-1.5">
                          {zlRPs.map(rp => <RPCard key={rp.userId} rp={rp} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ZLs not under any PM */}
      {unmanagedZLs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">ZLs (unassigned to PM)</p>
          <div className="space-y-2">
            {unmanagedZLs.map(zl => {
              const zAgg = zlAgg(zl);
              const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
              const zlOpen = expandedZLs.has(zl.userId);
              const dot = zAgg.delayed > 0 ? "bg-red-500" : zAgg.overdueActs > 0 ? "bg-amber-400" : "bg-emerald-500";
              const zlDelayed = zlAllDelayed(zl);
              const isZLDelayedOpen = expandedDelayedZL === zl.userId;
              const zlActs = zlAllOverdueActs(zl);
              const isZLOverdueOpen = expandedOverdueZL === zl.userId;
              return (
                <div key={zl.userId} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3">
                    <Avatar name={zl.name} image={zl.image} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800">{zl.name ?? "Unnamed"}</p>
                      <p className="text-xs text-stone-400">{zAgg.rpCount} RP{zAgg.rpCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {zAgg.delayed > 0 && (
                        <button type="button" onClick={() => setExpandedDelayedZL(isZLDelayedOpen ? null : zl.userId)}
                          className="text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded hover:bg-red-100 flex items-center gap-0.5">
                          {zAgg.delayed} delayed
                          {isZLDelayedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                      {zAgg.overdueActs > 0 && (
                        <button type="button" onClick={() => setExpandedOverdueZL(isZLOverdueOpen ? null : zl.userId)}
                          className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded hover:bg-amber-100 flex items-center gap-0.5">
                          {zAgg.overdueActs} overdue
                          {isZLOverdueOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                    </div>
                  </div>
                  {isZLDelayedOpen && zlDelayed.length > 0 && (
                    <div className="px-4 py-2 space-y-1.5 border-t border-red-50">
                      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Delayed Pitstops</p>
                      {zlDelayed.map(p => <PitstopDetailCard key={`${zl.userId}-${p.id}`} p={p} ownerName={p.ownerName} />)}
                    </div>
                  )}
                  {isZLOverdueOpen && zlActs.length > 0 && (
                    <div className="px-4 py-2 space-y-1 border-t border-amber-50">
                      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Overdue Activities</p>
                      {zlActs.map(a => <OverdueActivityCard key={`${zl.userId}-${a.id}`} a={a} showOwner />)}
                    </div>
                  )}
                  {zlRPs.length > 0 && (
                    <button type="button" onClick={() => toggleZL(zl.userId)}
                      className="w-full text-xs text-stone-500 bg-stone-50 border-t border-stone-100 px-4 py-2 flex items-center justify-center gap-1 hover:bg-stone-100">
                      {zlOpen ? "Hide" : "Show"} {zlRPs.length} RP{zlRPs.length !== 1 ? "s" : ""}
                      {zlOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                  {zlOpen && (
                    <div className="border-t border-stone-100 bg-stone-50 px-2 py-2 space-y-1.5">
                      {zlRPs.map(rp => <RPCard key={rp.userId} rp={rp} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* RPs not under any ZL */}
      {unmanagedRPs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">RPs (unassigned to ZL)</p>
          <div className="space-y-1.5">
            {unmanagedRPs.map(rp => <RPCard key={rp.userId} rp={rp} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// Inline row for the per-person overdue-activity drill-down. Matches the
// flat row used in AdminAttentionTab so the visual reads the same across
// surfaces. `showOwner` is off when the row sits under an RP card (the
// card itself already names the person) and on at PM/ZL levels where the
// row could belong to any of the team members aggregated under that pill.
function OverdueActivityCard({ a, showOwner }: { a: AdminOverdueActivity; showOwner: boolean }) {
  return (
    <div className="bg-white border border-amber-100 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
      <div className="flex-1 min-w-0">
        {a.goalId ? (
          <Link href={`/goals/${a.goalId}`} className="text-xs font-medium text-stone-800 hover:text-sky-700 truncate block">{a.title}</Link>
        ) : (
          <p className="text-xs font-medium text-stone-800 truncate">{a.title}</p>
        )}
        {a.goalTitle && <p className="text-[10px] text-stone-400 truncate">{a.goalTitle}</p>}
        {showOwner && a.ownerName && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-stone-500">{a.ownerName}</span>
            {a.ownerDesignation && (
              <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${DESIGNATION_COLOR[a.ownerDesignation] ?? "bg-stone-100 text-stone-500"}`}>
                {a.ownerDesignation}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="text-[10px] font-medium text-amber-700 flex-shrink-0">{fmtDateShort(a.scheduledAt)}</span>
    </div>
  );
}

// ── Admin: Engagement tab ────────────────────────────────────────────────────

const DESIGNATION_COLOR_ENG: Record<string, string> = {
  RP: "bg-violet-100 text-violet-700",
  ZL: "bg-sky-100 text-sky-700",
  PM: "bg-amber-100 text-amber-700",
};

