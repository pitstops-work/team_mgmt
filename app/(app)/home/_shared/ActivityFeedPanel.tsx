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

type ActivityFeedItem = {
  at: string;
  kind: string;
  summary: string;
  entityType: string;
  entityId: string;
  link?: string;
  detail?: { field?: string | null; oldValue?: string | null; newValue?: string | null };
};

const ACTIVITY_KIND_DOT: Record<string, string> = {
  goal_created: "bg-emerald-500", goal_updated: "bg-stone-400", goal_deleted: "bg-red-500",
  pitstop_created: "bg-emerald-500", pitstop_updated: "bg-stone-400", pitstop_deleted: "bg-red-500",
  pitstop_date_change: "bg-amber-500",
  activity_created: "bg-sky-500", activity_completed: "bg-emerald-500",
  activity_cancelled: "bg-red-400", activity_rescheduled: "bg-amber-500",
  activity_responded: "bg-sky-400", activity_updated: "bg-stone-400",
  checklist_created: "bg-sky-500", checklist_checked: "bg-emerald-500",
  checklist_status_change: "bg-amber-500", checklist_updated: "bg-stone-400",
  standup: "bg-violet-500", system: "bg-stone-300",
};

export function ActivityFeedPanel({ userId, date }: { userId: string; date: string }) {
  const [items, setItems] = useState<ActivityFeedItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/engagement/activity-feed?userId=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { items: ActivityFeedItem[] }) => { if (!cancelled) setItems(data.items); })
      .catch(e => { if (!cancelled) setError(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, date]);

  if (loading) return <p className="text-[11px] text-stone-400">Loading activity…</p>;
  if (error)   return <p className="text-[11px] text-red-500">Failed to load activity: {error}</p>;
  if (!items || items.length === 0) return <p className="text-[11px] text-stone-400">No activity on this date.</p>;

  return (
    <ol className="space-y-1.5">
      {items.map((it, i) => {
        const time = new Date(it.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
        const dot = ACTIVITY_KIND_DOT[it.kind] ?? "bg-stone-300";
        const body = (
          <>
            <span className="text-[10px] tabular-nums text-stone-400 w-10 shrink-0">{time}</span>
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dot}`} />
            <span className="text-xs text-stone-700">{it.summary}</span>
          </>
        );
        return (
          <li key={i} className="flex items-start gap-2">
            {it.link
              ? <Link href={it.link} className="flex items-start gap-2 hover:underline w-full">{body}</Link>
              : <div className="flex items-start gap-2">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// ── Admin: Pipeline tab ───────────────────────────────────────────────────────

