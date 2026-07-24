"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapPin, CheckCircle2 } from "lucide-react";
import type { Activity, ChecklistItem } from "@/app/(app)/home/_lib/types";
import { fmtDomain, isToday, fmtTime, daysAgo } from "@/app/(app)/home/_lib/helpers";
import { ActivityCard } from "@/app/(app)/home/_shared/ActivityCard";
import { useSessionDoneIds } from "@/app/(app)/home/_shared/useSessionDoneIds";

/**
 * The Swiggy-style "do this now" driver. One clear next action up top, then the
 * remainder of today grouped by where you are (cluster) → theme → centre.
 * Completion reuses ActivityCard verbatim, so it writes to the spine and
 * captures indicators + follow-ups exactly like the legacy Today tab.
 */
export function OnTheGroundToday({
  userId,
  overdue,
  today,
  checklists,
  domainLabels,
  readOnly = false,
}: {
  userId: string;
  overdue: Activity[];
  today: Activity[];
  checklists: ChecklistItem[];
  domainLabels: Record<string, string>;
  /** Admin "view as" preview — render a non-interactive list (no completion). */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { ids: doneIds, add: addDone } = useSessionDoneIds(`ops-${userId}-done`);

  const activityChecklistMap = useMemo(() => {
    const m = new Map<string, ChecklistItem>();
    for (const ci of checklists) for (const a of ci.activities) m.set(a.id, ci);
    return m;
  }, [checklists]);

  // Queue: overdue first (oldest first), then today by time. Drop anything
  // already done (server status or this-session optimistic).
  const queue = useMemo(() => {
    const isPending = (a: Activity) => a.status !== "Done" && !doneIds.has(a.id);
    const od = overdue.filter(isPending);
    const td = today
      .filter(isPending)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return [...od, ...td];
  }, [overdue, today, doneIds]);

  const doneCount = today.filter((a) => a.status === "Done" || doneIds.has(a.id)).length;
  const totalToday = today.length;

  const doNow = queue[0] ?? null;
  const rest = queue.slice(1);

  const handleCompleted = (eventId: string) => {
    addDone(eventId);
    router.refresh();
  };

  // Group the remainder: cluster → theme → activities.
  const groups = useMemo(() => groupByClusterTheme(rest, domainLabels), [rest, domainLabels]);

  // Single-cluster today → "You're in X today" headline.
  const clusters = new Set(rest.concat(doNow ? [doNow] : []).map((a) => clusterName(a) ?? "—"));
  const singleCluster = clusters.size === 1 ? [...clusters][0] : null;

  if (queue.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
        <p className="text-sm font-semibold text-emerald-800 mt-2">Nothing left today.</p>
        <p className="text-xs text-emerald-600 mt-0.5">
          {totalToday > 0 ? `${doneCount}/${totalToday} done — day closed.` : "No visits scheduled."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* DO NOW hero */}
      {doNow && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider">
              {singleCluster && singleCluster !== "—" ? `You're in ${singleCluster} today` : "Do now"}
            </h2>
            <span className="text-[11px] text-stone-400 tabular-nums">
              {queue.length} left{totalToday > 0 ? ` · ${doneCount}/${totalToday} done` : ""}
            </span>
          </div>
          {readOnly ? (
            <ReadOnlyRow activity={doNow} hero />
          ) : (
            <ActivityCard
              activity={doNow}
              linkedChecklist={activityChecklistMap.get(doNow.id) ?? null}
              onCompleted={handleCompleted}
              onRescheduled={() => router.refresh()}
              isOverdue={!isToday(doNow.scheduledAt)}
              variant="card"
            />
          )}
        </div>
      )}

      {/* Up next, grouped by where you are */}
      {groups.map((cl) => (
        <section key={cl.key}>
          <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-stone-400" />
            {cl.label}
          </h3>
          <div className="space-y-3">
            {cl.themes.map((th) => (
              <div key={th.key}>
                {th.label && (
                  <p className="text-[10px] font-medium text-stone-400 mb-1 ml-1">{th.label}</p>
                )}
                <div className="space-y-1.5">
                  {th.items.map((a) =>
                    readOnly ? (
                      <ReadOnlyRow key={a.id} activity={a} />
                    ) : (
                      <ActivityCard
                        key={a.id}
                        activity={a}
                        linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                        onCompleted={handleCompleted}
                        onRescheduled={() => router.refresh()}
                        isOverdue={!isToday(a.scheduledAt)}
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Non-interactive row for admin "view as" preview — no completion actions. */
function ReadOnlyRow({ activity, hero = false }: { activity: Activity; hero?: boolean }) {
  const goal = activity.pitstops?.[0]?.pitstop?.goal;
  const centre = goal?.linkedFacility?.name ?? goal?.title ?? null;
  const overdue = !isToday(activity.scheduledAt);
  return (
    <div className={`flex items-center gap-3 rounded-${hero ? "2xl" : "xl"} border px-4 ${hero ? "py-4" : "py-2.5"} ${
      overdue ? "border-amber-200 bg-amber-50/50" : "border-stone-200 bg-white"
    }`}>
      <div className="flex-shrink-0 w-12 text-right">
        {overdue
          ? <span className="text-[10px] font-semibold text-amber-700">{daysAgo(activity.scheduledAt)}d</span>
          : <span className="text-[11px] font-medium text-stone-500 tabular-nums">{fmtTime(activity.scheduledAt)}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${hero ? "text-sm text-stone-800" : "text-sm text-stone-700"}`}>{activity.title}</p>
        {centre && <p className="text-[11px] text-stone-400 truncate mt-0.5">{centre}</p>}
      </div>
    </div>
  );
}

function clusterOf(a: Activity): { id: string; name: string } | null {
  const goal = a.pitstops?.[0]?.pitstop?.goal;
  return goal?.needsCluster ?? goal?.linkedFacility?.cluster ?? null;
}
function clusterName(a: Activity): string | null {
  return clusterOf(a)?.name ?? null;
}

type ThemeGroup = { key: string; label: string | null; items: Activity[] };
type ClusterGroup = { key: string; label: string; themes: ThemeGroup[] };

function groupByClusterTheme(items: Activity[], domainLabels: Record<string, string>): ClusterGroup[] {
  const clusters = new Map<string, { label: string; themes: Map<string, Activity[]> }>();
  for (const a of items) {
    const c = clusterOf(a);
    const cKey = c?.id ?? "none";
    const cLabel = c?.name ?? "No cluster";
    const domain = a.pitstops?.[0]?.pitstop?.goal?.needsDomain ?? null;
    const tKey = domain ?? "none";
    if (!clusters.has(cKey)) clusters.set(cKey, { label: cLabel, themes: new Map() });
    const cl = clusters.get(cKey)!;
    if (!cl.themes.has(tKey)) cl.themes.set(tKey, []);
    cl.themes.get(tKey)!.push(a);
  }
  return [...clusters.entries()].map(([cKey, cl]) => ({
    key: cKey,
    label: cl.label,
    themes: [...cl.themes.entries()].map(([tKey, arr]) => ({
      key: tKey,
      label: tKey === "none" ? null : domainLabels[tKey] ?? fmtDomain(tKey),
      items: arr,
    })),
  }));
}
