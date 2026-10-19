import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { getDb } from "@/lib/db";

// Android app (Capacitor): the web code is loaded live from GitHub Pages, so it updates itself;
// here are the native bits: local notifications for due tasks and a check for a newer APK.
export const isApp = Capacitor.isNativePlatform();
const REPO = "occasionalddd100/tasks";
const MORNING = "09:00"; // tasks with a date but no time remind at this hour
const EVENING = "20:00"; // ...and the evening before
const EARLY = 60;        // tasks with a time also remind this many minutes ahead

// a stable 31-bit number per task id, as Android notification ids are ints
const nid = s => Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) || 1;

// each task: an early heads-up (an hour before, or the evening before for all-day tasks) and one at the time itself
function upcoming() {
  const { tasks, cats, boards, me } = getDb();
  const projectOf = t => boards.find(b => b.id === cats.find(c => c.id === t.cat)?.board)?.project;
  const now = Date.now(), out = [];
  for (const t of tasks) {
    if (t.done || !t.due || !(t.assignee ? t.assignee === me : t._owner === me)) continue;
    const at = new Date(`${t.due}T${t.time || MORNING}:00`), extra = { project: projectOf(t) || "" };
    const early = t.time ? new Date(at.getTime() - EARLY * 6e4) : (() => { const d = new Date(`${t.due}T${EVENING}:00`); d.setDate(d.getDate() - 1); return d; })();
    out.push({ id: nid(t.id), title: t.text, body: t.time ? "Пора: " + t.time : "Срок сегодня", at, extra });
    out.push({ id: nid(t.id + ":early"), title: t.text, body: t.time ? `Через час, в ${t.time}` : "Завтра срок", at: early, extra });
  }
  return out
    .filter(x => x.at.getTime() > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, 60)
    .map(({ at, ...n }) => ({ ...n, schedule: { at, allowWhileIdle: true } }));
}

let LN = null, last = "";
async function sync() {
  if (!getDb().ready || getDb().error) return;
  const list = upcoming(), key = JSON.stringify(list.map(n => [n.id, +n.schedule.at, n.title]));
  if (key === last) return;
  last = key;
  const { notifications } = await LN.getPending();
  if (notifications.length) await LN.cancel({ notifications: notifications.map(n => ({ id: n.id })) });
  if (list.length) await LN.schedule({ notifications: list });
}

let started = false;
export async function startNative(subscribe) {
  if (!isApp || started) return;
  started = true;
  ({ LocalNotifications: LN } = await import("@capacitor/local-notifications"));
  const perm = await LN.requestPermissions().catch(() => ({ display: "denied" }));
  if (perm.display === "granted") {
    try { if ((await LN.checkExactNotificationSetting?.())?.exact_alarm === "denied") toast("Чтобы напоминания приходили минута в минуту, разреши «Будильники и напоминания» для приложения в настройках Android."); } catch {}
    let timer = null;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => sync().catch(e => console.warn(e)), 1500); };
    subscribe(later); later();
  }
  LN.addListener("localNotificationActionPerformed", e => {
    const p = e.notification?.extra?.project;
    if (p) location.hash = "#project=" + p;
  });
  checkUpdate();
}

// a new APK only matters when native parts change; the web part is always fresh
async function checkUpdate() {
  try {
    const { App } = await import("@capacitor/app");
    const { build } = await App.getInfo();
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then(r => r.json());
    const n = Number(String(r.tag_name || "").replace(/\D/g, ""));
    const apk = r.assets?.find(a => a.name.endsWith(".apk"))?.browser_download_url;
    if (n > Number(build) && apk) toast("Вышла новая версия приложения", { duration: 15000, action: { label: "Скачать", onClick: () => window.open(apk, "_system") } });
  } catch {}
}
