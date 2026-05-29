"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Loader2, RotateCcw } from "lucide-react";

/**
 * Recent ActivityRescheduled notifications for the signed-in ZL.
 *
 * Fetches /api/notifications client-side and filters to the
 * `ActivityRescheduled` type within the last 24h. Each row gets an
 * Acknowledge action (PATCH /api/notifications/[id] → read: true) and a link
 * straight to the rescheduled activity.
 *
 * The panel auto-hides when there are no recent alerts so the ZL Today
 * surface stays clean during quiet weeks.
 */
type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const WINDOW_HOURS = 24;

export function RescheduleAlertsPanel() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [acking, setAcking] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const all: Notification[] = await res.json();
      const since = Date.now() - WINDOW_HOURS * 3600_000;
      const filtered = all
        .filter(n => n.type === "ActivityRescheduled" && !n.read && new Date(n.createdAt).getTime() >= since)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(filtered);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function acknowledge(id: string) {
    setAcking(prev => new Set(prev).add(id));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      setItems(prev => prev?.filter(n => n.id !== id) ?? null);
      // Let the nav badge re-poll its unread count.
      window.dispatchEvent(new CustomEvent("pitstop:notifications-changed"));
    } finally {
      setAcking(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  if (items === null) {
    return (
      <div className="text-xs text-stone-400 flex items-center gap-1.5 py-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading reschedule alerts…
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
        <h3 className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex-1">
          Reschedule alerts · last 24h ({items.length})
        </h3>
      </div>
      {items.map(n => (
        <div key={n.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-stone-800 truncate">{n.title}</p>
            {n.body && <p className="text-[11px] text-stone-500 mt-0.5">{n.body}</p>}
            <p className="text-[10px] text-stone-400 mt-1 tabular-nums">{formatAgo(n.createdAt)}</p>
          </div>
          <div className="flex-shrink-0 flex flex-col gap-1.5">
            <button
              onClick={() => acknowledge(n.id)}
              disabled={acking.has(n.id)}
              className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
            >
              {acking.has(n.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Acknowledge
            </button>
            {n.link && (
              <Link href={n.link} className="flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-700">
                Open <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleString();
}
