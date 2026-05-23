"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { ArrowLeft, ScrollText, Filter, RefreshCw } from "lucide-react";

type AuditEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null; image: string | null } | null;
};

const ENTITY_TYPES = ["Goal", "Pitstop", "Activity", "Checklist", "User", "System"] as const;
const ACTIONS = [
  "created",
  "updated",
  "deleted",
  "status_change",
  "role_change",
  "password_reset",
  "password_change",
  "portal_access",
  "role_permission_change",
  "role_permission_reset",
] as const;

const ENTITY_BADGE: Record<string, string> = {
  Goal:      "bg-emerald-100 text-emerald-700",
  Pitstop:   "bg-sky-100 text-sky-700",
  Activity:  "bg-violet-100 text-violet-700",
  Checklist: "bg-amber-100 text-amber-700",
  User:      "bg-indigo-100 text-indigo-700",
  System:    "bg-stone-100 text-stone-600",
};

const ACTION_BADGE: Record<string, string> = {
  created:                "bg-emerald-50 text-emerald-700 border-emerald-200",
  updated:                "bg-sky-50 text-sky-700 border-sky-200",
  deleted:                "bg-rose-50 text-rose-700 border-rose-200",
  status_change:          "bg-violet-50 text-violet-700 border-violet-200",
  role_change:            "bg-amber-50 text-amber-700 border-amber-200",
  password_reset:         "bg-orange-50 text-orange-700 border-orange-200",
  password_change:        "bg-orange-50 text-orange-700 border-orange-200",
  portal_access:          "bg-indigo-50 text-indigo-700 border-indigo-200",
  role_permission_change: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  role_permission_reset:  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncate(s: string | null, n = 60): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function AuditLogPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super-admin";
  const isSuperAdmin = session?.user?.role === "super-admin";

  const [items, setItems] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entityType, setEntityType] = useState<string>("");
  const [action, setAction] = useState<string>("");

  const load = useCallback(
    async (cursor: string | null) => {
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (entityType) params.set("entityType", entityType);
        if (action) params.set("action", action);
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/audit/list?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { items: AuditEntry[]; nextCursor: string | null } = await res.json();
        setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
        setNextCursor(data.nextCursor);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [entityType, action],
  );

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (!isAdmin) { router.replace("/settings"); return; }
    void load(null);
  }, [status, isAdmin, router, load]);

  if (status === "loading" || (loading && items.length === 0)) {
    return <div className="p-8 text-stone-500">Loading audit log…</div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/settings" className="rounded-md p-1 hover:bg-stone-100">
          <ArrowLeft className="h-5 w-5 text-stone-500" />
        </Link>
        <ScrollText className="h-6 w-6 text-stone-700" />
        <h1 className="text-2xl font-semibold text-stone-800">Audit log</h1>
      </div>

      <p className="mb-4 text-sm text-stone-500">
        {isSuperAdmin
          ? "All audit entries across the system."
          : "Your own actions plus any entries about your user."}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
        <Filter className="h-4 w-4 text-stone-500" />
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button
          onClick={() => void load(null)}
          className="ml-auto flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-700 hover:bg-stone-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          No audit entries match the current filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <ul className="divide-y divide-stone-100">
            {items.map((e) => (
              <li key={e.id} className="flex items-start gap-3 p-3">
                <Avatar name={e.user?.name ?? null} image={e.user?.image ?? null} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-stone-800">
                      {e.user?.name ?? e.user?.email ?? "Unknown"}
                    </span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-xs ${ACTION_BADGE[e.action] ?? "bg-stone-50 text-stone-600 border-stone-200"}`}>
                      {e.action}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-xs ${ENTITY_BADGE[e.entityType] ?? "bg-stone-100 text-stone-600"}`}>
                      {e.entityType}
                    </span>
                    <code className="text-xs text-stone-400">{e.entityId.slice(0, 8)}</code>
                    <span className="ml-auto text-xs text-stone-400" title={new Date(e.createdAt).toLocaleString()}>
                      {relativeTime(e.createdAt)}
                    </span>
                  </div>
                  {(e.field || e.oldValue || e.newValue) && (
                    <div className="mt-1 text-xs text-stone-600">
                      {e.field && <span className="font-mono text-stone-500">{e.field}: </span>}
                      {e.oldValue !== null && (
                        <span className="text-rose-600 line-through">{truncate(e.oldValue)}</span>
                      )}
                      {e.oldValue !== null && e.newValue !== null && <span className="mx-1 text-stone-400">→</span>}
                      {e.newValue !== null && (
                        <span className="text-emerald-700">{truncate(e.newValue)}</span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <button
              disabled={loadingMore}
              onClick={() => void load(nextCursor)}
              className="block w-full border-t border-stone-100 px-4 py-3 text-center text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
