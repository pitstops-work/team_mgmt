"use client";

/**
 * HomeTodayAPSection — surfaces open action points on Home for any role tab.
 * Three sub-buckets: Overdue / Today / This week (next 6d after today). RP gets
 * their own; ZL/PM/Leader get team-scoped (which expands to the reportsToId
 * tree — covers cluster RPs).
 *
 *   <HomeTodayAPSection scope="mine" currentUserId={…} />
 *   <HomeTodayAPSection scope="team" currentUserId={…} />
 *
 * "This week" was added in v1.1 — without it, APs created via close-out (which
 * defaults due to +7d) sat invisible on Today and only showed in the Follow-ups
 * tab. The three buckets here mirror the open-half of the Follow-ups tab so
 * Today gives the RP a complete short-term picture without leaving the cockpit.
 *
 * Loading is lazy (parallel GETs on mount). Done / Reopen / Cancel / Edit
 * happen in place via ActionPointCard; the section refetches on each change.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ListChecks, CalendarRange } from "lucide-react";
import { ActionPointCard } from "./ActionPointCard";
import { MarkAPDoneModal } from "./MarkAPDoneModal";
import { EditAPModal } from "./EditAPModal";
import type { ActionPoint } from "./types";

export function HomeTodayAPSection({
  scope,
  currentUserId,
}: {
  scope: "mine" | "team";
  currentUserId: string;
}) {
  const [overdue, setOverdue] = useState<ActionPoint[] | null>(null);
  const [today, setToday]     = useState<ActionPoint[] | null>(null);
  const [week, setWeek]       = useState<ActionPoint[] | null>(null);
  const [doneTarget, setDoneTarget] = useState<ActionPoint | null>(null);
  const [editTarget, setEditTarget] = useState<ActionPoint | null>(null);

  async function load() {
    // The API's `week` bucket is open ∧ dueDate ∈ [today, today+6d], which
    // *includes* today's items. Filter today's ids out of the week list at
    // render time so a same-day AP doesn't show twice.
    const [oRes, tRes, wRes] = await Promise.all([
      fetch(`/api/action-points?scope=${scope}&bucket=overdue`),
      fetch(`/api/action-points?scope=${scope}&bucket=today`),
      fetch(`/api/action-points?scope=${scope}&bucket=week`),
    ]);
    setOverdue(oRes.ok ? await oRes.json() : []);
    setToday(tRes.ok ? await tRes.json() : []);
    setWeek(wRes.ok ? await wRes.json() : []);
  }

  useEffect(() => { load(); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a state change, refetch — bucket membership shifts (today → done,
  // edit may move dueDate across the today/week boundary) and the cheap GETs
  // keep all three lists consistent without locally re-bucketing.
  function refresh() { load(); }

  const overdueCount = overdue?.length ?? 0;
  const todayCount   = today?.length ?? 0;
  // Strip today's items out of the week response so each AP shows once. The
  // API returns them in dueDate-asc order, so today's ids cluster at the front.
  const todayIds = new Set((today ?? []).map(t => t.id));
  const weekOnly = (week ?? []).filter(ap => !todayIds.has(ap.id));
  const weekCount = weekOnly.length;

  // Render nothing until all lists arrive, and nothing if all are empty — we
  // don't want to add an empty section onto an already-busy Today screen.
  if (overdue === null || today === null || week === null) return null;
  if (overdueCount === 0 && todayCount === 0 && weekCount === 0) return null;

  return (
    <section className="space-y-3">
      {overdueCount > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Overdue follow-ups ({overdueCount})
            </h3>
            {/* Full queue lives on the sibling Follow-ups tab. */}
          </div>
          <div className="space-y-1.5">
            {overdue.map(ap => (
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
        </div>
      )}

      {todayCount > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-stone-400" />
              Follow-ups due today ({todayCount})
            </h3>
          </div>
          <div className="space-y-1.5">
            {today.map(ap => (
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
        </div>
      )}

      {weekCount > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5 text-stone-400" />
              Follow-ups this week ({weekCount})
            </h3>
          </div>
          <div className="space-y-1.5">
            {weekOnly.map(ap => (
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
        </div>
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
    </section>
  );
}
