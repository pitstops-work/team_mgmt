"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Users } from "lucide-react";
import Avatar from "@/components/Avatar";
import type { Activity, TeamMember, ZLTeamActivity } from "../_lib/types";
import type { RPHealthStat } from "../page";
import { ActivityCard } from "../_shared/ActivityCard";
import { EmptyState } from "../_shared/Primitives";
import { useSessionDoneIds } from "../_shared/useSessionDoneIds";

type OverdueItem = {
  entity: "goal" | "pitstop" | "checklist" | "activity";
  id: string;
  title: string;
  userId: string;
  userName: string | null;
  designation: string;
  domain: string | null;
  clusterId: string | null;
  clusterName: string | null;
  pitstopId: string | null;
  goalId: string;
  dueAt: string;
  daysOverdue: number;
};

type ViewMode = "activities" | "pitstops";

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
 * Tap a row (or a count badge) to expand inline. Each badge is its own
 * clickable target with a focused drill-down:
 *   • "X overdue"          → overdue activities (from props)
 *   • "X delayed pitstops" → delayed pitstops (lazy-fetched from /api/team-overdue,
 *                            filtered by userId on the client)
 *   • "X chronic"          → activities filter, scrolled to chronic items first
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
  // expandedView holds { rpId → "activities" | "pitstops" }; absence = collapsed.
  // Tracked as a single Map so badge clicks can both open and switch view.
  const [expandedView, setExpandedView] = useState<Map<string, ViewMode>>(new Map());
  const { ids: doneEventIds, add: addDoneEventId } = useSessionDoneIds("zl-team-done-events");

  // Lazy-loaded delayed pitstops, keyed nothing (one fetch covers all RPs).
  // First time any "delayed pitstops" badge is clicked we hit /api/team-overdue,
  // then partition by userId. Same endpoint TeamOverduePanel uses below; the
  // double-fetch is acceptable and saves prop plumbing.
  const [delayedPitstopsByRp, setDelayedPitstopsByRp] = useState<Map<string, OverdueItem[]> | null>(null);
  const [loadingDelayed, setLoadingDelayed] = useState(false);
  const [delayedErr, setDelayedErr] = useState<string | null>(null);

  async function ensureDelayedPitstops() {
    if (delayedPitstopsByRp || loadingDelayed) return;
    setLoadingDelayed(true);
    setDelayedErr(null);
    try {
      const res = await fetch("/api/team-overdue");
      if (!res.ok) throw new Error("Couldn't load delayed pitstops");
      const data = (await res.json()) as { items: OverdueItem[] };
      const byRp = new Map<string, OverdueItem[]>();
      for (const it of data.items) {
        if (it.entity !== "pitstop") continue;
        if (!byRp.has(it.userId)) byRp.set(it.userId, []);
        byRp.get(it.userId)!.push(it);
      }
      // Sort each RP's bucket by daysOverdue desc — most slipped first.
      for (const arr of byRp.values()) arr.sort((a, b) => b.daysOverdue - a.daysOverdue);
      setDelayedPitstopsByRp(byRp);
    } catch (e) {
      setDelayedErr(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoadingDelayed(false);
    }
  }

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

  function setView(rpId: string, view: ViewMode | null) {
    setExpandedView(prev => {
      const next = new Map(prev);
      if (view === null) next.delete(rpId);
      else next.set(rpId, view);
      return next;
    });
    if (view === "pitstops") ensureDelayedPitstops();
  }

  // Row click (anywhere except a badge) toggles the row — defaults to activities
  // view if there are overdue activities, else pitstops, else just expand empty.
  function toggleRow(rpId: string, defaultView: ViewMode) {
    const current = expandedView.get(rpId);
    if (current) setView(rpId, null);
    else setView(rpId, defaultView);
  }

  function handleCompleted(eventId: string) {
    addDoneEventId(eventId);
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
        const view = expandedView.get(rp.id) ?? null;
        const isOpen = view !== null;
        const isClean = overdueCount === 0 && delayedPitstops === 0;
        // Default view when row is clicked: prefer whichever bucket has items.
        const defaultView: ViewMode = overdueCount > 0 ? "activities" : "pitstops";

        return (
          <div key={rp.id} className={`rounded-xl border bg-white transition-colors ${isClean ? "border-stone-200" : "border-amber-200 bg-amber-50/30"}`}>
            <div
              onClick={() => toggleRow(rp.id, defaultView)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50/50 cursor-pointer"
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRow(rp.id, defaultView); } }}
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
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setView(rp.id, view === "activities" ? null : "activities"); }}
                          className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium border transition-colors ${
                            view === "activities"
                              ? "bg-amber-200 border-amber-300 text-amber-900"
                              : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                          }`}
                          aria-label={`Show ${overdueCount} overdue activities for ${rp.name ?? "this RP"}`}
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {overdueCount} overdue
                        </button>
                      )}
                      {delayedPitstops > 0 && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setView(rp.id, view === "pitstops" ? null : "pitstops"); }}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium border transition-colors ${
                            view === "pitstops"
                              ? "bg-red-200 border-red-300 text-red-900"
                              : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                          }`}
                          aria-label={`Show ${delayedPitstops} delayed pitstops for ${rp.name ?? "this RP"}`}
                        >
                          {delayedPitstops} delayed pitstops
                        </button>
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
            </div>

            {isOpen && (
              <div className="px-3 pb-3 pt-1 border-t border-stone-100">
                {/* In-panel tab toggle so the ZL can switch buckets without
                    collapsing first. Each tab is hidden if its bucket is empty
                    (avoids a tab leading nowhere). */}
                {(overdueCount > 0 && delayedPitstops > 0) && (
                  <div className="flex items-center gap-1 mb-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setView(rp.id, "activities")}
                      className={`text-[11px] px-2 py-1 rounded ${view === "activities" ? "bg-amber-100 text-amber-800 font-semibold" : "text-stone-500 hover:bg-stone-50"}`}
                    >
                      Overdue activities ({overdueCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setView(rp.id, "pitstops")}
                      className={`text-[11px] px-2 py-1 rounded ${view === "pitstops" ? "bg-red-100 text-red-800 font-semibold" : "text-stone-500 hover:bg-stone-50"}`}
                    >
                      Delayed pitstops ({delayedPitstops})
                    </button>
                  </div>
                )}

                {view === "activities" && (
                  <div className="space-y-1.5">
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

                {view === "pitstops" && (
                  <DelayedPitstopList
                    items={delayedPitstopsByRp?.get(rp.id) ?? null}
                    loading={loadingDelayed && !delayedPitstopsByRp}
                    error={delayedErr}
                    expectedCount={delayedPitstops}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Inline list of an RP's delayed pitstops. The data is lazy-fetched via
 * /api/team-overdue (entity="pitstop") and partitioned by userId in the
 * parent — this component just renders.
 */
function DelayedPitstopList({
  items, loading, error, expectedCount,
}: {
  items: OverdueItem[] | null;
  loading: boolean;
  error: string | null;
  expectedCount: number;
}) {
  if (loading) {
    return (
      <p className="text-xs text-stone-400 italic py-2 flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading delayed pitstops…
      </p>
    );
  }
  if (error) {
    return <p className="text-xs text-red-600 py-2">{error}</p>;
  }
  if (items === null) {
    return <p className="text-xs text-stone-400 italic py-1">Loading…</p>;
  }
  if (items.length === 0) {
    // Health stat said there were N, but the team-overdue feed disagrees —
    // usually because RBAC scoping differs slightly. Show a soft hint rather
    // than an empty state.
    return (
      <p className="text-xs text-stone-400 italic py-1">
        {expectedCount > 0
          ? `${expectedCount} delayed pitstop${expectedCount === 1 ? "" : "s"} reported, but not visible in your team-overdue scope.`
          : "No delayed pitstops."}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {items.map(it => (
        <Link
          key={it.id}
          href={`/goals/${it.goalId}/pitstops/${it.pitstopId ?? it.id}`}
          className="block rounded-lg border border-red-200 bg-red-50/60 hover:bg-red-50 px-3 py-2 transition-colors"
        >
          <p className="text-xs font-semibold text-red-900 truncate">{it.title}</p>
          <p className="text-[11px] text-red-700/80 mt-0.5">
            {it.daysOverdue}d overdue
            {it.clusterName && <> · {it.clusterName}</>}
            {it.domain && <> · {it.domain.replace(/_/g, " ")}</>}
          </p>
        </Link>
      ))}
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
