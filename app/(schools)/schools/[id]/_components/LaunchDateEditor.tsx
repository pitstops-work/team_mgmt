"use client";

import { useState, useTransition } from "react";
import { setPlanLaunchDate } from "../../actions";
import { currentWeek, weekLabel } from "@/lib/seeding/weeks";

export default function LaunchDateEditor({
  planId,
  launchDate,
  canEdit,
}: {
  planId: string;
  launchDate: string | null;   // ISO
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const asDate = launchDate ? new Date(launchDate) : null;
  const label = asDate ? weekLabel(asDate, currentWeek(asDate)) : null;

  const commit = (iso: string | null) => {
    setError(null);
    startTransition(async () => {
      try {
        // Cascades dueDate on every step + substep with dueWeek set.
        await setPlanLaunchDate(planId, iso);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-stone-500">Launch date</span>
      {canEdit ? (
        <input
          type="date"
          className="rounded-lg border border-stone-300 px-2 py-1 text-stone-800"
          defaultValue={asDate ? asDate.toISOString().slice(0, 10) : ""}
          onBlur={(e) => commit(e.target.value || null)}
          disabled={pending}
          title="Setting this enables the week model. Shifting it cascades dueDate on all week-scheduled rows."
        />
      ) : (
        <span className="text-stone-700">
          {asDate ? asDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—"}
        </span>
      )}
      {label && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">{label}</span>
      )}
      {error && <span className="text-rose-700">· {error}</span>}
    </div>
  );
}
