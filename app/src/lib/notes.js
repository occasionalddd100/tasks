import { add, getDb, remove } from "@/lib/db";

const byName = (a, b) => (a.name || a.title || "").localeCompare(b.name || b.title || "", "ru", { numeric: true });

// a folder or note sits at the root when its parent is missing or not visible to me
export function tree(folders, notes) {
  const fids = new Set(folders.map(f => f.id));
  const kids = new Map(), files = new Map();
  for (const f of folders) {
    const p = f.parent && fids.has(f.parent) ? f.parent : "";
    if (!kids.has(p)) kids.set(p, []); kids.get(p).push(f);
  }
  for (const n of notes) {
    const p = n.folder && fids.has(n.folder) ? n.folder : "";
    if (!files.has(p)) files.set(p, []); files.get(p).push(n);
  }
  kids.forEach(l => l.sort(byName)); files.forEach(l => l.sort(byName));
  return { folders: p => kids.get(p) || [], notes: p => files.get(p) || [] };
}

export function folderPath(folders, id) {
  const out = [], seen = new Set();
  for (let f = folders.find(x => x.id === id); f && !seen.has(f.id); f = folders.find(x => x.id === f.parent)) { seen.add(f.id); out.unshift(f); }
  return out;
}

export function descendants(folders, id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const f of folders) if (f.parent === out[i] && !out.includes(f.id)) out.push(f.id);
  return out;
}

export const newNote = (folder = "") => add("notes", { title: "", body: "", folder, updated: new Date().toISOString() });
export const newFolder = (parent = "", name = "Новая папка") => add("folders", { name, parent });

export async function deleteFolder(id) {
  const { folders, notes } = getDb();
  const ids = descendants(folders, id);
  const nids = notes.filter(n => ids.includes(n.folder)).map(n => n.id);
  if (nids.length) await remove("notes", nids);
  await remove("folders", ids.reverse());
}
