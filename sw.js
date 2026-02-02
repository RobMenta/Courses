// sw.js — stable PWA cache (anti "switch" / anti mélange de versions)
const VERSION = "v9"; // <- incrémente si tu modifies des fichiers core
const CACHE_PREFIX = "courses-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// Helper: only same-origin requests
function isSameOrigin(req) {
  try {
    return new URL(req.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Precache core assets
    await cache.addAll(CORE_ASSETS);

    // Activate immediately (avoid "old SW keeps serving old stuff")
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Delete only OUR old caches (not everything)
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );

    // Take control of clients ASAP
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Debug escape hatch: add ?sw=0 to bypass service worker
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("sw") === "0") return;
  } catch {}

  // Only handle GET
  if (req.method !== "GET") return;

  // NAVIGATION: network-first, fallback to cached index
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // Optional: update cached index silently
        const cache = await caches.open(CACHE_NAME);
        cache.put("./index.html", fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("./index.html")) || (await cache.match("./"));
      }
    })());
    return;
  }

  // STATIC (same-origin): stale-while-revalidate
  if (isSameOrigin(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);

      const fetchPromise = fetch(req)
        .then((fresh) => {
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        })
        .catch(() => null);

      // Return cached immediately if available, else wait for network
      return cached || (await fetchPromise) || cached;
    })());
    return;
  }

  // Other origins: just pass through
});
