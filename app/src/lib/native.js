import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { getDb } from "@/lib/db";
import { plan, nid } from "@/lib/reminders";

// Android app (Capacitor): the web code is loaded live from GitHub Pages, so it updates itself;
// here are the native bits: local notifications for due tasks and a check for a newer APK.
export const isApp = Capacitor.isNativePlatform();
const REPO = "occasionalddd100/tasks";

// reminders come from the shared plan (lib/reminders): the evening before, the morning of, an hour before, at the time
function upcoming() {
  return plan(getDb())
    .slice(0, 60)
    .map(({ key, at, ...n }) => ({ ...n, id: nid(key), largeBody: n.body, channelId: key.startsWith("now:") || key.startsWith("early:") ? CH_NOW : CH_PLAN, schedule: { at, allowWhileIdle: true } }));
}

// Android shows a pop-up on top of the screen only for channels with high importance; a channel's
// importance can't change after it exists, so these are new ids (the old default channel stays unused)
const CH_NOW = "remind-now", CH_PLAN = "remind-plan";
async function channels() {
  await LN.createChannel({ id: CH_NOW, name: "Пора и за час", description: "Задача со временем: за час и в момент", importance: 5, visibility: 1, vibration: true, lights: true, lightColor: "#F59E0B" });
  await LN.createChannel({ id: CH_PLAN, name: "План дня", description: "Накануне вечером и утром в день задачи", importance: 4, visibility: 1, vibration: true });
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
    await channels().catch(e => console.warn("channels", e));
    try { if ((await LN.checkExactNotificationSetting?.())?.exact_alarm === "denied") toast("Чтобы напоминания приходили минута в минуту, разреши «Будильники и напоминания» для приложения в настройках Android."); } catch {}
    let timer = null;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => sync().catch(e => console.warn(e)), 1500); };
    subscribe(later); later();
  }
  LN.addListener("localNotificationActionPerformed", e => {
    const x = e.notification?.extra || {};
    if (x.hash) location.hash = x.hash;
    else if (x.project) location.hash = "#project=" + x.project;
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
