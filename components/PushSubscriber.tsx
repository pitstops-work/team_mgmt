"use client";

import { useEffect, useRef } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushSubscriber() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    async function setup() {
      // Register (or get existing) service worker
      const reg = await navigator.serviceWorker.register("/sw.js");

      // Don't ask if already denied
      if (Notification.permission === "denied") return;

      // If already granted, just make sure we're subscribed
      if (Notification.permission === "granted") {
        await subscribe(reg);
        return;
      }

      // Otherwise ask — but only if we haven't subscribed before
      const existing = await reg.pushManager.getSubscription();
      if (existing) return; // already subscribed, no need to ask again

      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await subscribe(reg);
      }
    }

    async function subscribe(reg: ServiceWorkerRegistration) {
      try {
        const { publicKey } = await fetch("/api/push").then((r) => r.json());
        if (!publicKey) return;

        const existing = await reg.pushManager.getSubscription();
        const sub = existing ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        const json = sub.toJSON();
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
      } catch (err) {
        console.warn("Push subscription failed:", err);
      }
    }

    setup();
  }, []);

  return null;
}
