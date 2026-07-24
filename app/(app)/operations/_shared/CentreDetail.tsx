"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flag } from "lucide-react";
import type { Activity, ChecklistItem } from "@/app/(app)/home/_lib/types";
import type { CentreFollowUp } from "@/lib/operations/today";
import { isToday, fmtTime, fmtDate, daysAgo } from "@/app/(app)/home/_lib/helpers";
import { ActivityCard } from "@/app/(app)/home/_shared/ActivityCard";
import { useSessionDoneIds } from "@/app/(app)/home/_shared/useSessionDoneIds";

/**
 * One centre's work: its activities (this visit's checklist tasks) grouped
 * Today / Overdue / Upcoming, plus open follow-ups. Completion reuses
 * ActivityCard so it writes to the spine. Read-only in admin "view as".
 */
export function CentreDetail({
  activities,
  checklists,
  followUps,
  readOnly = false,
  storageKey,
}: {
  activities: Activity[];
  checklists: ChecklistItem[];
  followUps: CentreFollowUp[];
  readOnly?: boolean;
  storageKey: string;
}) {
  const router = useRouter();
  const { ids: doneIds, add: addDone } = useSessionDoneIds(storageKey);

  const checklistMap = useMemo(() => {
    const m = new Map<string, ChecklistItem>();
    for (const ci of checklists) for (const a of ci.activities) m.set(a.id, ci);
    return m;
  }, [checklists]);

  const buckets = useMemo(() => {
    const pending = (a: Activity) => a.status !== "Done" && !doneIds.has(a.id);
    const overdue: Activity[] = [];
    const todayList: Activity[] = [];
    const upcoming: Activity[] = [];
    for (const a of activities) {
      const done = a.status === "Done" || doneIds.has(a.id);
      if (isToday(a.scheduledAt)) todayList.push(a);
      else if (!done && new Date(a.scheduledAt) < startOfToday()) overdue.push(a);
      else if (pending(a)) upcoming.push(a);
    }
    const byTime = (x: Activity, y: Activity) => new Date(x.scheduledAt).getTime() - new Date(y.scheduledAt).getTime();
    return { overdue: overdue.sort(byTime), today: todayList.sort(byTime), upcoming: upcoming.sort(byTime) };
  }, [activities, doneIds]);

  const handleCompleted = (eventId: string) => { addDone(eventId); router.refresh(); };

  const renderRow = (a: Activity, overdue = false) =>
    readOnly ? (
      <ReadOnlyRow key={a.id} activity={a} overdue={overdue} />
    ) : (
      <ActivityCard
        key={a.id}
        activity={a}
        linkedChecklist={checklistMap.get(a.id) ?? null}
        onCompleted={handleCompleted}
        onRescheduled={() => router.refresh()}
        isOverdue={overdue}
      />
    );

  const nothing = buckets.overdue.length + buckets.today.length + buckets.upcoming.length === 0;

  return (
    <div className="space-y-6">
      {buckets.today.length > 0 && (
        <Section title="Today">
          {buckets.today.map((a) => renderRow(a, false))}
        </Section>
      )}
      {buckets.overdue.length > 0 && (
        <Section title={`Overdue (${buckets.overdue.length})`} tone="amber">
          {buckets.overdue.map((a) => renderRow(a, true))}
        </Section>
      )}
      {buckets.upcoming.length > 0 && (
        <Section title="Upcoming">
          {buckets.upcoming.map((a) => renderRow(a, false))}
        </Section>
      )}

      {nothing && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
          <p className="text-sm font-medium text-emerald-800 mt-1.5">No activities due here.</p>
        </div>
      )}

      {followUps.length > 0 && (
        <Section title={`Follow-ups (${followUps.length})`}>
          {followUps.map((f) => (
            <div key={f.id} className="flex items-start gap-2.5 rounded-lg border border-stone-200 bg-white px-4 py-2.5">
              <Flag className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${f.priority === "urgent" ? "text-red-500" : "text-stone-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-800">{f.title}</p>
                {f.detail && <p className="text-[11px] text-stone-500 mt-0.5">{f.detail}</p>}
              </div>
              {f.dueDate && <span className="text-[11px] text-stone-400 flex-shrink-0">{fmtDate(f.dueDate)}</span>}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

function Section({ title, tone = "stone", children }: { title: string; tone?: "stone" | "amber"; children: React.ReactNode }) {
  return (
    <section>
      <h3 className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${tone === "amber" ? "text-amber-700" : "text-stone-500"}`}>
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

/** Non-interactive row for admin "view as" preview. */
function ReadOnlyRow({ activity, overdue }: { activity: Activity; overdue: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${overdue ? "border-amber-200 bg-amber-50/50" : "border-stone-200 bg-white"}`}>
      <div className="flex-shrink-0 w-12 text-right">
        {overdue
          ? <span className="text-[10px] font-semibold text-amber-700">{daysAgo(activity.scheduledAt)}d</span>
          : <span className="text-[11px] font-medium text-stone-500 tabular-nums">{fmtTime(activity.scheduledAt)}</span>}
      </div>
      <p className="flex-1 min-w-0 text-sm text-stone-700 truncate">{activity.title}</p>
    </div>
  );
}
