import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { toast } from "sonner";
import { isApp } from "@/lib/native";

// follow the system theme
const mq = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", mq.matches);
applyTheme(); mq.addEventListener("change", applyTheme);

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
const checkUpdate = () => {
  if (!mine || location.protocol !== "https:") return;
  fetch(location.pathname + "?v=" + Date.now(), { cache: "no-store" }).then(r => r.text()).then(html => {
    const live = html.match(/index-[\w-]+\.js/)?.[0];
    let tried = null; try { tried = sessionStorage.getItem("reloadedFor"); } catch {}
    if (!live || live === mine || tried === live) return; // tried once already: don't loop on a stale cache
    try { sessionStorage.setItem("reloadedFor", live); } catch {}
    location.replace(location.pathname + "?v=" + Date.now() + location.hash); // the query skips the cached page
  }).catch(() => {});
};
setTimeout(checkUpdate, 3000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
