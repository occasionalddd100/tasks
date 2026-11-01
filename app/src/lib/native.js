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

// Settings → «Проверить уведомления»: asks for permission if needed, sends a test in 5 seconds
// and says when the next real reminder is due
export async function testNotify() {
  const next = plan(getDb())[0];
  const when = next ? `Следующее напоминание: ${next.at.toLocaleString("ru-RU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — ${next.title}` : "Ближайших напоминаний нет";
  const title = "Проверка: уведомления работают ✓", body = "Так будут приходить напоминания о задачах";
  if (isApp) {
    if (!LN) ({ LocalNotifications: LN } = await import("@capacitor/local-notifications"));
    const perm = await LN.requestPermissions().catch(() => ({ display: "denied" }));
    if (perm.display !== "granted") return toast.error("Уведомления запрещены. Разреши их для «Задачи» в настройках Android.");
    await LN.schedule({ notifications: [{ id: 99999, title, body, channelId: CH_NOW, schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
    return toast("Через 5 секунд придёт проверочное уведомление. " + when, { duration: 8000 });
  }
  if (!("Notification" in window)) return toast.error("Этот браузер не умеет показывать уведомления.");
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (p !== "granted") return toast.error("Уведомления запрещены. Разреши их для сайта в настройках браузера (значок замка у адреса).");
  setTimeout(async () => {
    const reg = window.__TAURI_INTERNALS__ ? null : await navigator.serviceWorker?.getRegistration?.().catch(() => null);
    const opts = { body, tag: "test", icon: "./icons/icon-192.png" };
    if (reg?.showNotification) reg.showNotification(title, opts); else new Notification(title, opts);
  }, 5000);
  toast("Через 5 секунд придёт проверочное уведомление. Напоминания приходят, пока сайт или приложение открыты. " + when, { duration: 8000 });
}
