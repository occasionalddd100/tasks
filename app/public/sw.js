// offline shell: pages network-first (falls back to the cached app), hashed assets and fonts cache-first.
// Data (Supabase) always goes to the network.
const CACHE = "tasks-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => put("./index.html", res)).catch(() => caches.match("./index.html")));
    return;
  }
  const own = url.origin === location.origin && url.pathname.includes("/assets/");
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (own || font) e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
});
