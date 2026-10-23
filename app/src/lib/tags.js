import { add, getDb, remove, update, updateMany } from "@/lib/db";
import { byOrder, nextOrder } from "@/lib/tasks";
import { personalOf, draftsOf } from "@/lib/personal";
import { pastel, PASTELS } from "@/lib/colors";
import { descendantsOf } from "@/components/tasks/TaskRow";

// Tags are the categories of "Личное"; its tabs group them (Главное, Витуб, …).
// A task with no tag waits in "Черновики". Projects (shared boards) are not tags: tasks are added there on their board.
const slug = s => (s || "").toLowerCase().replace(/\s+/g, "");

export function tagGroups(db) {
  const p = personalOf(db); if (!p) return [];
  let i = 0;
  return db.boards.filter(b => b.project === p.id).sort(byOrder).map(b => ({
    id: b.id, name: b.name,
    // a tag with no colour of its own still gets one, so tags never blur together
    tags: db.cats.filter(c => c.board === b.id && !c.drafts).sort(byOrder)
      .map(c => ({ id: c.id, name: c.name, group: b.name, groupId: b.id, key: c.color || "", color: pastel(c.color) || PASTELS[i++ % PASTELS.length].c })),
  }));
}
export const tagsOf = db => tagGroups(db).flatMap(g => g.tags);

// the task's tag, or null for drafts and for tasks on other boards
export function tagOfTask(db, t) {
  const tags = tagsOf(db);
  return tags.find(x => x.id === t.cat) || null;
}
export const isPersonal = (db, t) => !!tagOfTask(db, t) || t.cat === draftsOf(db)?.id;

// "#дом купить молоко" → { text: "купить молоко", tag: <дом> }; the word only has to start the tag's name
export function parseTag(text, tags) {
  let tag = null;
  const rest = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (m, sp, w) => {
    const hit = tags.find(t => slug(t.name) === slug(w)) || tags.find(t => slug(t.name).startsWith(slug(w)));
    if (hit && !tag) { tag = hit; return sp; }
    return m;
  });
  return { text: rest.replace(/\s{2,}/g, " ").trim(), tag };
}

export const targetCat = tagId => tagId || draftsOf(getDb())?.id || null;

// retag: the task and its subtasks move to that category; null = back to drafts
export function setTag(t, tagId) {
  const cat = targetCat(tagId); if (!cat || cat === t.cat) return;
  updateMany("tasks", [t.id, ...descendantsOf(t.id)].map(id => [id, { cat, ...(id === t.id ? { parent: "" } : {}) }]));
}

// editing
export const renameTag = (id, name) => name.trim() && update("cats", id, { name: name.trim() });
export const colorTag = (id, color) => update("cats", id, { color });
export const moveTag = (id, groupId) => { const db = getDb(); update("cats", id, { board: groupId, order: nextOrder(db.cats.filter(c => c.board === groupId)) }); };
// the tabs of «Личное» are kept in the data but not shown: a new tag goes to the first one
export function addTag(name, groupId = tagGroups(getDb())[0]?.id) {
  const db = getDb(), n = name.trim(); if (!n || !groupId) return null;
  return add("cats", { name: n, board: groupId, order: nextOrder(db.cats.filter(c => c.board === groupId && !c.drafts)) });
}
// a deleted tag's tasks go back to the drafts, nothing is lost
export function deleteTag(id) {
  const db = getDb(), drafts = draftsOf(db)?.id; if (!drafts) return;
  const ids = db.tasks.filter(t => t.cat === id).map(t => t.id);
  if (ids.length) updateMany("tasks", ids.map(x => [x, { cat: drafts }]));
  remove("cats", id);
}
export function addGroup(name) {
  const db = getDb(), p = personalOf(db), n = name.trim(); if (!p || !n) return null;
  return add("boards", { name: n, project: p.id, order: nextOrder(db.boards.filter(b => b.project === p.id)) });
}
export const renameGroup = (id, name) => name.trim() && update("boards", id, { name: name.trim() });
