import { useEffect, useReducer } from "react";
import { sb, getDb } from "@/lib/db";

// journal photos live in the private Supabase Storage bucket "journal" under <user id>/<date>/,
// shrunk on the device to webp (long side 1600px) so a photo is ~150–400 KB
const BUCKET = "journal";

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => res(img); img.onerror = () => rej(new Error("Не удалось открыть картинку"));
    img.src = url;
  });
}

async function shrink(file, max = 1600) {
  if (file.type === "image/gif") return { blob: file, w: 0, h: 0 };
  const img = await (window.createImageBitmap ? createImageBitmap(file).catch(() => loadImage(file)) : loadImage(file));
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, "image/webp", 0.82));
  return { blob: blob || file, w, h };
}

// signed links, fetched in batches and kept for the session
const urls = new Map(), listeners = new Set();
let queue = new Set(), timer = null;
async function flush() {
  const list = [...queue]; queue = new Set(); timer = null;
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(list, 60 * 60 * 24);
  for (const d of data || []) if (d.signedUrl) urls.set(d.path, d.signedUrl);
  listeners.forEach(f => f());
}
function want(path) {
  if (!path || urls.has(path) || queue.has(path)) return;
  queue.add(path); timer ??= setTimeout(flush, 30);
}

export function usePhotoUrl(path) {
  const [, tick] = useReducer(x => x + 1, 0);
  useEffect(() => { listeners.add(tick); want(path); return () => { listeners.delete(tick); }; }, [path]);
  return urls.get(path);
}

export async function uploadPhoto(file, date) {
  if (!file.type.startsWith("image/")) throw new Error("Это не картинка");
  const { blob, w, h } = await shrink(file);
  const ext = blob.type === "image/gif" ? "gif" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${getDb().me}/${date}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw error;
  urls.set(path, URL.createObjectURL(blob));
  return { path, w, h };
}

export const deletePhoto = path => sb.storage.from(BUCKET).remove([path]);
