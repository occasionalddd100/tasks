import { useSyncExternalStore } from "react";

// The Фокус timer lives outside the view: it keeps running when the focus window closes (a small floating
// window shows it then), survives a reload, and only starts over when you stop it. 25 minutes a round.
export const TOTAL = 25 * 60;
const KEY = "zenTimer";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
let st = load() || { end: 0, left: TOTAL }; // end: ms while running, 0 while paused
const subs = new Set();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
const emit = () => { snap = null; subs.forEach(f => f()); };
let snap = null, tick = 0;

const leftNow = () => (st.end ? Math.max(0, Math.round((st.end - Date.now()) / 1000)) : st.left);
function loop() {
  clearInterval(tick);
  if (!st.end) return;
  tick = setInterval(() => {
    if (leftNow() === 0) { st = { end: 0, left: 0 }; save(); clearInterval(tick); ring(); }
    emit();
  }, 500);
}
function ring() {
  navigator.vibrate?.([200, 100, 200]);
  if ("Notification" in window && Notification.permission === "granted") new Notification("25 минут прошли", { body: "Отметь, что сделал, или возьми ещё круг" });
}
loop();

export const timer = {
  start: () => { st = { end: Date.now() + (st.left || TOTAL) * 1000, left: st.left || TOTAL }; save(); loop(); emit(); },
  pause: () => { st = { end: 0, left: leftNow() }; save(); loop(); emit(); },
  toggle: () => (st.end ? timer.pause() : timer.start()),
  stop: () => { st = { end: 0, left: TOTAL }; save(); loop(); emit(); },
};

export function useZenTimer() {
  const s = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => {
    if (!snap) { const left = leftNow(); snap = { left, running: !!st.end, total: TOTAL, active: !!st.end || left < TOTAL, label: String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0") }; }
    return snap;
  });
  return { ...s, toggle: timer.toggle, stop: timer.stop };
}
