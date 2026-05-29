"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * `doneEventIds` that survives `router.refresh()` and full navigation away/back.
 *
 * Why: when the user marks an activity Done we hide it optimistically via this
 * Set. If we then call router.refresh() (so server counts re-sync), the server
 * occasionally returns the activity as still Scheduled (read after write race
 * on the underlying Postgres/replica path, or because the next render lands
 * before the UPDATE is visible to the new connection). Without persistence,
 * the count snaps back to its pre-mark value.
 *
 * Persisting the Set in sessionStorage (per tab, cleared when the tab closes)
 * keeps the filter authoritative for the user's session — they never see a
 * "completed" activity reappear before the server catches up.
 *
 * Stale ids in storage are harmless: the filter is set-membership, so an id
 * that no longer appears in the server data is a no-op.
 */
export function useSessionDoneIds(key: string) {
  const [ids, setIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = sessionStorage.getItem(key);
      return new Set(stored ? (JSON.parse(stored) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  // Mirror state → sessionStorage. Skips on SSR.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(key, JSON.stringify([...ids]));
    } catch {
      /* quota / disabled — silently ignore; in-memory state still works */
    }
  }, [key, ids]);

  const add = useCallback((id: string) => {
    setIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  return { ids, add };
}
