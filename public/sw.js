const CACHE = "pitstop-v1";
const PRECACHE = ["/", "/home", "/icon-192.png", "/icon-512.png"];

// Install: pre-cache shell assets
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first with cache fallback
// This handler is REQUIRED for Chrome Android to show the install prompt
self.addEventListener("fetch", (event) => {
  // Only handle same-origin GET requests; skip API, auth, and Next.js internals
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return; // let browser handle normally
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache successful navigation responses
        if (res.ok && event.request.mode === "navigate") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "Pitstop", body: "", link: "/" };
  try { payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { link: payload.link },
    })
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
            // navigate first, then focus — avoids race where focus fires before nav
            return client.navigate(link).then((c) => (c ?? client).focus());
          }
        }
        return clients.openWindow(link);
      })
  );
});
