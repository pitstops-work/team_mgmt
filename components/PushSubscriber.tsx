"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type PushPayload = { title: string; body: string; link: string };
type Banner = PushPayload & { id: number };

export default function PushSubscriber() {
  const attempted = useRef(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const queueRef = useRef<PushPayload[]>([]);
  const showingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Show banners from the queue one at a time, 600ms apart
  const drainQueue = useCallback(() => {
    if (showingRef.current || queueRef.current.length === 0) return;
    showingRef.current = true;
    const next = queueRef.current.shift()!;
    setBanner({ ...next, id: Date.now() });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setBanner(null);
      showingRef.current = false;
      setTimeout(drainQueue, 600);
    }, 5000);
  }, []);

  const enqueue = useCallback((payload: PushPayload) => {
    queueRef.current.push(payload);
    drainQueue();
  }, [drainQueue]);

  // Real-time: SW posts a message when a push arrives while the app is open
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "push-notification") {
        enqueue(event.data.payload as PushPayload);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [enqueue]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    async function setup() {
      try {
        // Register SW and set up push subscription
        await navigator.serviceWorker.register("/sw.js");
        const reg = await navigator.serviceWorker.ready;

        if (Notification.permission === "denied") return;

        if (Notification.permission === "granted") {
          await ensureSubscribed(reg);
        } else {
          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            await saveSubscription(existing);
          } else {
            const permission = await Notification.requestPermission();
            if (permission === "granted") await ensureSubscribed(reg);
          }
        }

        // Fetch and display any unread notifications missed while app was closed.
        // This is the reliable fallback for iOS where background push is unreliable.
        await catchUpMissedNotifications();
      } catch (err) {
        console.warn("[PushSubscriber] setup error:", err);
      }
    }

    async function ensureSubscribed(reg: ServiceWorkerRegistration) {
      const { publicKey } = await fetch("/api/push").then((r) => r.json());
      if (!publicKey) return;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await saveSubscription(sub);
    }

    async function saveSubscription(sub: PushSubscription) {
      const json = sub.toJSON();
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
    }

    async function catchUpMissedNotifications() {
      try {
        const notifications: Array<{ id: string; title: string; body: string | null; link: string | null; createdAt: string }> =
          await fetch("/api/notifications?unread=1").then((r) => r.json());

        if (!Array.isArray(notifications) || notifications.length === 0) return;

        // Only show notifications from the last 24 hours to avoid surfacing old ones
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const recent = notifications.filter((n) => new Date(n.createdAt).getTime() > cutoff);

        // Mark all as read immediately so they don't re-appear next open
        if (notifications.length > 0) {
          fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
        }

        // Queue banners for each missed notification (most recent first, max 3)
        recent.slice(0, 3).reverse().forEach((n) => {
          enqueue({ title: n.title, body: n.body ?? "", link: n.link ?? "/" });
        });
      } catch {
        // Non-critical — silently ignore
      }
    }

    setup();
  }, [enqueue]);

  if (!banner) return null;

  return (
    <div
      className="fixed top-4 left-3 right-3 z-[9999] flex items-start gap-3 bg-stone-900 text-white rounded-2xl shadow-2xl px-4 py-3 cursor-pointer"
      style={{ animation: "slideDown 0.25s ease-out" }}
      onClick={() => {
        setBanner(null);
        showingRef.current = false;
        router.push(banner.link);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" className="w-9 h-9 rounded-xl flex-shrink-0 mt-0.5" alt="" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug truncate">{banner.title}</p>
        <p className="text-xs text-stone-300 mt-0.5 line-clamp-2 leading-snug">{banner.body}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setBanner(null); showingRef.current = false; setTimeout(drainQueue, 600); }}
        className="flex-shrink-0 p-1 text-stone-400 hover:text-white -mr-1 mt-0.5"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
