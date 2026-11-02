import { useSyncExternalStore } from "react";
import { add, getDb } from "@/lib/db";

// Фокус: a working session on a few picked tasks. Time is split into stretches:
// work, break (pressed «Перерыв») and away (no keyboard or mouse for AWAY_MIN minutes).
// The running session lives in localStorage (survives a reload); when it ends it is saved
// as a «focus» doc: when, which tasks, how long worked / rested / was away, and the stretches.
const KEY = "focusSession";
export const AWAY_MIN = 5;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
let s = load(); // { ids, texts, start, parts: [{ k, from, to }], cur: { k, from }, open }
const subs = new Set();
const save = () => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {} };
let snap = null;
const emit = () => { snap = null; save(); subs.forEach(f => f()); };

const close = (at = Date.now()) => { if (s?.cur) { if (at > s.cur.from) s.parts.push({ k: s.cur.k, from: s.cur.from, to: at }); s.cur = null; } };
const switchTo = (k, at = Date.now()) => { close(at); s.cur = { k, from: at }; };

export function totals(parts, cur, now = Date.now()) {
  const t = { work: 0, break: 0, away: 0 };
  for (const p of parts) t[p.k] += p.to - p.from;
  if (cur) t[cur.k] += now - cur.from;
  return t;
}

// the tasks with their subtasks
function withKids(ids) {
  const all = getDb().tasks, out = new Set(ids);
  let grew = true;
  while (grew) { grew = false; for (const t of all) if (t.parent && out.has(t.parent) && !out.has(t.id) && !t.done) { out.add(t.id); grew = true; } }
  return [...out];
}

export const focus = {
  start(ids) {
    if (!ids.length) return;
    if (s) { s.ids = [...new Set([...s.ids, ...withKids(ids)])]; s.open = true; emit(); return; }
    const all = withKids(ids), db = getDb();
    s = { ids: all, texts: Object.fromEntries(db.tasks.filter(t => all.includes(t.id)).map(t => [t.id, t.text])), start: Date.now(), parts: [], cur: { k: "work", from: Date.now() }, open: true };
    emit();
  },
  pause() { if (s && s.cur?.k === "work") { switchTo("break"); emit(); } },
  resume() { if (s && s.cur?.k !== "work") { switchTo("work"); emit(); } },
  toggleBreak() { s?.cur?.k === "work" ? focus.pause() : focus.resume(); },
  // no input since `since`: that stretch was away, not work
  away(since) { if (s && s.cur?.k === "work") { switchTo("away", Math.max(since, s.cur.from)); emit(); } },
  back() { if (s && s.cur?.k === "away") { const was = Date.now() - s.cur.from; switchTo("work"); emit(); return was; } return 0; },
  show(v = true) { if (s) { s.open = v; emit(); } },
  async end() {
    if (!s) return null;
    close();
    const t = totals(s.parts, null), db = getDb();
    const doc = {
      start: new Date(s.start).toISOString(), end: new Date().toISOString(), day: new Date(s.start).toLocaleDateString("sv-SE"),
      tasks: s.ids, texts: s.ids.map(id => db.tasks.find(x => x.id === id)?.text || s.texts?.[id] || ""),
      done: s.ids.filter(id => db.tasks.find(x => x.id === id)?.done).length,
      work: t.work, break: t.break, away: t.away,
      parts: s.parts.map(p => [p.k[0], Math.round((p.from - s.start) / 1000), Math.round((p.to - p.from) / 1000)]),
    };
    s = null; emit();
    if (doc.work + doc.break + doc.away > 30e3) { try { await add("focus", doc); } catch {} }
    return doc;
  },
  cancel() { s = null; emit(); },
};

export function useFocusSession() {
  return useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => (snap ??= s ? { ...s } : null));
}

// time as «1:05:09» / «25:09»
export const clock = ms => {
  const x = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), sec = x % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(sec).padStart(2, "0");
};
// «2 ч 10 мин», «35 мин»
export const dur = ms => {
  const m = Math.round(ms / 60e3), h = Math.floor(m / 60);
  return h ? h + " ч" + (m % 60 ? " " + (m % 60) + " мин" : "") : m + " мин";
};
