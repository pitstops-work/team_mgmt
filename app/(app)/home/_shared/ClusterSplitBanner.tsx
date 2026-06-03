"use client";

import { MapPin } from "lucide-react";

/**
 * Surfaces a cluster split on a day's activity list. Renders only when
 * activities span 2+ distinct real clusters — single-cluster days and
 * "all unassigned" days stay quiet so the banner keeps signal value.
 *
 * Caller passes a list of `cluster | null` (one entry per activity, in any
 * order). Aggregation happens here so callers don't repeat it.
 *
 * Action mode: pass `onMoveCluster` to make each real-cluster pill a button.
 * Clicking opens the caller's batch-reschedule sheet for that cluster. The
 * "No cluster" pill stays non-actionable — it's a data-hygiene bucket, not a
 * logistical group worth moving as one.
 */
export function ClusterSplitBanner({
  clusters,
  label = "Today spans",
  onMoveCluster,
}: {
  clusters: ({ id: string; name: string } | null)[];
  /** Override prefix when used outside Today (e.g. "May 30 spans"). */
  label?: string;
  /** When provided, real-cluster pills become "Move {name} (N) to another day" buttons. */
  onMoveCluster?: (cluster: { id: string; name: string }) => void;
}) {
  const real = new Map<string, { name: string; count: number }>();
  let noCluster = 0;
  for (const c of clusters) {
    if (!c) { noCluster++; continue; }
    const prev = real.get(c.id);
    if (prev) prev.count++;
    else real.set(c.id, { name: c.name, count: 1 });
  }
  if (real.size < 2) return null;

  const sorted = [...real.entries()]
    .map(([id, v]) => ({ id, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-amber-800">
        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {label} {real.size} clusters
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sorted.map(c => {
          const base = "text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-900";
          if (onMoveCluster) {
            return (
              <button
                key={c.id}
                onClick={() => onMoveCluster({ id: c.id, name: c.name })}
                className={`${base} hover:bg-amber-100 hover:border-amber-300 transition-colors`}
                aria-label={`Move ${c.name} (${c.count} activities) to another day`}
              >
                Move {c.name} ({c.count}) to another day
              </button>
            );
          }
          return (
            <span key={c.id} className={base}>
              {c.name} · {c.count}
            </span>
          );
        })}
        {noCluster > 0 && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-stone-200 text-stone-500">
            No cluster · {noCluster}
          </span>
        )}
      </div>
    </div>
  );
}
