import { useSyncExternalStore } from "react";

// how the app looks on this device; kept in localStorage and applied before the first paint
const KEY = "appearance";
export const DEFAULTS = { theme: "system", accent: "sky", scale: 100, motion: "on", sidebar: "normal" };
export const ACCENTS = {
  sky: ["oklch(0.52 0.12 232)", "oklch(0.74 0.1 220)"],
  violet: ["oklch(0.52 0.18 290)", "oklch(0.75 0.13 290)"],
  rose: ["oklch(0.56 0.19 12)", "oklch(0.75 0.13 12)"],
  amber: ["oklch(0.6 0.15 65)", "oklch(0.8 0.13 75)"],
  emerald: ["oklch(0.55 0.13 160)", "oklch(0.77 0.13 160)"],
  slate: ["oklch(0.45 0.03 260)", "oklch(0.8 0.02 260)"],
};

let cur = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULTS }; } })();
const subs = new Set();
const mq = window.matchMedia("(prefers-color-scheme: dark)");

export function apply() {
  const root = document.documentElement;
  const dark = cur.theme === "dark" || (cur.theme === "system" && mq.matches);
  root.classList.toggle("dark", dark);
  const [l, d] = ACCENTS[cur.accent] || ACCENTS.sky;
  root.style.setProperty("--ink", dark ? d : l);
  root.style.fontSize = cur.scale === 100 ? "" : cur.scale + "%";
  root.dataset.sidebar = cur.sidebar;
}
mq.addEventListener("change", apply);

export function setAppearance(patch) {
  cur = { ...cur, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {}
  apply(); subs.forEach(f => f());
}
export const useAppearance = () => useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => cur);
