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

// Push: always call showNotification immediately — do not gate it on matchAll.
// On iOS, gating on matchAll can cause the promise to resolve before
// showNotification is called, silently dropping the background notification.
// iOS naturally suppresses the system banner when the app is in the foreground,
// so we get clean behaviour on both platforms without special-casing.
// In parallel, post an in-app message if a window is focused so the app can
// show its own banner (covers the iOS foreground suppression case).
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "Pitstop", body: "", link: "/" };
  try { payload = { ...payload, ...event.data.json() }; } catch {}

  const showNote = self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { link: payload.link },
    tag: payload.link,
    renotify: true,
    vibrate: [200, 100, 200],
  });

  const notifyFocused = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      const focused = clients.find((c) => c.focused);
      if (focused) focused.postMessage({ type: "push-notification", payload });
    })
    .catch(() => {});

  event.waitUntil(Promise.all([showNote, notifyFocused]));
});

// iOS APNs can silently rotate push endpoints. When that happens, resubscribe
// automatically so background delivery keeps working without requiring an app open.
// We fetch the VAPID key from the server because oldSubscription.options
// .applicationServerKey is unreliable on iOS.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    fetch("/api/push")
      .then((r) => r.json())
      .then(({ publicKey }) => {
        if (!publicKey) return;
        return self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
      })
      .then((sub) => {
        if (!sub) return;
        const json = sub.toJSON();
        return fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
      })
      .catch(() => {})
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
