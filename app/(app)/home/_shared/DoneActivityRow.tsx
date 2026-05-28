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

export function DoneActivityRow({ a, userId }: { a: Activity; userId: string }) {
  const ps = a.pitstops?.[0]?.pitstop;
  const goal = ps?.goal;
  const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
  const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
  const isOwner = ps?.ownerId === userId;
  const isAttendee = !isOwner && (a.attendees?.some(at => at.user.id === userId) ?? false);
  return (
    <div className="px-3 py-2 rounded-xl border border-stone-100 bg-white">
      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
        <p className="text-sm font-medium text-stone-700 truncate">{a.title}</p>
        {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
        {(isOwner || isAttendee) && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${isOwner ? "bg-violet-50 text-violet-600" : "bg-stone-100 text-stone-500"}`}>
            {isOwner ? "Owner" : "Attendee"}
          </span>
        )}
      </div>
      <p className="text-xs text-stone-400">
        {fmtDate(a.scheduledAt)} · {fmtTime(a.scheduledAt)}
        {a.location ? ` · ${a.location}` : ""}
      </p>
      {(goal?.title || domain || geo) && (
        <p className="text-[11px] text-stone-400 mt-0.5 truncate">
          {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

// RP Today — playing-card deck: one full-bleed card per assigned cluster.
// Top half is the cluster's minimap (settlement boundaries + facility pins);
// bottom half is the four sections (overdue / today / checklists / week) with
// Today open by default. Tapping a settlement or facility on the map filters
// the sections to that scope. Falls back to ClusterTodayView when the RP has
// no assigned clusters with geometry.
