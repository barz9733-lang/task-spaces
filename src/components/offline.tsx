"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useApp } from "./app-context";

const PAGES_CACHE = "pages-v2"; // these names must match public/sw.js
const STATIC_CACHE = "static-v2";
const DATA_CACHE = "data-v2";

/**
 * Offline support on the page side: registers the service worker, keeps a cached copy of every
 * space page (so each one opens without a connection), and shows a bar while offline.
 */
export function OfflineBar() {
  const { spaces, refresh } = useApp();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const sync = () => {
      const off = !navigator.onLine;
      setOffline(off);
      // offline: load the last saved copy; back online: get the fresh one
      refresh();
    };
    if (!navigator.onLine) sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [refresh]);

  const ids = spaces.map((s) => s.id).join(",");
  useEffect(() => {
    if (!("caches" in window) || !navigator.onLine || location.hostname === "localhost") return;
    // refresh the cached pages at most twice a day
    const KEY = "pages-cached-at";
    try {
      if (Date.now() - Number(localStorage.getItem(KEY) || 0) < 12 * 3600 * 1000 && localStorage.getItem(KEY + ":ids") === ids) return;
    } catch {
      /* ignore */
    }
    const t = setTimeout(async () => {
      try {
        const cache = await caches.open(PAGES_CACHE);
        // files already loaded by this page (the very first visit happens before the worker is in control)
        const assets = new Set(
          performance
            .getEntriesByType("resource")
            .map((e) => e.name.replace(location.origin, ""))
            .filter((u) => u.startsWith("/_next/static/")),
        );
        for (const url of ["/", ...ids.split(",").filter(Boolean).map((id) => `/spaces/${id}`)]) {
          const res = await fetch(url, { credentials: "same-origin" });
          if (!res.ok || res.redirected) continue;
          // every script / style / font the page needs, so it also opens with no connection
          for (const m of (await res.clone().text()).matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) assets.add(m[0]);
          await cache.put(url, res);
        }
        const staticCache = await caches.open(STATIC_CACHE);
        await Promise.all([...assets].map((u) => staticCache.add(u).catch(() => {})));
        const data = await fetch("/api/data", { cache: "no-store" });
        if (data.ok) await (await caches.open(DATA_CACHE)).put("/api/data", data);
        localStorage.setItem(KEY, String(Date.now()));
        localStorage.setItem(KEY + ":ids", ids);
      } catch {
        /* best effort */
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [ids]);

  if (!offline) return null;
  return (
    <div className="offline-bar" role="status">
      <WifiOff size={14} /> אין חיבור לאינטרנט. מוצג המידע האחרון שנשמר, ושינויים לא יישמרו עד שהחיבור יחזור.
    </div>
  );
}
