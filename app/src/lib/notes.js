import { add, getDb, remove } from "@/lib/db";

const label = x => x.name || x.title || "";
const byName = (a, b) => label(a).localeCompare(label(b), "ru", { numeric: true });

// folders hold notes and task projects; an item sits at the root when its folder is missing or not visible to me
export function tree(folders, notes, projects) {
  const fids = new Set(folders.map(f => f.id));
  const kids = new Map(), files = new Map();
  const put = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const f of folders) put(kids, f.parent && fids.has(f.parent) ? f.parent : "", f);
  for (const n of notes) put(files, n.folder && fids.has(n.folder) ? n.folder : "", { ...n, kind: "note" });
  for (const b of projects) put(files, b.folder && fids.has(b.folder) ? b.folder : "", { ...b, kind: "project" });
  // folders keep a manual order once dragged; the rest follow by name
  kids.forEach(l => l.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || byName(a, b)));
  files.forEach(l => l.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "project" ? -1 : 1) || byName(a, b)));
  return { folders: p => kids.get(p) || [], files: p => files.get(p) || [] };
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
// a project holds tabs (boards), a tab holds categories of tasks
export async function newProject(folder = "") {
  const id = await add("projects", { name: "Новый проект", folder });
  if (id) await newTab(id, "Главное", 1);
  return id;
}
export async function newTab(project, name, order) {
  const id = await add("boards", { name, project, order });
  if (id) await add("cats", { name: "Задачи", board: id, order: 1 });
  return id;
}

// tabs go with their categories and open tasks; done tasks stay for the journal
export async function deleteTab(ids) {
  ids = [].concat(ids);
  const { cats, tasks } = getDb();
  const cids = cats.filter(c => ids.includes(c.board)).map(c => c.id);
  const open = tasks.filter(t => cids.includes(t.cat) && !t.done).map(t => t.id);
  if (open.length) await remove("tasks", open);
  if (cids.length) await remove("cats", cids);
  if (ids.length) await remove("boards", ids);
}
export async function deleteProject(id) {
  await deleteTab(getDb().boards.filter(b => b.project === id).map(b => b.id));
  await remove("projects", id);
}

export async function deleteFolder(id) {
  const { folders, notes, projects } = getDb();
  const ids = descendants(folders, id);
  const nids = notes.filter(n => ids.includes(n.folder)).map(n => n.id);
  for (const p of projects.filter(p => ids.includes(p.folder))) await deleteProject(p.id);
  if (nids.length) await remove("notes", nids);
  await remove("folders", ids.reverse());
}

export function folderStats(id) {
  const { folders, notes, projects } = getDb();
  const ids = descendants(folders, id);
  return { folders: ids.length - 1, notes: notes.filter(n => ids.includes(n.folder)).length, projects: projects.filter(b => ids.includes(b.folder)).length };
}
