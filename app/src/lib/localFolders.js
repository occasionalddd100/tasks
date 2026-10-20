import { useEffect, useReducer } from "react";
import { getDb, update } from "@/lib/db";

// a folder on this computer linked to a stash (Chrome/Edge/Brave with the flag: File System Access API).
// Nothing from the folder goes to the cloud by itself: the folder opens in its own viewer, and only the
// pictures picked there are uploaded as stash cards. The handle, thumbnails and tags of local files stay
// in this browser's IndexedDB.
export const canUseFolders = typeof window !== "undefined" && "showDirectoryPicker" in window;

const DB = "stash-folders", STORE = "handles", TAGS = "tags";
let dbp = null;
const idb = () => dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open(DB, 2);
  r.onupgradeneeded = () => { for (const n of [STORE, TAGS]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (store, mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
const getHandle = id => tx(STORE, "readonly", s => s.get(id));
const setHandle = (id, h) => tx(STORE, "readwrite", s => s.put(h, id));

// tags of local files: per folder, { path: [tags] }, only on this device
export const loadTags = async source => (await tx(TAGS, "readonly", s => s.get(source)).catch(() => null)) || {};
export const saveTags = (source, map) => tx(TAGS, "readwrite", s => s.put(map, source));

const handles = new Map(), files = new Map(), listeners = new Set();
const ping = () => listeners.forEach(f => f());
export function useFolders() { const [, t] = useReducer(x => x + 1, 0); useEffect(() => (listeners.add(t), () => listeners.delete(t)), []); }

async function handle(source) {
  if (!handles.has(source)) handles.set(source, (await getHandle(source).catch(() => null)) || null);
  return handles.get(source);
}
// "granted" | "prompt" | "missing" (the folder was added on another device or browser)
export async function access(source) {
  const h = await handle(source);
  if (!h) return "missing";
  return (await h.queryPermission({ mode: "read" })) === "granted" ? "granted" : "prompt";
}
export async function allow(source) {
  const h = await handle(source);
  const ok = h && (await h.requestPermission({ mode: "read" })) === "granted";
  ping();
  return ok;
}

const MEDIA = /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|mp4|webm|mov|m4v)$/i;
async function* walk(dir, prefix = "", depth = 0) {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith(".")) continue;
    if (h.kind === "directory") { if (depth < 6) yield* walk(h, prefix + name + "/", depth + 1); }
    else if (MEDIA.test(name)) yield { path: prefix + name, h };
  }
}

// every picture and video in the folder (subfolders too), newest first; kept for the session
const listings = new Map();
export async function listFiles(source, force) {
  if (listings.has(source) && !force) return listings.get(source);
  const dir = await handle(source);
  if (!dir || (await dir.queryPermission({ mode: "read" })) !== "granted") return null;
  const out = [];
  for await (const { path, h } of walk(dir)) out.push({ path, h, name: path.split("/").at(-1), dir: path.split("/").slice(0, -1).join("/"), video: /\.(mp4|webm|mov|m4v)$/i.test(path) });
  // dates need the files; read them in chunks so the page stays responsive
  for (let i = 0; i < out.length; i += 200) {
    await Promise.all(out.slice(i, i + 200).map(async e => { try { const f = await e.h.getFile(); e.size = f.size; e.mtime = f.lastModified; } catch {} }));
    await new Promise(r => setTimeout(r));
  }
  out.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  listings.set(source, out);
  return out;
}

// small previews made on the device: a 320px picture, or the first frame of a video
const thumbs = new Map(); let running = 0; const waiting = [];
const slot = () => new Promise(r => { if (running < 4) { running++; r(); } else waiting.push(r); });
const free = () => { const n = waiting.shift(); n ? n() : running--; };
export function thumbOf(e) {
  const key = e.path;
  if (!thumbs.has(key)) thumbs.set(key, (async () => {
    await slot();
    try {
      const f = await e.h.getFile();
      if (e.video) return await videoFrame(f);
      const bmp = await createImageBitmap(f, { resizeWidth: 320, resizeQuality: "medium" });
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0); bmp.close();
      return URL.createObjectURL(await new Promise(r => c.toBlob(r, "image/webp", 0.75)));
    } catch { return ""; } finally { free(); }
  })());
  return thumbs.get(key);
}
function videoFrame(f) {
  return new Promise(res => {
    const url = URL.createObjectURL(f), v = document.createElement("video");
    const done = out => { v.removeAttribute("src"); v.load(); URL.revokeObjectURL(url); res(out); };
    v.muted = true; v.playsInline = true; v.preload = "auto";
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
    v.onseeked = () => {
      const k = 320 / (v.videoWidth || 320), c = document.createElement("canvas");
      c.width = 320; c.height = Math.round((v.videoHeight || 180) * k);
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(b => done(b ? URL.createObjectURL(b) : ""), "image/webp", 0.75);
    };
    v.onerror = () => done("");
    setTimeout(() => done(""), 8000);
    v.src = url;
  });
}

export async function addFolder(stash, tab) {
  const dir = await window.showDirectoryPicker({ id: "stash", mode: "read" });
  const s = getDb().stashes.find(x => x.id === stash);
  const id = Math.random().toString(36).slice(2, 10);
  await setHandle(id, dir); handles.set(id, dir);
  await update("stashes", stash, { sources: [...(s?.sources || []), { id, name: dir.name }] });
  ping();
  return { id, name: dir.name };
}

// a blob link for a file of a local card, or why there is none
export async function fileUrl(c) {
  const key = c.source + "/" + c.path;
  if (files.has(key)) return files.get(key);
  const state = await access(c.source);
  if (state !== "granted") return { state };
  try {
    let h = await handle(c.source);
    const parts = c.path.split("/");
    for (const p of parts.slice(0, -1)) h = await h.getDirectoryHandle(p);
    const url = URL.createObjectURL(await (await h.getFileHandle(parts.at(-1))).getFile());
    files.set(key, { url }); return { url };
  } catch { return { state: "gone" }; }
}
