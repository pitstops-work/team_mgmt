"use client";

/**
 * HomeTodayAPSection — surfaces today + overdue action points on Home for any
 * role tab. RP gets their own; ZL/PM/Leader get team-scoped (which expands to
 * the reportsToId tree — covers the cluster RPs).
 *
 *   <HomeTodayAPSection scope="mine" currentUserId={…} />
 *   <HomeTodayAPSection scope="team" currentUserId={…} />
 *
 * Two cards per AP (overdue + today are visually distinct). Loading is lazy
 * (single GET on mount). Done / Reopen / Cancel / Edit happen in place via
 * ActionPointCard; the section refetches once when the modal closes.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
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
  const [doneTarget, setDoneTarget] = useState<ActionPoint | null>(null);
  const [editTarget, setEditTarget] = useState<ActionPoint | null>(null);

  async function load() {
    const [oRes, tRes] = await Promise.all([
      fetch(`/api/action-points?scope=${scope}&bucket=overdue`),
      fetch(`/api/action-points?scope=${scope}&bucket=today`),
    ]);
    setOverdue(oRes.ok ? await oRes.json() : []);
    setToday(tRes.ok ? await tRes.json() : []);
  }

  useEffect(() => { load(); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchInPlace(next: ActionPoint) {
    // After a state change, just refetch — bucket membership shifts (today → done)
    // and the cheap GETs keep both lists consistent without locally re-bucketing.
    load();
  }

  const overdueCount = overdue?.length ?? 0;
  const todayCount   = today?.length ?? 0;

  // Render nothing until both lists arrive, and nothing if both are empty —
  // we don't want to add an "empty" section onto an already-busy Today screen.
  if (overdue === null || today === null) return null;
  if (overdueCount === 0 && todayCount === 0) return null;

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
                onChanged={patchInPlace}
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
                onChanged={patchInPlace}
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
          onDone={(next) => { setDoneTarget(null); patchInPlace(next); }}
        />
      )}
      {editTarget && (
        <EditAPModal
          ap={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(next) => { setEditTarget(null); patchInPlace(next); }}
        />
      )}
    </section>
  );
}
