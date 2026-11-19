/* Service worker: push notifications + a small offline cache (read-only view of the last synced data). */
const VERSION = "v2";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const DATA = `data-${VERSION}`;
// `next dev` serves unhashed, constantly changing files, so caching is disabled on localhost.
const CACHING = self.location.hostname !== "localhost";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const keep = [STATIC, PAGES, DATA];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);

const cacheable = (res) => res && res.ok && !res.redirected && res.type === "basic";

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (cacheable(res)) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    // a page that was never opened on this device: send the user to the cached dashboard
    if (fallbackUrl && (await cache.match(fallbackUrl))) return Response.redirect(fallbackUrl, 302);
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  if (!CACHING) return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req, STATIC)); // content-hashed, never changes
  } else if (url.pathname === "/api/data") {
    event.respondWith(networkFirst(req, DATA));
  } else if (req.mode === "navigate" && !url.pathname.startsWith("/api/") && url.pathname !== "/login") {
    event.respondWith(networkFirst(req, PAGES, "/"));
  }
});

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(d.title || "משימות", {
      body: d.body || "",
      icon: "/icons/192",
      badge: "/icons/192",
      dir: "rtl",
      lang: "he",
      tag: d.tag,
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
