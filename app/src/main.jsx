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
