// sw.js — update-safe PWA cache (évite mélange de versions + met à jour app.js/styles.css)
// ✅ points clés :
// - navigation: network-first + update du cache index.html
// - core assets (app.js/styles.css/index/manifest): network-first (évite rester bloqué sur une vieille version)
// - autres assets same-origin: stale-while-revalidate
// - précache des assets core
// - purge des anciens caches à l’activate
// - skipWaiting + clients.claim
// - message "SKIP_WAITING" (permet à la page de forcer l’activation)

const VERSION = "v13"; // <- 🔥 incrémente quand tu modifies app.js / styles / index etc.
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

// Helper: detect "core" requests (important pour éviter l'ancien app.js/styles.css)
function isCoreRequest(req) {
  try {
    const u = new URL(req.url);
    const p = u.pathname;
    return (
      p.endsWith("/index.html") ||
      p.endsWith("/app.js") ||
      p.endsWith("/styles.css") ||
      p.endsWith("/manifest.webmanifest") ||
      p.endsWith("/sw.js") ||
      p === "/" ||
      p.endsWith("/")
    );
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

// Allow page to force activate the waiting SW
self.addEventListener("message", (event) => {
  if (event?.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
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

  // Only same-origin (ne pas casser les appels externes)
  if (!isSameOrigin(req)) return;

  // ---- NAVIGATION: network-first (anti "page bloquée sur vieille version")
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(req);

          // Update cached index + also cache the navigation request (best effort)
          cache.put("./index.html", fresh.clone()).catch(() => {});
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          return (
            (await cache.match(req)) ||
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // ---- CORE ASSETS: network-first (évite rester collé à un vieux app.js/styles.css)
  if (isCoreRequest(req)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(req);
          cache.put(req, fresh.clone()).catch(() => {});
          // Si c'est index.html, on le met aussi sous la clé stable
          try {
            const u = new URL(req.url);
            if (u.pathname.endsWith("/index.html") || u.pathname === "/" || u.pathname.endsWith("/")) {
              cache.put("./index.html", fresh.clone()).catch(() => {});
            }
          } catch {}
          return fresh;
        } catch {
          return (await cache.match(req)) || Response.error();
        }
      })()
    );
    return;
  }

  // ---- OTHER ASSETS same-origin: stale-while-revalidate (rapide + update derrière)
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

      return cached || (await fetchPromise) || Response.error();
    })()
  );
});
