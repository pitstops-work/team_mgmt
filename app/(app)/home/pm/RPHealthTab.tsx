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
import { EmptyState, SectionTitle, HealthBar } from "../_shared/Primitives";
import { RPHealthCards } from "../_shared/RPHealthCards";

type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };

export function PMRPHealthTab({
  zlMembers, rpMembers, rpHealth,
}: {
  zlMembers: PMTeamMember[];
  rpMembers: PMTeamMember[];
  rpHealth: RPHealthStat[];
}) {
  const [collapsedZLs, setCollapsedZLs] = useState<Set<string>>(new Set());

  if (rpMembers.length === 0) {
    return <div className="text-sm text-stone-400 text-center py-16">No RPs in your team yet.</div>;
  }

  function toggle(zlId: string) {
    setCollapsedZLs(prev => {
      const next = new Set(prev);
      next.has(zlId) ? next.delete(zlId) : next.add(zlId);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {zlMembers.map(zl => {
        const zlRPs = rpMembers.filter(r => r.reportsToId === zl.id);
        if (zlRPs.length === 0) return null;
        const isCollapsed = collapsedZLs.has(zl.id);

        return (
          <div key={zl.id}>
            <button
              type="button"
              onClick={() => toggle(zl.id)}
              className="flex items-center gap-2 w-full mb-2 cursor-pointer group"
            >
              <Avatar name={zl.name} image={zl.image} size="xs" />
              <span className="text-xs font-semibold text-stone-600 group-hover:text-stone-800 transition-colors">
                {zl.name ?? "Unnamed ZL"} · {zlRPs.length} RP{zlRPs.length !== 1 ? "s" : ""}
              </span>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-stone-400 ml-auto" /> : <ChevronUp className="w-3.5 h-3.5 text-stone-400 ml-auto" />}
            </button>

            {!isCollapsed && (
              <div className="space-y-3">
                <RPHealthCards
                  rpMembers={zlRPs}
                  rpHealth={rpHealth.filter(r => r.zlId === zl.id)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

