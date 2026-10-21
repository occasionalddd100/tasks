import { add, getDb, put } from "@/lib/db";
import { byOrder } from "@/lib/tasks";

// Everyone has one personal project ("Личное", flag `personal`) with a "Черновики" category (flag `drafts`):
// tasks thrown in on the fly from anywhere, sorted into categories later.
// New ones get ids derived from the user, so two devices starting at once create the same docs, not two.
export const personalOf = db => db.projects.find(p => p.personal && p._owner === db.me) || null;
export function draftsOf(db) {
  const p = personalOf(db); if (!p) return null;
  const boards = new Set(db.boards.filter(b => b.project === p.id).map(b => b.id));
  return db.cats.find(c => c.drafts && boards.has(c.board)) || null;
}
export const draftTasks = db => { const c = draftsOf(db); return c ? db.tasks.filter(t => t.cat === c.id && !t.done && !t.parent).sort(byOrder) : []; };

let busy = false;
export async function ensurePersonal() {
  const db = getDb();
  if (busy || !db.ready || db.error || !db.me) return;
  busy = true;
  try {
    let p = personalOf(db);
    if (!p) {
      const id = db.me + ":personal";
      await put("projects", id, { name: "Личное", personal: true, folder: "" });
      p = { id };
    }
    if (!draftsOf(getDb())) {
      let board = getDb().boards.filter(b => b.project === p.id).sort(byOrder)[0];
      if (!board) { await put("boards", db.me + ":personal:main", { name: "Главное", project: p.id, order: 1 }); board = { id: db.me + ":personal:main" };
        await put("cats", db.me + ":personal:tasks", { name: "Задачи", board: board.id, order: 1 }); }
      await put("cats", db.me + ":drafts", { name: "Черновики", board: board.id, order: 0, drafts: true });
    }
  } finally { busy = false; }
}

// a new draft goes on top of the list
export async function addDraft(text, extra = {}) {
  const t = text.trim(); if (!t) return null;
  if (!draftsOf(getDb())) await ensurePersonal();
  const cat = draftsOf(getDb()); if (!cat) return null;
  const top = Math.min(1, ...getDb().tasks.filter(x => x.cat === cat.id).map(x => x.order ?? 1));
  return add("tasks", { text: t, cat: cat.id, order: top - 1, done: false, ...extra });
}
