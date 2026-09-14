/* Replaced by finalize-build.mjs with the exact fingerprint and built assets. */
const BUILD_VERSION = "__BUILD_VERSION__";
const PRECACHE_FILES = ["__PRECACHE_FILES__"];
const CACHE_PREFIX = "tricount-brazil-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const SCOPE_URL = new URL(self.registration.scope);
const SHELL_URL = new URL("index.html", SCOPE_URL).href;
const PRECACHE_URLS = new Set(PRECACHE_FILES.map((file) => new URL(file, SCOPE_URL).href));
const clientVersions = new Map();

function ownsCache(name) {
  return name.startsWith(CACHE_PREFIX) || /^tricount-brazil-v\d+$/.test(name);
}

async function scopedClients() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return clients.filter((client) => client.url.startsWith(SCOPE_URL.href));
}

async function cleanUnusedCaches() {
  const clients = await scopedClients();
  // An old tab might still need an old lazy-loaded chunk. Ask every tab for its
  // document version before deleting anything; unknown legacy tabs keep caches.
  if (clients.some((client) => !clientVersions.has(client.id))) return;
  const active = new Set([CACHE_NAME, ...clients.map((client) => `${CACHE_PREFIX}${clientVersions.get(client.id)}`)]);
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => ownsCache(key) && !active.has(key)).map((key) => caches.delete(key)));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...PRECACHE_URLS].map((url) => new Request(url, { cache: "reload" })));
    for (const client of await scopedClients()) client.postMessage({ type: "UPDATE_AVAILABLE", version: BUILD_VERSION });
  })());
  // Activation is user-controlled when an older worker is serving open tabs.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    for (const client of await scopedClients()) client.postMessage({ type: "REQUEST_CLIENT_VERSION" });
    await cleanUnusedCaches();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  } else if (event.data?.type === "CLIENT_VERSION" && event.source?.id && /^[a-f0-9]{16}$/.test(event.data.version || "")) {
    clientVersions.set(event.source.id, event.data.version);
    event.waitUntil(cleanUnusedCaches());
  }
});

async function boundedFetch(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    return await fetch(request, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const shell = await cache.match(SHELL_URL);
  if (shell) return shell;
  try {
    return await boundedFetch(request);
  } catch {
    return new Response("<!doctype html><html lang=fr><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Tricount Brazil</title><h1>Connexion indisponible</h1><p>Le cache de cet appareil n’est pas encore prêt. Réessaie une fois connecté.</p><a href='./'>Réessayer</a></html>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function assetResponse(request) {
  const own = await caches.open(CACHE_NAME);
  const current = await own.match(request);
  if (current) return current;
  for (const name of (await caches.keys()).filter((name) => ownsCache(name) && name !== CACHE_NAME)) {
    const cached = await (await caches.open(name)).match(request);
    if (cached) return cached;
  }
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return;
  const relative = url.pathname.slice(SCOPE_URL.pathname.length);
  if (request.mode === "navigate" && ["", "index.html", "comptes.html", "budget.html"].includes(relative)) {
    event.respondWith(navigationResponse(request));
  } else if (PRECACHE_URLS.has(url.href) || /^assets\/[^/]+\.[a-z0-9]+$/.test(relative)) {
    event.respondWith(assetResponse(request));
  }
  // API responses, receipts, exchange rates and third-party traffic never enter CacheStorage.
});
