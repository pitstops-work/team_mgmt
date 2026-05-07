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

// Push: if the app is in the foreground, post an in-app message instead of a
// system banner. If backgrounded, show the system notification.
// This prevents double-banners on Android (which shows showNotification even
// when the app is focused, unlike iOS which silently drops it).
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "Pitstop", body: "", link: "/" };
  try { payload = { ...payload, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const focused = windowClients.find((c) => c.focused);

      if (focused) {
        // App is open — deliver in-app banner only
        focused.postMessage({ type: "push-notification", payload });
        return;
      }

      // App is backgrounded — show system notification
      return self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { link: payload.link },
        tag: payload.link,           // deduplicate: same link replaces previous
        renotify: true,              // still vibrate/sound even if tag matches
        vibrate: [200, 100, 200],    // Android vibration pattern
        requireInteraction: false,
      });
    })
  );
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
