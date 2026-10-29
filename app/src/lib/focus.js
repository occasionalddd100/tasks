import { getDb, update, updateMany, put } from "@/lib/db";
import { tagsOf } from "@/lib/tags";
import { draftsOf } from "@/lib/personal";
import { today } from "@/lib/tasks";

// My open tasks of «Личное» (its tags and drafts): top level, not put aside, not someone else's.
// The home screen splits them by when (overdue, priority, today, tomorrow, planned, no date).
export function openList(db) {
  const mine = new Set([draftsOf(db)?.id, ...tagsOf(db).map(t => t.id)]);
  return db.tasks.filter(t => mine.has(t.cat) && !t.done && !t.hidden && !t.parent && !inBucket(t) && t.text?.trim() && (!t.assignee || t.assignee === db.me));
}
// what is on for today: overdue, due today, urgent
export const isNow = (t, now = today()) => (t.due && t.due <= now) || t.prio === "urgent" || t.prio === "today";
export const nowList = db => openList(db).filter(t => isNow(t)).sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || (a.time || "9").localeCompare(b.time || "9"));

// Фокус: tasks from any project picked for "now". A task stays where it lives and gets `focus`
// (its place in the list); null takes it out. The sprint lives in prefs: { start } while it runs.
// `focus` sits on the task itself, and a shared board's task is seen by everyone on it, so it also says whose work it is
// (`focusBy`; older marks belong to the task's owner). Someone else's «В работе» is not mine.
export const inFocus = t => typeof t?.focus === "number" && (t.focusBy || t._owner) === getDb().me;
const prefsId = () => getDb().me + ":prefs";
export const getSprint = db => db.prefs.find(p => p.id === db.me + ":prefs")?.sprint || null;

// done tasks stay in the list (crossed out) until the sprint is finished or they are cleared
export const focusList = db => db.tasks.filter(inFocus).sort((a, b) => a.focus - b.focus);
export const focusOpen = db => focusList(db).filter(t => !t.done).length;

export function toFocus(t) {
  const max = Math.max(0, ...getDb().tasks.filter(inFocus).map(x => x.focus));
  update("tasks", t.id, { focus: max + 1, focusBy: getDb().me, parked: null, parkedBy: "" });
}

// Ведёрко: work put aside for later. `parked` is when it went in; like `focus`, it is mine only.
export const inBucket = t => typeof t?.parked === "number" && !t.done && (t.parkedBy || t._owner) === getDb().me;
export const bucketList = db => db.tasks.filter(inBucket).sort((a, b) => b.parked - a.parked);
export const toBucket = t => update("tasks", t.id, { focus: null, focusBy: "", parked: Date.now(), parkedBy: getDb().me });
export const fromBucket = t => update("tasks", t.id, { parked: null, parkedBy: "" });
export const fromFocus = t => update("tasks", t.id, { focus: null, focusBy: "" });
export const nextFocus = () => Math.max(0, ...getDb().tasks.filter(inFocus).map(x => x.focus)) + 1;

export const startSprint = () => put("prefs", prefsId(), { sprint: { start: new Date().toISOString() } });

// close the sprint: done tasks leave the list, the rest stays for the next one
export function finishSprint() {
  const db = getDb(), list = focusList(db), done = list.filter(t => t.done);
  updateMany("tasks", done.map(t => [t.id, { focus: null }]));
  put("prefs", prefsId(), { sprint: null });
  return { done: done.length, total: list.length };
}
export function clearDone() {
  updateMany("tasks", focusList(getDb()).filter(t => t.done).map(t => [t.id, { focus: null }]));
}

// where a task lives, for the small label under it: "Проект · Вкладка"
export function placeOf(db, t) {
  const c = db.cats.find(x => x.id === t.cat), b = c && db.boards.find(x => x.id === c.board), p = b && db.projects.find(x => x.id === b.project);
  return [p?.name || "Без названия", b?.name].filter(Boolean).join(" · ");
}
