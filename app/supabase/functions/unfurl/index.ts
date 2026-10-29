// unfurl: title, text, preview image and video for a link, so stash cards look like the post they save.
// Runs server-side because most sites don't allow the browser to read them directly.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const get = async (url: string, headers: Record<string, string> = {}) => {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "Accept-Language": "ru,en;q=0.8", ...headers }, redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(r.status + " " + url);
  return r;
};

const decode = (s = "") => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
function meta(html: string, base: string) {
  const tags = [...html.matchAll(/<meta\s[^>]*>/gi)].map(m => m[0]);
  const pick = (...names: string[]) => {
    for (const n of names) for (const t of tags) {
      const k = t.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (k === n) { const v = t.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]; if (v) return decode(v.trim()); }
    }
    return "";
  };
  const abs = (u: string) => { try { return u ? new URL(u, base).href : ""; } catch { return ""; } };
  return {
    title: pick("og:title", "twitter:title") || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || ""),
    text: pick("og:description", "twitter:description", "description"),
    thumb: abs(pick("og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src")),
    video: abs(pick("og:video:secure_url", "og:video:url", "og:video")),
    site: pick("og:site_name"),
  };
}

async function unfurl(url: string) {
  const u = new URL(url), host = u.hostname.replace(/^www\.|^m\.|^mobile\./, "");

  // X / Twitter: fxtwitter's open API gives text, photos and the direct video file
  const tw = (host === "x.com" || host === "twitter.com" || host.endsWith("fxtwitter.com") || host.endsWith("vxtwitter.com")) && u.pathname.match(/status(?:es)?\/(\d+)/)?.[1];
  if (tw) {
    const d = (await (await get("https://api.fxtwitter.com/status/" + tw)).json()).tweet;
    const v = d?.media?.videos?.[0], ph = d?.media?.photos || [];
    return { title: d?.author?.name ? `${d.author.name} (@${d.author.screen_name})` : "Пост в X", text: d?.text || "", thumb: v?.thumbnail_url || ph[0]?.url || d?.author?.avatar_url || "",
      video: v?.url || "", photos: ph.map((p: { url: string }) => p.url), author: d?.author?.screen_name || "", w: v?.width || ph[0]?.width || 0, h: v?.height || ph[0]?.height || 0 };
  }
  // TikTok: a short link (vm. / vt.) is resolved first; the oEmbed caption is the video's description,
  // and when TikTok's oEmbed refuses (it does, now and then, from server addresses) tikwm's open API fills in
  if (host.endsWith("tiktok.com")) {
    let full = url;
    if (!/\/video\/\d+/.test(u.pathname)) { try { full = (await get(url, { Accept: "text/html" })).url; } catch { /* keep the short one */ } }
    const vid = full.match(/\/video\/(\d+)/)?.[1] || "";
    let o: Record<string, any> = {}, t: Record<string, any> = {};
    try { o = await (await get("https://www.tiktok.com/oembed?url=" + encodeURIComponent(full))).json(); } catch { /* try the other one */ }
    if (!o.thumbnail_url || !o.title) {
      try { t = (await (await get("https://www.tikwm.com/api/?url=" + encodeURIComponent(full))).json())?.data || {}; } catch { /* nothing more to try */ }
    }
    const abs = (x = "") => x.startsWith("/") ? "https://www.tikwm.com" + x : x;
    const author = o.author_unique_id || t.author?.unique_id || o.author_name || "";
    const text = o.title || t.title || "";
    if (!text && !o.thumbnail_url && !t.cover) throw new Error("TikTok не ответил");
    return { title: o.author_name || t.author?.nickname || "TikTok", text, thumb: o.thumbnail_url || abs(t.origin_cover || t.cover), author, vid: vid || t.id || "", url: full,
      w: o.thumbnail_width || t.width || 0, h: o.thumbnail_height || t.height || 0 };
  }
  // oEmbed where the platform has one
  const oembed = host.endsWith("youtube.com") || host === "youtu.be" ? "https://www.youtube.com/oembed?format=json&url="
    : host.endsWith("vimeo.com") ? "https://vimeo.com/api/oembed.json?url="
    : host.endsWith("soundcloud.com") ? "https://soundcloud.com/oembed?format=json&url=" : "";
  if (oembed) {
    try {
      const d = await (await get(oembed + encodeURIComponent(url))).json();
      return { title: d.title || "", text: "", thumb: d.thumbnail_url || "", author: d.author_name || "", w: d.thumbnail_width || d.width || 0, h: d.thumbnail_height || d.height || 0 };
    } catch { /* fall through to the page itself */ }
  }
  const r = await get(url, { Accept: "text/html,application/xhtml+xml" });
  const type = r.headers.get("content-type") || "";
  if (type.startsWith("image/")) return { title: "", text: "", thumb: r.url, kind: "image" };
  if (type.startsWith("video/")) return { title: "", text: "", video: r.url, kind: "video" };
  const html = (await r.text()).slice(0, 600_000);
  return meta(html, r.url);
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url).searchParams.get("url") || (req.method === "POST" ? (await req.json()).url : "");
    if (!/^https?:\/\//i.test(url || "")) return json({ error: "нужна ссылка http(s)" }, 400);
    // public sites only
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(new URL(url).hostname)) return json({ error: "закрытый адрес" }, 400);
    return json(await unfurl(url));
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 200);
  }
});
