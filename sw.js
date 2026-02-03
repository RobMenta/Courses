// sw.js — update-safe PWA cache (évite mélange de versions + met à jour app.js/styles.css)
// ✅ points clés :
// - navigation: network-first + update du cache index.html
// - assets same-origin: stale-while-revalidate
// - précache des assets core
// - purge des anciens caches à l’activate
// - skipWaiting + clients.claim

const VERSION = "v12"; // <- 🔥 incrémente quand tu modifies app.js / styles / index etc.
const CACHE_PREFIX = "courses-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
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
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Precache core assets (best effort)
      try {
        await cache.addAll(CORE_ASSETS);
      } catch {
        // si un asset manque/404, on ne casse pas l’install
        // (le SW fonctionnera quand même en runtime cache)
      }

      // Activate immediately
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete only OUR old caches (not everything)
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );

      // Take control ASAP
      await self.clients.claim();
    })()
  );
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

  // ---- NAVIGATION: network-first (anti "page bloquée sur vieille version")
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);

          // update cached index silently
          const cache = await caches.open(CACHE_NAME);
          cache.put("./index.html", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // ---- ASSETS same-origin: stale-while-revalidate (rapide + update derrière)
  if (isSameOrigin(req)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);

        const fetchPromise = fetch(req)
          .then((fresh) => {
            cache.put(req, fresh.clone()).catch(() => {});
            return fresh;
          })
          .catch(() => null);

        // Return cached immediately if available, else wait for network
        return cached || (await fetchPromise) || Response.error();
      })()
    );
    return;
  }

  // Other origins: pass through (ne pas casser les appels externes)
});
