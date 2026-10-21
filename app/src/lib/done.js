import { getDb, put } from "@/lib/db";
import { today } from "@/lib/tasks";

// "Что сделал" entries live in the day doc (`extra`). Old ones are plain strings; new ones carry the moment they were written,
// so they can stand on the day's timeline.
export const exText = e => (typeof e === "string" ? e : e?.text || "");
export const exAt = e => (typeof e === "string" ? null : e?.at || null);
const dayId = date => getDb().me + ":" + date;

export function addDone(text, date = today()) {
  const v = text.trim(); if (!v) return;
  const cur = getDb().days.find(d => d.id === dayId(date))?.extra || [];
  return put("days", dayId(date), { date, extra: [...cur, date === today() ? { text: v, at: new Date().toISOString() } : v] });
}
export function removeDone(date, k) {
  const cur = getDb().days.find(d => d.id === dayId(date))?.extra || [];
  return put("days", dayId(date), { date, extra: cur.filter((_, i) => i !== k) });
}
