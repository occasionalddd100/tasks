import { useSyncExternalStore } from "react";
import { getDb, updateMany } from "@/lib/db";
import { today, addDays } from "@/lib/tasks";

// Several tasks picked at once (Shift/Ctrl-click on a computer, «Выбрать» in the wheel on the phone);
// a bar at the bottom acts on all of them.
let sel = new Set(); const subs = new Set();
const emit = () => subs.forEach(f => f());
export const useSelection = () => useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => sel);
export const selActive = () => sel.size > 0;
export const isSelected = id => sel.has(id);
export const toggleSel = id => { sel = new Set(sel); sel.has(id) ? sel.delete(id) : sel.add(id); emit(); };
export const getSel = () => sel;
// a plain click: just this one (a second click on the only picked one lets it go)
export const pickOnly = id => { sel = sel.size === 1 && sel.has(id) ? new Set() : new Set([id]); emit(); };
export const clearSel = () => { if (sel.size) { sel = new Set(); emit(); } };

// what a task (or every selected one, when it is among them) turns into when sent somewhere
export const MOVES = {
  done: () => ({ done: true, doneOn: today(), doneAt: new Date().toISOString(), doneBy: getDb().me }),
  // a date block takes the task out of «Приоритет», or it would stay there
  today: () => ({ due: today(), prio: "" }),
  tomorrow: () => ({ due: addDays(1), prio: "" }),
  planned: t => ({ prio: "", ...(t.due && t.due >= addDays(2) ? {} : { due: addDays(2) }) }),
  free: () => ({ due: "", time: "", prio: "" }),
  urgent: () => ({ prio: "urgent" }),
};
export function moveTasks(ids, k) {
  const f = MOVES[k]; if (!f) return;
  const tasks = getDb().tasks.filter(t => ids.includes(t.id));
  updateMany("tasks", tasks.map(t => [t.id, f(t)]).filter(([, x]) => Object.keys(x).length));
}
