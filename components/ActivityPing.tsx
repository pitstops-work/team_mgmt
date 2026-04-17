"use client";

import { useEffect } from "react";

// Fires POST /api/auth/ping once when the app mounts to update lastSeenAt.
// Throttled to once per 5 minutes via sessionStorage to avoid spamming on
// every navigation within the same tab session.
export default function ActivityPing() {
  useEffect(() => {
    const key = "activityPing";
    const FIVE_MIN = 5 * 60 * 1000;
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < FIVE_MIN) return;
    sessionStorage.setItem(key, String(Date.now()));
    fetch("/api/auth/ping", { method: "POST" }).catch(() => {});
  }, []);

  return null;
}
