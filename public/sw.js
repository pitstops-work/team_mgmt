const CACHE = "pitstop-v1";
const PRECACHE = ["/", "/home", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && event.request.mode === "navigate") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push: if any window client is focused, post an in-app message (iOS doesn't
// show system banners when the app is in the foreground). Always call
// showNotification too — it fires normally when app is backgrounded.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "Pitstop", body: "", link: "/" };
  try { payload = { ...payload, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const focused = windowClients.find((c) => c.focused);
      if (focused) {
        focused.postMessage({ type: "push-notification", payload });
      }
      return self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { link: payload.link },
      });
    })
  );
});

// iOS APNs silently rotates/expires subscriptions. This event fires when
// that happens — auto-resubscribe so notifications keep working without
// requiring the user to open the app.
self.addEventListener("pushsubscriptionchange", (event) => {
  const serverKey = event.oldSubscription?.options?.applicationServerKey;
  if (!serverKey) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey,
    }).then((sub) => {
      const json = sub.toJSON();
      return fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
    }).catch(() => {})
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.navigate(link).then((c) => (c ?? client).focus());
          }
        }
        return clients.openWindow(link);
      })
  );
});
