"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, Users } from "lucide-react";
import Avatar from "@/components/Avatar";
import type { Activity, TeamMember, ZLTeamActivity } from "../_lib/types";
import type { RPHealthStat } from "../page";
import { fmtDomain, daysAgo } from "../_lib/helpers";
import { ACTIVITY_TYPE_STYLE } from "../_lib/constants";
import { ActivityCard } from "../_shared/ActivityCard";
import { EmptyState } from "../_shared/Primitives";

/**
 * Per-reportee summary cards for the ZL Today supervisory cockpit.
 *
 * For each RP under the ZL we show:
 *  - avatar + name
 *  - overdue activity count (from the existing zlOverdueActivities feed)
 *  - delayed pitstop count (from rpTeamHealth)
 *  - reschedule-attention badge when any of the visible activities has
 *    rescheduleCount >= 2 — chronic slippage that the ZL should sweep
 *
 * Tap a row to expand inline → that RP's overdue activities render through
 * the same `ActivityCard` the RP uses, so the ZL can mark-done / reschedule
 * on behalf of the team (server-side RBAC decides whether the action is
 * actually permitted).
 *
 * Today-progress donut is intentionally deferred — today-per-RP counts
 * aren't on the wire yet. A small page-loader follow-up will add them.
 */
export function TeamTodayStripe({
  teamMembers,
  rpTeamHealth,
  teamOverdueActivities,
}: {
  teamMembers: TeamMember[];
  rpTeamHealth: RPHealthStat[];
  teamOverdueActivities: ZLTeamActivity[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [doneEventIds, setDoneEventIds] = useState<Set<string>>(new Set());

  if (teamMembers.length === 0) {
    return <EmptyState message="No reportees yet." />;
  }

  // Per-RP buckets, kept by id so the rows can lazy-render their activities.
  const healthById = new Map(rpTeamHealth.map(h => [h.rpId, h]));
  const overdueByRpId = new Map<string, ZLTeamActivity[]>();
  for (const a of teamOverdueActivities) {
    const ownerId = a.pitstops[0]?.pitstop.ownerId;
    if (!ownerId) continue;
    if (doneEventIds.has(a.id)) continue;
    if (!overdueByRpId.has(ownerId)) overdueByRpId.set(ownerId, []);
    overdueByRpId.get(ownerId)!.push(a);
  }

  // Sort: members with more attention surface to the top.
  const ordered = [...teamMembers].sort((a, b) => {
    const ha = healthById.get(a.id);
    const hb = healthById.get(b.id);
    const aScore = (ha?.overdueActivities ?? 0) + (ha?.overduePitstops ?? 0) * 2 + (overdueByRpId.get(a.id)?.length ?? 0);
    const bScore = (hb?.overdueActivities ?? 0) + (hb?.overduePitstops ?? 0) * 2 + (overdueByRpId.get(b.id)?.length ?? 0);
    return bScore - aScore;
  });

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function handleCompleted(eventId: string) {
    setDoneEventIds(prev => new Set(prev).add(eventId));
    router.refresh();
  }
  const onRescheduled = () => router.refresh();

  return (
    <div className="space-y-2">
      {ordered.map(rp => {
        const h = healthById.get(rp.id);
        const overdueActs = overdueByRpId.get(rp.id) ?? [];
        const overdueCount = overdueActs.length;
        const delayedPitstops = h?.overduePitstops ?? 0;
        const todayDone  = h?.todayDone  ?? 0;
        const todayTotal = h?.todayTotal ?? 0;
        // "Chronic slippage" sweep — any activity in the RP's overdue list
        // has been rescheduled twice or more.
        const chronicCount = overdueActs.filter(a => (a as ZLTeamActivity & { rescheduleCount?: number }).rescheduleCount && (a as ZLTeamActivity & { rescheduleCount?: number }).rescheduleCount! >= 2).length;
        const isOpen = expanded.has(rp.id);
        const isClean = overdueCount === 0 && delayedPitstops === 0;

        return (
          <div key={rp.id} className={`rounded-xl border bg-white transition-colors ${isClean ? "border-stone-200" : "border-amber-200 bg-amber-50/30"}`}>
            <button
              onClick={() => toggle(rp.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50/50"
              aria-expanded={isOpen}
            >
              <Avatar name={rp.name} image={rp.image} size="sm" />
              <TodayDonut done={todayDone} total={todayTotal} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{rp.name ?? "Unknown"}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {isClean ? (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                      On track
                    </span>
                  ) : (
                    <>
                      {overdueCount > 0 && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {overdueCount} overdue
                        </span>
                      )}
                      {delayedPitstops > 0 && (
                        <span className="text-[10px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-medium">
                          {delayedPitstops} delayed pitstops
                        </span>
                      )}
                      {chronicCount > 0 && (
                        <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded font-medium">
                          {chronicCount} chronic
                        </span>
                      )}
                    </>
                  )}
                  {rp.rpClusters && rp.rpClusters.length > 0 && (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1">
                      <Users className="w-2.5 h-2.5" />
                      {rp.rpClusters.map(c => c.name).join(" · ")}
                    </span>
                  )}
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-stone-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />}
            </button>

            {isOpen && (
              <div className="px-3 pb-3 pt-1 border-t border-stone-100 space-y-1.5">
                {overdueActs.length === 0 ? (
                  <p className="text-xs text-stone-400 italic py-1">No overdue activities in the current window.</p>
                ) : (
                  overdueActs.map(a => (
                    <ActivityCard
                      key={a.id}
                      activity={toActivity(a)}
                      onCompleted={handleCompleted}
                      onRescheduled={onRescheduled}
                      isOverdue
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ZLTeamActivity → Activity adapter (duplicated here from TodayTab to keep
// TeamTodayStripe self-contained — same shape, will land in _shared/ once
// the ZL cockpit settles).
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
        id: "",
        title: "",
        ownerId: ps.ownerId,
        goal: ps.goal as Activity["pitstops"] extends (infer P)[] ? P extends { pitstop: { goal: infer G } } ? G : never : never,
      },
    }] : [],
    rescheduleCount: (a as ZLTeamActivity & { rescheduleCount?: number }).rescheduleCount,
  };
}

/**
 * Compact "X / Y" progress donut for the per-reportee Team-today row. Empty
 * (total === 0) renders a muted ring so the column stays aligned without
 * implying anything ominous about an RP who simply has no work scheduled
 * today.
 */
function TodayDonut({ done, total }: { done: number; total: number }) {
  const SIZE = 36;
  const STROKE = 4;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const dash = `${C * pct} ${C}`;
  const allDone = total > 0 && done === total;
  const empty = total === 0;
  return (
    <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }} aria-label={`Today ${done} of ${total}`}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke={empty ? "#e7e5e4" : "#f5f5f4"}
          strokeWidth={STROKE} fill="none"
        />
        {!empty && (
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            stroke={allDone ? "#10b981" : "#0ea5e9"}
            strokeWidth={STROKE} fill="none"
            strokeDasharray={dash}
            strokeLinecap="round"
            className="transition-all"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {empty ? (
          <span className="text-[9px] text-stone-300 tabular-nums">—</span>
        ) : (
          <span className={`text-[10px] tabular-nums font-semibold ${allDone ? "text-emerald-700" : "text-stone-700"}`}>
            {done}/{total}
          </span>
        )}
      </div>
    </div>
  );
}
