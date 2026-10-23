import { getDb, updateMany } from "@/lib/db";
import { byOrder } from "@/lib/tasks";
import { personalOf, draftsOf } from "@/lib/personal";
import { descendantsOf } from "@/components/tasks/TaskRow";

// A tag is a board (a project): putting #работа on a task drops it into that board's first column.
// "Личное" comes first; a task with no tag goes to its "Черновики".
const slug = s => (s || "").toLowerCase().replace(/\s+/g, "");

export function tagsOf(db) {
  const mine = personalOf(db);
  const list = db.projects.filter(p => !p.archived && firstCat(db, p.id))
    .sort((a, b) => (b === mine) - (a === mine) || (a.name || "").localeCompare(b.name || "", "ru"));
  return list.map(p => ({ id: p.id, name: p.name || "Без названия", color: p.color || "", personal: p === mine }));
}

// the column a new task with this tag lands in: the first board's first column (not the drafts)
export function firstCat(db, projectId) {
  const boards = db.boards.filter(b => b.project === projectId).sort(byOrder);
  for (const b of boards) { const c = db.cats.filter(c => c.board === b.id && !c.drafts).sort(byOrder)[0]; if (c) return c; }
  return null;
}

export function tagOfTask(db, t) {
  const c = db.cats.find(x => x.id === t.cat), b = c && db.boards.find(x => x.id === c.board);
  return b ? { project: b.project, drafts: !!c.drafts } : null;
}

// "#дом купить молоко" → { text: "купить молоко", tag: <Дом> }; the word only has to start the tag's name
export function parseTag(text, tags) {
  let tag = null;
  const rest = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (m, sp, w) => {
    const hit = tags.find(t => slug(t.name) === slug(w)) || tags.find(t => slug(t.name).startsWith(slug(w)));
    if (hit && !tag) { tag = hit; return sp; }
    return m;
  });
  return { text: rest.replace(/\s{2,}/g, " ").trim(), tag };
}

// where a new task goes: the tag's first column, or the personal drafts
export function targetCat(tagId) {
  const db = getDb();
  if (tagId) { const c = firstCat(db, tagId); if (c) return c.id; }
  return draftsOf(db)?.id || null;
}

// retag: the task and its subtasks move to the tag's first column; already on that board → stays put
export function setTag(t, tagId) {
  const db = getDb(), cur = tagOfTask(db, t);
  if (cur?.project === tagId && !cur.drafts) return;
  const cat = targetCat(tagId); if (!cat || cat === t.cat) return;
  updateMany("tasks", [t.id, ...descendantsOf(t.id)].map(id => [id, { cat, ...(id === t.id ? { parent: "" } : {}) }]));
}
