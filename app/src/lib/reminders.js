import { inFocus } from "@/lib/focus";

// Smart reminders, one plan for every device (Android notifications, an open tab, Пшик on the PC):
// · the evening before (20:00): what is due tomorrow, with times
// · the morning of (08:30): today's plan, timed things first; overdue ones listed too
// · a task with a time: an hour before and at the time itself
export const EVENING = "20:00", MORNING = "08:30", EARLY = 60;

// a time written in the text ("АВТОБУС в 6:48") counts when the task has no time of its own
const TIME_IN_TEXT = /(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/;
export const timeOf = t => t.time || (() => { const m = t.text?.match(TIME_IN_TEXT); return m ? m[1].padStart(2, "0") + ":" + m[2] : ""; })();

const iso = d => d.toLocaleDateString("sv-SE");
const at = (date, time) => new Date(`${date}T${time}:00`);
const shift = (date, n) => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
// a stable 31-bit number per key, as Android notification ids are ints
export const nid = s => Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) || 1;
const short = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function plan({ tasks, cats, boards, me }, now = Date.now(), days = 7) {
  const projectOf = t => boards.find(b => b.id === cats.find(c => c.id === t.cat)?.board)?.project || "";
  const mine = t => !t.done && !t.hidden && t.text?.trim() && (t.assignee ? t.assignee === me : t._owner === me);
  const open = tasks.filter(mine);
  const out = [], today = iso(new Date(now));

  for (let k = 0; k <= days; k++) {
    const day = shift(today, k);
    const list = open.filter(t => t.due === day).sort((a, b) => (timeOf(a) || "99").localeCompare(timeOf(b) || "99"));
    const line = t => (timeOf(t) ? timeOf(t) + " " : "") + short(t.text, 50);
    if (list.length) {
      // the evening before
      out.push({
        key: "eve:" + day, at: at(shift(day, -1), EVENING), extra: { project: projectOf(list[0]) },
        title: list.length === 1 ? `Завтра${timeOf(list[0]) ? " в " + timeOf(list[0]) : ""}: ${short(list[0].text)}` : `Завтра ${list.length} ${list.length < 5 ? "дела" : "дел"}`,
        body: list.length === 1 ? "Подготовься заранее" : list.slice(0, 6).map(line).join("\n"),
      });
    }
    // the morning of: today's plan plus anything overdue or urgent
    const late = k === 0 ? open.filter(t => t.due && t.due < day) : [];
    const urgent = k === 0 ? open.filter(t => !t.due && (t.prio === "urgent" || inFocus(t))) : [];
    if (list.length || late.length) {
      const timed = list.filter(t => timeOf(t));
      out.push({
        key: "morn:" + day, at: at(day, MORNING), extra: { project: projectOf(list[0] || late[0]) },
        title: timed.length ? `Сегодня: ${timed.map(t => timeOf(t)).join(", ")}` : list.length ? `Сегодня ${list.length} ${list.length === 1 ? "дело" : list.length < 5 ? "дела" : "дел"}` : `Просрочено: ${late.length}`,
        body: [...list.map(line), ...late.slice(0, 3).map(t => "⏰ просрочено: " + short(t.text, 45)), ...urgent.slice(0, 2).map(t => "🔥 " + short(t.text, 45))].slice(0, 8).join("\n"),
      });
    }
    // timed tasks: an hour before and at the time
    for (const t of list) {
      const time = timeOf(t); if (!time) continue;
      const when = at(day, time), extra = { project: projectOf(t) };
      out.push({ key: "early:" + t.id + ":" + day, at: new Date(when - EARLY * 6e4), title: `Через час, в ${time}: ${short(t.text)}`, body: "Пора собираться", extra });
      out.push({ key: "now:" + t.id + ":" + day, at: when, title: `Пора: ${short(t.text)}`, body: time, extra });
    }
  }
  out.push(...nudges(open, tasks, me, today, now));
  return out.filter(x => x.at.getTime() > now).sort((a, b) => a.at - b.at);
}

// Фокус nudges: the tracker reminds of itself, but only when it's been forgotten.
// 10:30 — start the day in focus; 14:00 and 18:00 — only if nothing was ticked in the 3 hours before;
// 21:30 — only if the day has no ticks at all. Done tasks re-plan these, so a busy day stays quiet.
export const NUDGES = { start: "10:30", mid: ["14:00", "18:00"], close: "21:30" };
function nudges(open, tasks, me, today, now) {
  const work = open.filter(t => inFocus(t)).sort((a, b) => a.focus - b.focus);
  const doneAts = tasks.filter(t => t.done && t.doneAt && (t.doneBy || t._owner) === me).map(t => +new Date(t.doneAt));
  const doneOn = day => tasks.some(t => t.done && t.doneOn === day && (t.doneBy || t._owner) === me);
  const top = work[0], extra = { hash: "#zen" }, out = [];
  for (let k = 0; k <= 2; k++) {
    const day = shift(today, k);
    out.push({ key: "zen:start:" + day, at: at(day, NUDGES.start), extra,
      title: top ? `Фокус: ${short(top.text, 50)}` : "2 минуты на разбор задач",
      body: work.length ? `В работе ${work.length}. Открой фокус и начни с первой.` : "Выбери 1–3 дела на сегодня, остальное подождёт." });
    for (const time of NUDGES.mid) {
      const when = +at(day, time);
      if (k === 0 && doneAts.some(d => d > when - 3 * 3600e3 && d <= Math.max(when, now))) continue;
      out.push({ key: "zen:" + time + ":" + day, at: at(day, time), extra,
        title: top ? `Как там «${short(top.text, 40)}»?` : "Давно не было галочек",
        body: "Одна карточка, 25 минут. Открой фокус." });
    }
    if (!(k === 0 && doneOn(day)))
      out.push({ key: "zen:close:" + day, at: at(day, NUDGES.close), extra, title: "День без галочек", body: "Закрой одно маленькое дело перед сном, это 5 минут." });
  }
  return out;
}

// in an open tab (PWA or browser on the PC): the same plan, shown while the page is open
let timers = [], lastKey = "";
export function webReminders(db) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const list = plan(db).filter(x => x.at - Date.now() < 24 * 3600e3);
  const key = list.map(x => x.key + +x.at).join("|");
  if (key === lastKey) return;
  lastKey = key;
  timers.forEach(clearTimeout);
  timers = list.map(x => setTimeout(async () => {
    const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
    const opts = { body: x.body, tag: x.key, icon: "./icons/icon-192.png", data: x.extra };
    if (reg?.showNotification) reg.showNotification(x.title, opts); else new Notification(x.title, opts);
  }, x.at - Date.now()));
}
