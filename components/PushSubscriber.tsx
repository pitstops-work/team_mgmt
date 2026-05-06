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
      try {
        // Register the SW, then wait for it to be fully active
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
          // Has a subscription but permission state is unclear — re-sync to server
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

      // Get existing subscription or create a fresh one
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

    setup();
  }, []);

  return null;
}
