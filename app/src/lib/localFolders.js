import { useEffect, useReducer } from "react";
import { addMany, getDb, update } from "@/lib/db";

// a folder on this computer as a stash source (Chrome/Edge: File System Access API).
// The folder handle lives in this browser's IndexedDB; cards (tags, notes, order) sync like any other card,
// the files themselves are read from disk and only show on the device that has the folder.
export const canUseFolders = typeof window !== "undefined" && "showDirectoryPicker" in window;

const DB = "stash-folders", STORE = "handles";
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
const getHandle = id => tx("readonly", s => s.get(id));
const setHandle = (id, h) => tx("readwrite", s => s.put(h, id));

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

// cards for files not in the stash yet; tags come from subfolder names
export async function scan(stash, source, tab) {
  const dir = await handle(source);
  if (!dir || (await dir.queryPermission({ mode: "read" })) !== "granted") return 0;
  const have = new Set(getDb().clips.filter(c => c.stash === stash && c.source === source).map(c => c.path));
  const add = [];
  let order = Math.min(0, ...getDb().clips.filter(c => c.stash === stash && c.tab === tab).map(c => c.order ?? 0));
  for await (const { path, h } of walk(dir)) {
    if (have.has(path)) continue;
    const f = await h.getFile();
    const tags = path.split("/").slice(0, -1).map(t => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean);
    add.push({ stash, tab, provider: "local", source, path, title: "", text: "", name: f.name, size: f.size, mtime: f.lastModified,
      video: /\.(mp4|webm|mov|m4v)$/i.test(f.name), desc: "", note: "", tags, order: --order, added: new Date(f.lastModified || Date.now()).toISOString() });
  }
  await addMany("clips", add);
  return add.length;
}

export async function addFolder(stash, tab) {
  const dir = await window.showDirectoryPicker({ id: "stash", mode: "read" });
  const s = getDb().stashes.find(x => x.id === stash);
  const id = Math.random().toString(36).slice(2, 10);
  await setHandle(id, dir); handles.set(id, dir);
  await update("stashes", stash, { sources: [...(s?.sources || []), { id, name: dir.name, tab }] });
  return { id, n: await scan(stash, id, tab), name: dir.name };
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
