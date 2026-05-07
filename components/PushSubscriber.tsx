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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const showBanner = useCallback((payload: PushPayload) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setBanner({ ...payload, id: Date.now() });
    timerRef.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  // Listen for in-app push messages from the service worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "push-notification") {
        showBanner(event.data.payload as PushPayload);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [showBanner]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    async function setup() {
      try {
        await navigator.serviceWorker.register("/sw.js");
        const reg = await navigator.serviceWorker.ready;

        if (Notification.permission === "denied") return;

        if (Notification.permission === "granted") {
          await ensureSubscribed(reg);
          return;
        }

        // Not yet decided — only prompt if no existing subscription
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          await saveSubscription(existing);
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          await ensureSubscribed(reg);
        }
      } catch (err) {
        console.warn("[PushSubscriber] setup error:", err);
      }
    }

    async function ensureSubscribed(reg: ServiceWorkerRegistration) {
      const { publicKey } = await fetch("/api/push").then((r) => r.json());
      if (!publicKey) return;

      // Use the existing subscription if one exists — rotating it unnecessarily
      // causes APNs token propagation delays that break background delivery.
      // pushsubscriptionchange in sw.js handles genuine iOS endpoint rotation.
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // Always re-sync to server in case the endpoint was lost from the DB.
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

    setup();
  }, []);

  if (!banner) return null;

  return (
    <div
      className="fixed top-4 left-3 right-3 z-[9999] flex items-start gap-3 bg-stone-900 text-white rounded-2xl shadow-2xl px-4 py-3 cursor-pointer"
      style={{ animation: "slideDown 0.25s ease-out" }}
      onClick={() => {
        setBanner(null);
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
        onClick={(e) => { e.stopPropagation(); setBanner(null); }}
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
