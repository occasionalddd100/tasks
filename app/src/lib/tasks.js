export const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
export const WD = ["вс","пн","вт","ср","чт","пт","сб"];
export const today = () => new Date().toLocaleDateString("sv-SE");
export const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
export const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
export const byOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999);
export const nextOrder = arr => Math.max(0, ...arr.map(x => x.order || 0)) + 1;

// done before today: hidden from boards, still shown in the journal via doneOn
export const stale = t => t.done && t.doneOn && t.doneOn < today();
// dated tasks due within the next 7 days (or overdue) move into the "На неделе" card
export const inWeek = t => t.due && t.due <= addDays(6);

export function dueLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number), k = dayDiff(today(), iso);
  if (k === 0) return "сегодня"; if (k === 1) return "завтра";
  return WD[new Date(y, m - 1, d).getDay()] + " " + d + (k > 6 || k < 0 ? "." + String(m).padStart(2, "0") : "");
}
export function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number), dt = new Date(y, m - 1, d);
  const label = d + " " + MONTHS[m - 1] + ", " + WD[dt.getDay()];
  return iso === today() ? "Сегодня · " + label : label;
}
export function plural(n, [one, few, many]) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many;
}

// recurring: due when never done or `every` days have passed since lastDone
export const EVERY = { 1: "каждый день", 2: "через день", 7: "раз в неделю" };
export const habitDue = h => !h.lastDone || dayDiff(h.lastDone, today()) >= (h.every || 1);
