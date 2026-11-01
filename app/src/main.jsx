import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { toast } from "sonner";
import { isApp } from "@/lib/native";
import { freshReload } from "@/lib/reload";

// theme, accent and text size from the settings window (system theme by default)
import { apply as applyAppearance } from "@/lib/appearance";
applyAppearance();

import { initSmoothScroll } from "@/lib/smoothScroll";
initSmoothScroll();
createRoot(document.getElementById("root")).render(<App />);

// PWA: offline shell + "install" offer in the browser (the Android app loads the site itself, so not there)
if (!isApp && "serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    let seen = false; try { seen = localStorage.getItem("pwaOffer") === "1"; } catch {}
    if (seen) return;
    setTimeout(() => toast("Установить как приложение?", {
      description: "Иконка на рабочем столе, отдельное окно, открывается без браузера.",
      duration: 20000,
      action: { label: "Установить", onClick: () => e.prompt() },
      onDismiss: () => { try { localStorage.setItem("pwaOffer", "1"); } catch {} },
    }), 4000);
  });
}

// the Android app's WebView may keep an old page for a while: on start and whenever the app comes back,
// ask for a fresh index.html and reload if it points to a newer build
const mine = document.querySelector('script[src*="assets/index-"]')?.getAttribute("src")?.match(/index-[\w-]+\.js/)?.[0];
// While the page is open and in use (the desktop app stays open for days) it is not reloaded under the hand:
// a notification and a toast say what the new version brings, «Обновить» loads it.
let told = "";
const checkUpdate = (quiet = false) => {
  if (!mine || location.protocol !== "https:") return;
  fetch(location.pathname + "?v=" + Date.now(), { cache: "no-store" }).then(r => r.text()).then(async html => {
    const live = html.match(/index-[\w-]+\.js/)?.[0];
    if (!live || live === mine) return;
    if (quiet || document.visibilityState !== "visible") return freshReload(live);
    if (told === live) return;
    told = live;
    const log = await fetch("changelog.json?v=" + Date.now(), { cache: "no-store" }).then(r => r.json()).catch(() => null);
    const v = log?.[0], title = "Вышла новая версия" + (v ? ": " + v.title : "");
    const body = v ? v.items.slice(0, 3).map(x => "• " + x).join("\n") : "Нажми «Обновить», чтобы загрузить её";
    try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, tag: "update", icon: "./icons/icon-192.png" }); } catch {}
    const { toast } = await import("sonner");
    toast(title, { description: body, duration: Infinity, action: { label: "Обновить", onClick: () => freshReload(live) } });
  }).catch(() => {});
};
setTimeout(() => checkUpdate(true), 3000);
setInterval(() => checkUpdate(), 10 * 60e3);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(true); });

// an old cached page asks for code files the newer build no longer has: fetch the new page instead of a black screen
window.addEventListener("vite:preloadError", e => { if (freshReload("chunk:" + (mine || ""))) e.preventDefault(); });
