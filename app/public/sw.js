// offline shell: pages network-first (falls back to the cached app), hashed assets and fonts cache-first.
// Data (Supabase) always goes to the network.
const CACHE = "tasks-v2";
// stash pictures (previews from YouTube, X, TikTok…, and our own uploads) are kept locally, cache-first;
// the settings window can turn this off or clear it
const MEDIA = "stash-media", FLAGS = "stash-flags", MEDIA_MAX = 1500;
const MEDIA_HOST = /(^|\.)(ytimg\.com|twimg\.com|tiktokcdn(-[a-z]+)?\.com|cdninstagram\.com|fbcdn\.net|vimeocdn\.com|ggpht\.com|googleusercontent\.com)$/;
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![CACHE, MEDIA, FLAGS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };

let mediaOff = null;
const isOff = async () => (mediaOff ??= !!(await (await caches.open(FLAGS)).match("media-off")));
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "media-cache") e.waitUntil(caches.open(FLAGS).then(c => d.on ? c.delete("media-off") : c.put("media-off", new Response("1"))).then(() => { mediaOff = !d.on; }));
  if (d.type === "media-clear") e.waitUntil(caches.delete(MEDIA));
});

// signed storage links change every session: the file path is the key
const mediaKey = url => url.pathname.includes("/storage/v1/object/sign/") ? url.origin + url.pathname : url.href;
async function media(req, url) {
  const key = mediaKey(url), c = await caches.open(MEDIA);
  const hit = await c.match(key);
  if (hit) return hit;
  if (await isOff()) return fetch(req);
  try {
    // a CORS copy has a real size (opaque ones count as megabytes against the quota)
    const res = await fetch(url.href, { mode: "cors", credentials: "omit" });
    if (res.ok) {
      await c.put(key, res.clone());
      c.keys().then(ks => { if (ks.length > MEDIA_MAX) ks.slice(0, ks.length - MEDIA_MAX).forEach(k => c.delete(k)); });
    }
    return res;
  } catch { return fetch(req); }
}

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => put("./index.html", res)).catch(() => caches.match("./index.html")));
    return;
  }
  if (req.destination === "image" && (MEDIA_HOST.test(url.hostname) || url.pathname.includes("/storage/v1/object/sign/journal/"))) { e.respondWith(media(req, url)); return; }
  const own = url.origin === location.origin && url.pathname.includes("/assets/");
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (own || font) e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
});
