"use client";

/**
 * FollowUpsTab — Home's dedicated AP queue view. Four buckets:
 *   Overdue / Today / This week / Done (last 30d)
 *
 * Scope: RPs see their own; ZL/PM/Leader see team-scoped (via the
 * action_point.list TEAM rule on the API). The dispatch component (HomeView)
 * picks the scope based on designation and passes it in.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarRange, CalendarPlus, CheckCircle2, RefreshCw } from "lucide-react";
import { ActionPointCard } from "@/components/action-points/ActionPointCard";
import { MarkAPDoneModal } from "@/components/action-points/MarkAPDoneModal";
import { EditAPModal } from "@/components/action-points/EditAPModal";
import type { ActionPoint } from "@/components/action-points/types";
import { EmptyState, SectionTitle } from "./Primitives";

type Bucket = "overdue" | "today" | "week" | "later" | "done";
const ORDER: Bucket[] = ["overdue", "today", "week", "later", "done"];

const BUCKET_META: Record<Bucket, { label: string; icon: typeof AlertTriangle; tone: string }> = {
  overdue: { label: "Overdue",       icon: AlertTriangle, tone: "text-red-700" },
  today:   { label: "Today",         icon: CalendarClock, tone: "text-amber-700" },
  week:    { label: "This week",     icon: CalendarRange, tone: "text-stone-700" },
  later:   { label: "Later",         icon: CalendarPlus,  tone: "text-stone-500" },
  done:    { label: "Done (last 30d)", icon: CheckCircle2, tone: "text-emerald-700" },
};

export function FollowUpsTab({
  scope, currentUserId,
}: {
  scope: "mine" | "team";
  currentUserId: string;
}) {
  const [data, setData] = useState<Record<Bucket, ActionPoint[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [doneTarget, setDoneTarget] = useState<ActionPoint | null>(null);
  const [editTarget, setEditTarget] = useState<ActionPoint | null>(null);

  async function load() {
    setLoading(true);
    const results = await Promise.all(ORDER.map(b =>
      fetch(`/api/action-points?scope=${scope}&bucket=${b}`).then(r => r.ok ? r.json() : [])
    ));
    setData({ overdue: results[0], today: results[1], week: results[2], later: results[3], done: results[4] });
    setLoading(false);
  }

  useEffect(() => { load(); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a per-card state change, refetch — re-bucketing locally is brittle
  // (week vs done involves date math we'd otherwise duplicate).
  function refresh() { load(); }

  const totalOpen = data ? data.overdue.length + data.today.length + data.week.length + data.later.length : 0;
  const totalDone = data?.done.length ?? 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-800">Follow-ups</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            {scope === "mine" ? "Action points you raised on past visits." : "Action points across your team."}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {data === null ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : totalOpen + totalDone === 0 ? (
        <EmptyState message={scope === "mine" ? "No follow-ups raised yet. They'll appear here once you add them during activity close-out." : "No team follow-ups."} />
      ) : (
        ORDER.map(b => {
          const items = data[b];
          if (items.length === 0) return null;
          const meta = BUCKET_META[b];
          const Icon = meta.icon;
          return (
            <section key={b}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className={`w-3.5 h-3.5 ${meta.tone}`} />
                <SectionTitle>{meta.label} ({items.length})</SectionTitle>
              </div>
              <div className="space-y-1.5">
                {items.map(ap => (
                  <ActionPointCard
                    key={ap.id}
                    ap={ap}
                    currentUserId={currentUserId}
                    onChanged={refresh}
                    onOpenComplete={setDoneTarget}
                    onOpenEdit={setEditTarget}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {doneTarget && (
        <MarkAPDoneModal
          ap={doneTarget}
          onClose={() => setDoneTarget(null)}
          onDone={() => { setDoneTarget(null); refresh(); }}
        />
      )}
      {editTarget && (
        <EditAPModal
          ap={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}
