// The service worker is plain JS so it can run in the browser unchanged.
// These source strings are the single copy of the caching rules: tests call
// them, and the worker script embeds the same text.

export type CacheDecision = "passthrough" | "cache-first" | "network-first-page";

export type CacheInput = {
  method: string;
  sameOrigin: boolean;
  pathname: string;
  mode: string;
  accept: string;
  authorization: boolean;
  rsc: boolean;
};

const CACHE_DECISION_SOURCE = `function cacheDecision(input) {
  if (!input.sameOrigin) return "passthrough";
  if (input.method !== "GET") return "passthrough";
  if (input.authorization) return "passthrough";
  // RSC flight requests vary by router headers and carry the signed-in child's data.
  if (input.rsc) return "passthrough";
  // API routes include uploads and anything else with user data. Never store them.
  if (input.pathname.indexOf("/api/") === 0) return "passthrough";
  if (
    input.pathname.indexOf("/_next/static/") === 0 ||
    input.pathname.indexOf("/icons/") === 0 ||
    input.pathname === "/favicon.ico" ||
    input.pathname === "/apple-touch-icon.png" ||
    input.pathname === "/offline.html"
  ) {
    return "cache-first";
  }
  if (input.mode === "navigate") return "network-first-page";
  if ((input.accept || "").indexOf("text/html") !== -1) return "network-first-page";
  return "passthrough";
}`;

const IS_RSC_SOURCE = `function isRscRequest(headers, search) {
  const accept = headers.get("accept") || "";
  if (accept.indexOf("text/x-component") !== -1) return true;
  if (headers.get("rsc") === "1") return true;
  if (headers.get("next-router-prefetch")) return true;
  if (headers.get("next-router-segment-prefetch")) return true;
  if (headers.get("next-router-state-tree")) return true;
  const query = search && search.charAt(0) === "?" ? search.slice(1) : (search || "");
  return new URLSearchParams(query).has("_rsc");
}`;

export const cacheDecision = new Function(`${CACHE_DECISION_SOURCE}; return cacheDecision;`)() as (
  input: CacheInput,
) => CacheDecision;

export const isRscRequest = new Function(`${IS_RSC_SOURCE}; return isRscRequest;`)() as (
  headers: { get(name: string): string | null },
  search: string,
) => boolean;

/** Turns a Next build-manifest entry into a same-origin static URL, or null. */
export function toShellAssetUrl(file: string): string | null {
  if (!file || file.includes("..") || file.includes("\\") || file.includes("?")) return null;
  let url = file;
  if (url.startsWith("static/")) url = `/_next/${url}`;
  else if (url.startsWith("/static/")) url = `/_next${url}`;
  if (!url.startsWith("/_next/static/")) return null;
  if (!/\.(?:js|css)$/.test(url)) return null;
  return url;
}

export type NextBuildManifest = {
  rootMainFiles?: string[];
  polyfillFiles?: string[];
  pages?: Record<string, string[] | undefined>;
};

/**
 * Shared JS and CSS for the app shell. Files are content-hashed, so precaching
 * them does not pin an old build: the next deploy has new URLs and a new cache.
 */
export function appShellUrls(manifest: NextBuildManifest | null | undefined): string[] {
  return shellUrlsFromBuildManifest(manifest);
}

export function shellUrlsFromBuildManifest(manifest: NextBuildManifest | null | undefined): string[] {
  const urls = new Set<string>();
  const pages = manifest?.pages ?? {};
  for (const key of ["/layout", "/page"]) {
    for (const file of pages[key] ?? []) {
      const url = toShellAssetUrl(file);
      if (url) urls.add(url);
    }
  }
  for (const file of [...(manifest?.rootMainFiles ?? []), ...(manifest?.polyfillFiles ?? [])]) {
    const url = toShellAssetUrl(file);
    if (url) urls.add(url);
  }
  return [...urls];
}

/** Global styles emitted as `/_next/static/chunks/<name>.css` (Next 16 / Turbopack). */
export function cssChunkUrls(filenames: string[]): string[] {
  const urls: string[] = [];
  for (const name of filenames) {
    if (!/^[\w.-]+\.css$/.test(name)) continue;
    const url = toShellAssetUrl(`static/chunks/${name}`);
    if (url) urls.push(url);
  }
  return urls;
}

const APP_SHELL = [
  "/offline.html",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

/** Service worker source. `version` is the Next.js build id so each deploy gets a new worker and fresh page cache. */
export function serviceWorkerSource(version: string, shellUrls: string[] = []): string {
  const safeVersion = version.trim() || "dev";
  const shell = [...APP_SHELL];
  for (const url of shellUrls) {
    const safe = toShellAssetUrl(url);
    if (safe && !shell.includes(safe)) shell.push(safe);
  }
  return `/* Math Buddy service worker. Cache version ${JSON.stringify(safeVersion)}. */
const VERSION = ${JSON.stringify(safeVersion)};
const PRECACHE = "math-buddy-precache-" + VERSION;
const PAGES = "math-buddy-pages-" + VERSION;
const STATIC = "math-buddy-static";
const APP_SHELL = ${JSON.stringify(shell)};

${CACHE_DECISION_SOURCE}
${IS_RSC_SOURCE}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    const offline = await fetch("/offline.html", { cache: "reload" });
    if (!offline.ok) throw new Error("Math Buddy offline page failed to precache");
    await cache.put("/offline.html", offline);
    await Promise.all(APP_SHELL.filter((url) => url !== "/offline.html").map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response && response.ok && !response.redirected && response.type === "basic") {
          await cache.put(url, response);
        }
      } catch (error) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      const keep = key === PRECACHE || key === PAGES || key === STATIC;
      if (key.indexOf("math-buddy-") === 0 && !keep) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }
  const decision = cacheDecision({
    method: request.method,
    sameOrigin: url.origin === self.location.origin,
    pathname: url.pathname,
    mode: request.mode,
    accept: request.headers.get("accept") || "",
    authorization: !!request.headers.get("authorization"),
    rsc: isRscRequest(request.headers, url.search),
  });
  if (decision === "cache-first") event.respondWith(cacheFirst(request));
  else if (decision === "network-first-page") event.respondWith(networkFirstPage(request));
});

function storageKey(request) {
  const url = new URL(request.url);
  return url.pathname + url.search;
}

function cacheable(response) {
  return !!response && response.status === 200 && !response.redirected && response.type === "basic";
}

async function cacheFirst(request) {
  const key = storageKey(request);
  const precache = await caches.open(PRECACHE);
  const precached = await precache.match(key, { ignoreVary: true });
  if (precached) return precached;
  const cache = await caches.open(STATIC);
  const cached = await cache.match(key, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) {
    try { await cache.put(key, response.clone()); } catch (error) {}
  }
  return response;
}

async function networkFirstPage(request) {
  const key = storageKey(request);
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    const type = response.headers.get("content-type") || "";
    if (cacheable(response) && type.indexOf("text/html") !== -1) {
      try { await cache.put(key, response.clone()); } catch (error) {}
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key, { ignoreVary: true });
    if (cached) return cached;
    const offline = await caches.match("/offline.html", { ignoreVary: true });
    if (offline) return offline;
    throw error;
  }
}
`;
}
