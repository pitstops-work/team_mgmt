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

export function WeekCard({ title, type, scheduledAt, location, goalTitle, domain, geo, role }: {
  title: string; type: string; scheduledAt: string; location?: string | null;
  goalTitle?: string | null; domain?: string | null; geo?: string | null;
  role?: "Owner" | "Attendee" | null;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-stone-200 bg-white">
      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
        <p className="text-sm font-medium text-stone-700 truncate">{title}</p>
        {type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[type] ?? "bg-stone-100 text-stone-600"}`}>{type}</span>}
        {role === "Owner" && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
        {role === "Attendee" && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
      </div>
      <p className="text-xs text-stone-400">
        {fmtTime(scheduledAt)}{location ? ` · ${location}` : ""}
      </p>
      {(goalTitle || domain || geo) && (
        <p className="text-[11px] text-stone-400 mt-0.5 truncate">
          {[goalTitle, domain, geo].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-stone-400 py-4 px-1">{message}</p>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">{children}</h3>
  );
}

export function KpiTile({ label, value, sub, accent, href, onClick }: { label: string; value: number | string; sub?: string; accent?: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-stone-800"}`}>{value}</p>
      {sub && <p className="text-[11px] text-stone-400 mt-0.5">{sub}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="bg-white rounded-xl border border-stone-200 px-4 py-3.5 block hover:border-sky-200 hover:bg-sky-50/30 transition-colors">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button onClick={onClick} className="bg-white rounded-xl border border-stone-200 px-4 py-3.5 text-left w-full hover:border-sky-200 hover:bg-sky-50/30 transition-colors">
        {inner}
      </button>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-stone-200 px-4 py-3.5">
      {inner}
    </div>
  );
}

export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function HealthBar({ value, total, color = "bg-sky-500" }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-stone-500 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

