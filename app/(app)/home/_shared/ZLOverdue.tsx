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
import { SectionTitle } from "../_shared/Primitives";

export function ZLOverdueCard({
  a, onDone, isLoadingDone, isOverdue = true,
}: {
  a: ZLTeamActivity;
  onDone: (id: string) => void;
  isLoadingDone: boolean;
  isOverdue?: boolean;
}) {
  const goal = a.pitstops[0]?.pitstop.goal;
  const domainLabel = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
  const clusterName = goal?.needsCluster?.name ?? null;

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3 shadow-sm min-h-[160px] border ${
      isOverdue ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"
    }`}>
      {(domainLabel || clusterName) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {domainLabel && (
            <span className={`text-[11px] font-semibold bg-white px-2 py-0.5 rounded-full border ${
              isOverdue ? "text-amber-700 border-amber-200" : "text-violet-700 border-violet-200"
            }`}>
              {domainLabel}
            </span>
          )}
          {clusterName && (
            <span className="text-[11px] text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded-full">
              {clusterName}
            </span>
          )}
        </div>
      )}
      <div className="flex-1">
        <p className="text-base font-semibold text-stone-800 leading-snug mb-1">{a.title}</p>
        {goal?.title && (
          <p className="text-[11px] text-stone-400 mb-1.5 truncate">{goal.title}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {a.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>
              {a.type}
            </span>
          )}
          {isOverdue
            ? <span className="text-xs font-medium text-amber-700">{daysAgo(a.scheduledAt)}d overdue</span>
            : <span className="text-xs text-stone-400">{fmtTime(a.scheduledAt)}</span>
          }
          {a.location && <span className="text-xs text-stone-400 truncate">· {a.location}</span>}
        </div>
      </div>
      <button onClick={() => onDone(a.id)} disabled={isLoadingDone}
        className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors">
        {isLoadingDone ? "Updating…" : "Mark Done"}
      </button>
    </div>
  );
}

export function ZLOverdueCarousel({
  items, loadingDoneId, onDone,
}: {
  items: ZLTeamActivity[];
  loadingDoneId: string | null;
  onDone: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <SectionTitle>Your update needed</SectionTitle>
        </div>
        {items.length > 1 && (
          <span className="text-xs text-stone-400 tabular-nums">{currentIdx + 1} of {items.length}</span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget;
          setCurrentIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex overflow-x-auto snap-x snap-mandatory gap-3 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map(a => (
          <div key={a.id} className="snap-start flex-shrink-0 w-full">
            <ZLOverdueCard a={a} onDone={onDone} isLoadingDone={loadingDoneId === a.id} />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {items.map((_, i) => (
            <div key={i} className={`rounded-full transition-all ${i === currentIdx ? "w-4 h-1.5 bg-amber-400" : "w-1.5 h-1.5 bg-stone-300"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ZLTodayCarousel({
  items, loadingDoneId, onDone,
}: {
  items: ZLTeamActivity[];
  loadingDoneId: string | null;
  onDone: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Today</SectionTitle>
        {items.length > 1 && (
          <span className="text-xs text-stone-400 tabular-nums">{currentIdx + 1} of {items.length}</span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={e => setCurrentIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map(a => (
          <div key={a.id} className="snap-start flex-shrink-0 w-full">
            <ZLOverdueCard a={a} onDone={onDone} isLoadingDone={loadingDoneId === a.id} isOverdue={false} />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {items.map((_, i) => (
            <div key={i} className={`rounded-full transition-all ${i === currentIdx ? "w-4 h-1.5 bg-stone-400" : "w-1.5 h-1.5 bg-stone-300"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── ZL Today tab ─────────────────────────────────────────────────────────────

