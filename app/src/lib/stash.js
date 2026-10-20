import { sb, add, update, getDb } from "@/lib/db";

// what a link points to, from the URL alone: enough to embed the player even before the preview arrives
export function parse(raw) {
  let u; try { u = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m|mobile|music)\./, ""), path = u.pathname;
  const out = { url: u.href, host };
  let m;
  if (host === "youtu.be" && (m = path.match(/^\/([\w-]{6,})/))) return { ...out, provider: "youtube", vid: m[1] };
  if (host.endsWith("youtube.com")) {
    const v = u.searchParams.get("v") || path.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1];
    if (v) return { ...out, provider: "youtube", vid: v, vertical: path.startsWith("/shorts") };
  }
  if (/(^|\.)(x|twitter|fxtwitter|vxtwitter|fixupx)\.com$/.test(host) && (m = path.match(/status(?:es)?\/(\d+)/))) return { ...out, provider: "x", vid: m[1] };
  if (host.endsWith("tiktok.com")) return { ...out, provider: "tiktok", vid: path.match(/video\/(\d+)/)?.[1] || "", vertical: true };
  if (host.endsWith("instagram.com") && (m = path.match(/\/(p|reel|reels|tv)\/([\w-]+)/))) return { ...out, provider: "instagram", vid: m[2], vertical: m[1] !== "p" };
  if (host.endsWith("vimeo.com") && (m = path.match(/\/(\d+)/))) return { ...out, provider: "vimeo", vid: m[1] };
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) return { ...out, provider: "image" };
  if (/\.(mp4|webm|mov|m4v)$/i.test(path)) return { ...out, provider: "video" };
  return { ...out, provider: "link" };
}

// iframe player for the platforms that have one
export function embedUrl(c, autoplay) {
  const a = autoplay ? 1 : 0;
  switch (c.provider) {
    case "youtube": return `https://www.youtube-nocookie.com/embed/${c.vid}?autoplay=${a}&rel=0&playsinline=1`;
    case "tiktok": return c.vid ? `https://www.tiktok.com/player/v1/${c.vid}?autoplay=${a}&rel=0&description=0&music_info=0` : "";
    case "instagram": return `https://www.instagram.com/p/${c.vid}/embed/`;
    case "vimeo": return `https://player.vimeo.com/video/${c.vid}?autoplay=${a}`;
    default: return "";
  }
}

export const PROVIDER = {
  youtube: { name: "YouTube", color: "#ff0033" },
  x: { name: "X", color: "#000000" },
  tiktok: { name: "TikTok", color: "#25f4ee" },
  instagram: { name: "Instagram", color: "#e1306c" },
  vimeo: { name: "Vimeo", color: "#1ab7ea" },
  image: { name: "Картинка", color: "#8b5cf6" },
  video: { name: "Видео", color: "#f59e0b" },
  photo: { name: "Картинка", color: "#8b5cf6" },
  note: { name: "Заметка", color: "#64748b" },
  link: { name: "Ссылка", color: "#64748b" },
};

// title, text, preview image and the video file, fetched by the "unfurl" edge function
export async function unfurl(url) {
  const { data, error } = await sb.functions.invoke("unfurl?url=" + encodeURIComponent(url), { method: "GET" });
  if (error || data?.error) throw new Error(data?.error || error?.message || "нет превью");
  return data;
}

const topOrder = (stash, tab) => Math.min(0, ...getDb().clips.filter(c => c.stash === stash && c.tab === tab).map(c => c.order ?? 0)) - 1;

// a new card goes on top right away; its preview fills in when the server answers
export async function addLink(stash, tab, raw) {
  const p = parse(raw);
  if (!p) return addText(stash, tab, raw);
  const id = await add("clips", { stash, tab, ...p, title: "", text: "", thumb: p.provider === "image" ? p.url : "", video: p.provider === "video" ? p.url : "",
    desc: "", note: "", tags: [], order: topOrder(stash, tab), added: new Date().toISOString(), loading: !["image", "video"].includes(p.provider) });
  if (id && !["image", "video"].includes(p.provider)) refresh(id, p.url);
  return id;
}

export async function refresh(id, url) {
  try {
    const d = await unfurl(url);
    const fields = { loading: false, title: d.title || "", text: d.text || "", thumb: d.thumb || "", video: d.video || "", photos: d.photos || [], author: d.author || "", w: d.w || 0, h: d.h || 0 };
    if (d.kind === "image") fields.provider = "image";
    if (d.kind === "video") fields.provider = "video";
    await update("clips", id, fields);
  } catch { await update("clips", id, { loading: false }); }
}

export const addText = (stash, tab, text) => add("clips", { stash, tab, provider: "note", url: "", title: "", text: text.trim(), desc: "", note: "", tags: [], order: topOrder(stash, tab), added: new Date().toISOString() });
export const addPhoto = (stash, tab, photo) => add("clips", { stash, tab, provider: "photo", url: "", photo, title: "", text: "", desc: "", note: "", tags: [], order: topOrder(stash, tab), added: new Date().toISOString(), w: photo.w, h: photo.h });

export const linksIn = text => [...new Set(text.match(/https?:\/\/[^\s<>"']+/g) || [])];
