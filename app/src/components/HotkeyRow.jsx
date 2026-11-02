import { useEffect, useState } from "react";
import { KeyboardIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Computer app only: the key that shows and hides the window from anywhere.
const ipc = () => window.__TAURI_INTERNALS__;
export const inDesktop = () => !!ipc();
const MODS = [["ctrlKey", "Ctrl"], ["altKey", "Alt"], ["shiftKey", "Shift"]];
const nice = k => k.replace(/Key([A-Z])/, "$1").replace(/Digit(\d)/, "$1");

export default function HotkeyRow({ Row }) {
  const [cur, setCur] = useState(null); // [key, ok] or "old" when the app is too old to ask
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ipc()?.invoke("hotkey_get").then(setCur, () => setCur("old")); }, []);
  useEffect(() => {
    if (!rec) return;
    const f = async e => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") return setRec(false);
      if (/^(Control|Alt|Shift|Meta)/.test(e.code) || e.key === "Control" || e.key === "Alt" || e.key === "Shift") return;
      const mods = MODS.filter(([m]) => e[m]).map(([, n]) => n);
      if (!mods.length && !/^F\d+$/.test(e.code)) return toast("Нужна клавиша с Ctrl, Alt или Shift");
      const key = [...mods, e.code].join("+");
      setRec(false); setBusy(true);
      try { await ipc().invoke("hotkey_set", { key }); setCur([key, true]); toast("Горячая клавиша: " + nice(key)); }
      catch (err) { toast.error(String(err)); }
      setBusy(false);
    };
    addEventListener("keydown", f, true);
    return () => removeEventListener("keydown", f, true);
  }, [rec]);
  if (!ipc()) return null;
  const old = cur === "old";
  return (
    <Row label="Горячая клавиша" hint={old ? "Обнови приложение для ПК, чтобы менять клавишу" : cur && !cur[1] ? "Эта клавиша занята другой программой: выбери другую" : "Открывает и прячет окно из любого места"}>
      <button type="button" disabled={old || busy} onClick={() => setRec(!rec)}
        className={cn("inline-flex h-9 items-center gap-1.5 self-start rounded-lg border px-3 font-mono text-sm font-medium hover:bg-accent disabled:opacity-50",
          rec && "border-primary ring-2 ring-primary/30", cur && cur !== "old" && !cur[1] && "border-destructive text-destructive")}>
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <KeyboardIcon className="size-4" />}
        {rec ? "Нажми сочетание… (Esc — отмена)" : cur && !old ? nice(cur[0]) : "…"}
      </button>
    </Row>
  );
}

// Computer app only: its version and a button to look for a newer one now
export function UpdateRow({ Row }) {
  const [ver, setVer] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ipc()?.invoke("app_version").then(setVer, () => setVer("old")); }, []);
  if (!ipc()) return null;
  const old = ver === "old";
  const go = async () => { setBusy(true); try { toast(await ipc().invoke("update_check")); } catch (e) { toast.error(String(e)); } setBusy(false); };
  return (
    <Row label="Приложение для ПК" hint={old ? "Эта версия не умеет проверять обновления по кнопке: она проверит сама при запуске" : "Обновляется само; кнопка проверит и поставит новую версию сейчас"}>
      <button type="button" disabled={old || busy} onClick={go}
        className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50">
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
        {ver && !old ? `Версия ${ver} · проверить обновления` : "Проверить обновления"}
      </button>
    </Row>
  );
}
