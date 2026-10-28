import { useEffect, useState, useSyncExternalStore } from "react";
import { DatabaseIcon, HardDriveIcon, Loader2Icon, MonitorIcon, MoonIcon, PaletteIcon, RefreshCwIcon, SunIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { rpc, useDb } from "@/lib/db";
import { ACCENTS, setAppearance, useAppearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

let open = false; const subs = new Set();
export const openSettings = () => { open = true; subs.forEach(f => f()); };
const close = () => { open = false; subs.forEach(f => f()); };

const TABS = [
  { k: "look", label: "Вид", icon: PaletteIcon },
  { k: "cloud", label: "Supabase", icon: DatabaseIcon },
  { k: "cache", label: "Кэш", icon: HardDriveIcon },
];

export function SettingsHost() {
  const isOpen = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => open);
  const [tab, setTab] = useState("look");
  return (
    <Dialog open={isOpen} onOpenChange={o => !o && close()}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] gap-4 overflow-hidden sm:max-w-xl max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-2xl max-sm:pb-[calc(1.5rem+var(--sab))]">
        <DialogTitle>Настройки</DialogTitle>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map(({ k, label, icon: Icon }) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={cn("flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors", tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>
        <div className="-mx-6 overflow-y-auto px-6">
          {tab === "look" && <Look />}
          {tab === "cloud" && <Cloud />}
          {tab === "cache" && <Cache />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const Row = ({ label, hint, children }) => (
  <div className="flex flex-col gap-2 border-b py-3.5 last:border-0">
    <div><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>
    {children}
  </div>
);
const Seg = ({ value, options, onChange }) => (
  <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
    {options.map(([v, label, Icon]) => (
      <button key={v} type="button" onClick={() => onChange(v)}
        className={cn("flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap transition-colors", value === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        {Icon && <Icon className="size-4" />}{label}
      </button>
    ))}
  </div>
);

function Look() {
  const a = useAppearance();
  return (
    <div>
      <Row label="Тема"><Seg value={a.theme} onChange={theme => setAppearance({ theme })} options={[["system", "Как в системе", MonitorIcon], ["light", "Светлая", SunIcon], ["dark", "Тёмная", MoonIcon]]} /></Row>
      <Row label="Акцентный цвет" hint="Ссылки, выделения, жирный текст в заметках">
        <div className="flex gap-2">
          {Object.entries(ACCENTS).map(([k, [l, d]]) => (
            <button key={k} type="button" onClick={() => setAppearance({ accent: k })} aria-label={k}
              className={cn("size-9 rounded-full transition-transform hover:scale-110", a.accent === k && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
              style={{ background: `linear-gradient(135deg, ${l} 50%, ${d} 50%)` }} />
          ))}
        </div>
      </Row>
      <Row label="Размер текста"><Seg value={a.scale} onChange={scale => setAppearance({ scale })} options={[[90, "Мельче"], [100, "Обычный"], [110, "Крупнее"], [120, "Крупный"]]} /></Row>
      <Row label="Ширина боковой панели" hint="На компьютере"><Seg value={a.sidebar} onChange={sidebar => setAppearance({ sidebar })} options={[["narrow", "Узкая"], ["normal", "Обычная"], ["wide", "Широкая"]]} /></Row>
      <Row label="Анимации" hint="Влетающие карточки, переходы, конфетти"><Seg value={a.motion} onChange={motion => setAppearance({ motion })} options={[["on", "Включены"], ["off", "Выключены"]]} /></Row>
    </div>
  );
}

const fmt = b => b == null ? "…" : b < 1024 ? b + " Б" : b < 1048576 ? (b / 1024).toFixed(0) + " КБ" : b < 1073741824 ? (b / 1048576).toFixed(1) + " МБ" : (b / 1073741824).toFixed(2) + " ГБ";
const NAMES = { tasks: "задачи", notes: "заметки", clips: "карточки стэшей", days: "дни журнала", projects: "проекты", boards: "вкладки", cats: "категории", folders: "папки", stashes: "стэши", habits: "повторяющиеся", log: "старый журнал", prefs: "настройки" };

function Bar({ label, used, limit, hint }) {
  const k = limit ? Math.min(1, used / limit) : 0;
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-baseline gap-2 text-sm"><span className="font-medium">{label}</span><span className="ml-auto text-muted-foreground tabular-nums">{fmt(used)}{limit ? ` из ${fmt(limit)}` : ""}</span></div>
      {limit > 0 && <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-[width] duration-700", k > 0.85 ? "bg-red-500" : k > 0.6 ? "bg-amber-500" : "bg-[var(--ink)]")} style={{ width: Math.max(1, k * 100) + "%" }} /></div>}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Cloud() {
  const [s, setS] = useState(null), [err, setErr] = useState("");
  const load = () => { setErr(""); rpc("usage_stats", {}).then(setS).catch(e => setErr(e.message || String(e))); };
  useEffect(load, []);
  if (err) return <p className="py-4 text-sm text-destructive">Не получилось получить статистику: {err}</p>;
  if (!s) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />Считаю…</p>;
  const docs = Object.entries(s.my_docs || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-2 pb-2">
      <p className="text-xs text-muted-foreground">Лимиты бесплатного тарифа Supabase: база 500 МБ, файлы 1 ГБ.</p>
      <Bar label="База данных" used={s.db_bytes} limit={500 * 1048576} hint={`Из них все записи приложения: ${fmt(s.docs_bytes)}, твои: ${fmt(s.my_docs_bytes)}`} />
      <Bar label="Файлы (фото)" used={s.storage_bytes} limit={1024 * 1048576} hint={`Твои: ${s.my_storage?.files || 0} файлов, ${fmt(s.my_storage?.bytes)} (журнал ${fmt(s.my_storage?.journal)}, стэши ${fmt(s.my_storage?.stash)})`} />
      <div className="mt-2 text-sm font-medium">Твои записи</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {docs.map(([k, n]) => <div key={k} className="flex justify-between gap-2"><span className="text-muted-foreground">{NAMES[k] || k}</span><span className="tabular-nums">{n}</span></div>)}
      </div>
      <button type="button" onClick={() => { setS(null); load(); }} className="mt-2 inline-flex h-8 items-center gap-1.5 self-start rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"><RefreshCwIcon className="size-3.5" />Обновить</button>
    </div>
  );
}

const sw = () => navigator.serviceWorker?.controller;
function Cache() {
  const [info, setInfo] = useState(null);
  const [on, setOn] = useState(true);
  const db = useDb();
  const load = async () => {
    const out = { usage: null, quota: null, media: null, folders: 0 };
    try { const e = await navigator.storage.estimate(); out.usage = e.usage; out.quota = e.quota; } catch {}
    try { if (await caches.has("stash-media")) out.media = (await (await caches.open("stash-media")).keys()).length; else out.media = 0; } catch {}
    try { setOn(!(await (await caches.open("stash-flags")).match("media-off"))); } catch {}
    out.folders = db.stashes.reduce((n, s) => n + (s.sources?.length || 0), 0);
    setInfo(out);
  };
  useEffect(() => { load(); }, []);
  const toggle = v => { setOn(v); sw()?.postMessage({ type: "media-cache", on: v }); };
  const clear = async () => { sw()?.postMessage({ type: "media-clear" }); try { await caches.delete("stash-media"); } catch {} toast("Кэш медиа очищен"); load(); };
  if (!("caches" in window)) return <p className="py-4 text-sm text-muted-foreground">Этот браузер не умеет хранить кэш.</p>;
  return (
    <div className="pb-2">
      {!sw() && <p className="mb-2 rounded-lg border p-3 text-xs text-muted-foreground">Кэш работает в браузере на компьютере (и в установленной версии сайта). В приложении на телефоне картинки грузятся из сети.</p>}
      <Row label="Хранить картинки стэшей на этом устройстве" hint="Превью YouTube, X, TikTok и загруженные картинки открываются сразу и без интернета. Видео не кэшируются.">
        <Seg value={on ? "on" : "off"} onChange={v => toggle(v === "on")} options={[["on", "Включено"], ["off", "Выключено"]]} />
      </Row>
      <Row label="Занято">
        <div className="flex items-baseline justify-between py-1 text-sm"><span className="font-medium">Картинки в кэше</span><span className="text-muted-foreground tabular-nums">{info?.media ?? "…"} шт.</span></div>
        <Bar label="Всего данных сайта на этом устройстве" used={info?.usage} limit={info?.quota} hint="Сюда входят кэш картинок, код приложения и доступ к папкам." />
      </Row>
      <Row label="Папки с компьютера" hint="Подключённые к стэшам папки читаются прямо с диска, место не занимают.">
        <div className="text-sm text-muted-foreground">Подключено: {info?.folders ?? 0}</div>
      </Row>
      <div className="flex gap-2 pt-3">
        <button type="button" onClick={clear} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-destructive hover:bg-destructive/10"><Trash2Icon className="size-4" />Очистить кэш картинок</button>
        <button type="button" onClick={load} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent"><RefreshCwIcon className="size-4" />Обновить</button>
      </div>
    </div>
  );
}
