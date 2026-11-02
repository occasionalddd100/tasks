import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, CoffeeIcon, HistoryIcon, Maximize2Icon, Minimize2Icon, PlayIcon, SquareIcon, MoonIcon } from "lucide-react";
import { toast } from "sonner";
import { useDb, update } from "@/lib/db";
import { MOVES } from "@/lib/select";
import { byOrder } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { focus, useFocusSession, totals, clock, dur, AWAY_MIN } from "@/lib/focusSession";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Фокус on the picked tasks: everything else leaves the screen. A ring counts 25-minute rounds of work,
// a strip shows the whole session (work / break / away), «Перерыв» pauses the work clock.
// Away: no keyboard or mouse for a few minutes (on the computer app: anywhere in Windows).
const COL = { work: "#10b981", break: "#38bdf8", away: "#71717a" };
const NAME = { work: "работа", break: "перерыв", away: "не было за компьютером" };
const ROUND = 25 * 60e3;
const ipc = () => window.__TAURI_INTERNALS__;

function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

// watches for being away while a session runs
function useAway(s) {
  const last = useRef(Date.now());
  const on = !!s;
  useEffect(() => {
    if (!on) return;
    const seen = () => {
      last.current = Date.now();
      const was = focus.back();
      if (was) toast(`С возвращением: тебя не было ${dur(was)}`, { description: "Это время записано отдельно от работы" });
    };
    const evs = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];
    evs.forEach(e => addEventListener(e, seen, { passive: true }));
    const tick = setInterval(async () => {
      let idle = null;
      if (ipc()) { try { idle = (await ipc().invoke("idle_secs")) * 1000; } catch { idle = null; } }
      // in a browser tab we only know about input on this page, and only while it is in front
      if (idle == null) idle = document.visibilityState === "visible" ? Date.now() - last.current : 0;
      if (idle >= AWAY_MIN * 60e3) focus.away(Date.now() - idle);
      else if (idle < 15e3 && ipc()) { const was = focus.back(); if (was) toast(`С возвращением: тебя не было ${dur(was)}`); }
    }, 15e3);
    return () => { evs.forEach(e => removeEventListener(e, seen)); clearInterval(tick); };
  }, [on]);
}

export default function FocusHost() {
  const s = useFocusSession();
  const [summary, setSummary] = useState(null);
  useAway(s);
  const finish = async () => { const d = await focus.end(); if (d) setSummary(d); };
  return (
    <>
      <AnimatePresence>{s?.open && <FocusMode key="f" s={s} onEnd={finish} />}</AnimatePresence>
      <AnimatePresence>{s && !s.open && <FocusPill key="p" s={s} />}</AnimatePresence>
      <Summary d={summary} onClose={() => setSummary(null)} />
    </>
  );
}

function Ring({ s, now, size = 240 }) {
  const t = totals(s.parts, s.cur, now);
  const stretch = s.cur?.k === "work" ? now - s.cur.from : 0;
  const part = (t.work % ROUND) / ROUND, rounds = Math.floor(t.work / ROUND);
  const R = 52, C = 2 * Math.PI * R, k = s.cur?.k || "work";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth="7" />
        <circle cx="60" cy="60" r={R} fill="none" stroke={COL[k]} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${part * C} ${C}`}
          style={{ transition: "stroke-dasharray 1s linear, stroke .4s" }} opacity={k === "work" ? 1 : 0.35} />
        {/* a tick for every quarter hour */}
        {Array.from({ length: 12 }, (_, i) => <line key={i} x1="60" y1="3" x2="60" y2="7" stroke="currentColor" strokeOpacity=".2" strokeWidth="1" transform={`rotate(${i * 30} 60 60)`} />)}
      </svg>
      <div className="flex flex-col items-center">
        <span className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: COL[k] }}>{k === "work" ? "работаю" : k === "break" ? "перерыв" : "нет на месте"}</span>
        <span className="font-mono text-5xl font-semibold tabular-nums">{clock(t.work)}</span>
        <span className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
          {k === "work" ? (stretch > 60e3 ? "без остановки " + dur(stretch) : "погнали") : (k === "break" ? "отдыхаю " : "нет уже ") + clock(now - s.cur.from)}
        </span>
        <span className="mt-2 flex gap-1">{Array.from({ length: Math.max(4, rounds + 1) }, (_, i) => <i key={i} className="size-1.5 rounded-full" style={{ background: i < rounds ? COL.work : "color-mix(in oklab, currentColor 15%, transparent)" }} />)}</span>
      </div>
    </div>
  );
}

// the whole session as one strip: green work, blue breaks, grey away
function Strip({ parts, cur, start, now, className }) {
  const all = [...parts, ...(cur ? [{ ...cur, to: now }] : [])], span = Math.max(1, now - start);
  return (
    <div className={cn("flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/[.06]", className)}>
      {all.map((p, i) => <div key={i} title={NAME[p.k] + " " + dur(p.to - p.from)} style={{ width: ((p.to - p.from) / span) * 100 + "%", background: COL[p.k] }} className="h-full min-w-px" />)}
    </div>
  );
}

function FocusMode({ s, onEnd }) {
  const db = useDb();
  const now = useNow();
  const t = totals(s.parts, s.cur, now);
  const ids = new Set(s.ids);
  const tops = useMemo(() => db.tasks.filter(x => ids.has(x.id) && !ids.has(x.parent)).sort(byOrder), [db.tasks, s.ids]);
  const [hist, setHist] = useState(false);
  useEffect(() => {
    const key = e => {
      if (e.target.closest?.("input,textarea,[contenteditable=true]")) return;
      if (e.key === " ") { e.preventDefault(); focus.toggleBreak(); }
      else if (e.key === "Escape" && !document.querySelector("[role=dialog]")) focus.show(false);
    };
    addEventListener("keydown", key); return () => removeEventListener("keydown", key);
  }, []);
  const brk = s.cur?.k !== "work";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 transition-[background] duration-700"
        style={{ background: `radial-gradient(ellipse 60% 45% at 50% 22%, color-mix(in oklab, ${COL[s.cur?.k || "work"]} 14%, transparent), transparent 70%)` }} />
      <header className="relative flex items-center gap-2 px-4 pt-[max(0.75rem,var(--sat))] md:px-6">
        <span className="font-mono text-sm font-semibold tracking-[0.2em] uppercase">Фокус</span>
        <span className="font-mono text-xs text-muted-foreground">с {new Date(s.start).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => setHist(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 font-mono text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"><HistoryIcon className="size-4" /><span className="max-sm:hidden">История</span></button>
          <button type="button" onClick={() => focus.show(false)} title="Свернуть (Esc)" className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 font-mono text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"><Minimize2Icon className="size-4" /><span className="max-sm:hidden">Свернуть</span></button>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-6 px-4 py-6 md:py-10">
        <Ring s={s} now={now} />
        <div className="w-full max-w-md">
          <Strip parts={s.parts} cur={s.cur} start={s.start} now={now} />
          <div className="mt-2 flex justify-center gap-4 font-mono text-xs text-muted-foreground tabular-nums">
            {["work", "break", "away"].map(k => <span key={k} className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: COL[k] }} />{k === "work" ? "работа" : k === "break" ? "перерывы" : "отходил"} {dur(t[k])}</span>)}
          </div>
        </div>
        <div className="flex gap-2">
          <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={focus.toggleBreak}
            className={cn("inline-flex h-12 items-center gap-2 rounded-xl px-5 text-[15px] font-medium ring-1 transition-colors",
              brk ? "bg-emerald-500 text-white ring-emerald-500 hover:bg-emerald-600" : "bg-card ring-border hover:bg-accent")}>
            {brk ? <PlayIcon className="size-[18px]" /> : <CoffeeIcon className="size-[18px]" />}{brk ? "Продолжить" : "Перерыв"}
            <kbd className="rounded bg-foreground/10 px-1.5 font-mono text-[10px] opacity-60 max-md:hidden">Space</kbd>
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={onEnd}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-card px-5 text-[15px] font-medium ring-1 ring-border hover:bg-accent">
            <SquareIcon className="size-4" />Завершить
          </motion.button>
        </div>

        <ul className="mt-2 flex w-full flex-col gap-2">
          {tops.map(x => <FocusTask key={x.id} t={x} ids={ids} />)}
        </ul>
        <p className="font-mono text-[11px] text-muted-foreground/60">Если {AWAY_MIN} минут нет движения мыши и клавиатуры, время записывается как «отходил»{ipc() ? "" : " (во вкладке браузера считается только эта страница)"}</p>
      </main>
      <History open={hist} onOpenChange={setHist} />
    </motion.div>
  );
}

function FocusTask({ t, ids }) {
  const db = useDb();
  const kids = db.tasks.filter(k => k.parent === t.id && (ids.has(k.id) || !k.done)).sort(byOrder);
  const tick = x => update("tasks", x.id, x.done ? { done: false, doneOn: "", doneAt: "", doneBy: "", hidden: false } : MOVES.done());
  return (
    <motion.li layout className={cn("rounded-xl border bg-card/80 p-4 backdrop-blur transition-opacity", t.done && "opacity-60")}>
      <Tick t={t} onClick={() => tick(t)} big />
      {kids.length > 0 && <ul className="mt-2 ml-9 flex flex-col gap-0.5 border-l pl-3">{kids.map(k => <li key={k.id}><Tick t={k} onClick={() => tick(k)} /></li>)}</ul>}
    </motion.li>
  );
}
function Tick({ t, onClick, big }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-3 rounded-lg text-left">
      <span className={cn("mt-0.5 grid shrink-0 place-items-center rounded-full border-2 transition-colors", big ? "size-6" : "size-5",
        t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40 hover:border-emerald-500")}>{t.done && <CheckIcon className="size-3.5" strokeWidth={3} />}</span>
      <span className={cn("min-w-0 break-words", big ? "text-xl font-medium" : "text-[15px]", t.done && "text-muted-foreground line-through")}>{t.text}</span>
    </button>
  );
}

// folded: a small pill over the app, drag it anywhere
function FocusPill({ s }) {
  const now = useNow();
  const t = totals(s.parts, s.cur, now), k = s.cur?.k || "work";
  return (
    <motion.div drag dragMomentum={false} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="fixed right-6 bottom-6 z-40 flex cursor-grab items-center gap-2 rounded-xl border bg-popover/95 py-1.5 pr-1.5 pl-3 shadow-xl backdrop-blur active:cursor-grabbing max-md:right-3 max-md:bottom-[calc(5rem+var(--sab))]"
      style={{ touchAction: "none" }}>
      <i className={cn("size-2.5 rounded-full", k === "work" && "animate-pulse")} style={{ background: COL[k] }} />
      <span className="font-mono text-sm font-semibold tabular-nums">{clock(t.work)}</span>
      {k !== "work" && <span className="font-mono text-xs text-muted-foreground">{k === "break" ? "перерыв" : "нет на месте"}</span>}
      <button type="button" onPointerDown={e => e.stopPropagation()} onClick={focus.toggleBreak} title={k === "work" ? "Перерыв" : "Продолжить"}
        className="grid size-8 place-items-center rounded-lg hover:bg-accent">{k === "work" ? <CoffeeIcon className="size-4" /> : <PlayIcon className="size-4" />}</button>
      <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => focus.show(true)} title="Открыть фокус"
        className="grid size-8 place-items-center rounded-lg hover:bg-accent"><Maximize2Icon className="size-4" /></button>
    </motion.div>
  );
}

function Summary({ d, onClose }) {
  return (
    <Dialog open={!!d} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogTitle className="font-mono tracking-wide uppercase">Фокус завершён</DialogTitle>
        {d && <div className="flex flex-col gap-4">
          <p className="font-mono text-4xl font-semibold tabular-nums" style={{ color: COL.work }}>{dur(d.work)}</p>
          <SessionStrip d={d} />
          <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs text-muted-foreground">
            <div><b className="block text-base text-foreground">{dur(d.work)}</b>работа</div>
            <div><b className="block text-base text-foreground">{dur(d.break)}</b>перерывы</div>
            <div><b className="block text-base text-foreground">{dur(d.away)}</b>отходил</div>
          </div>
          <p className="text-sm">Сделано {d.done} из {d.tasks.length}: <span className="text-muted-foreground">{d.texts.filter(Boolean).slice(0, 4).join(", ")}{d.texts.length > 4 ? "…" : ""}</span></p>
          <button type="button" onClick={onClose} className="h-10 rounded-lg bg-primary font-medium text-primary-foreground">Готово</button>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

const SK = { w: "work", b: "break", a: "away" };
function SessionStrip({ d, className }) {
  const total = Math.max(1, (d.parts || []).reduce((a, p) => a + p[2], 0));
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-foreground/[.06]", className)}>
      {(d.parts || []).map((p, i) => <div key={i} style={{ width: (p[2] / total) * 100 + "%", background: COL[SK[p[0]]] }} className="h-full min-w-px" />)}
    </div>
  );
}

// all sessions by day: how much work, rest and away, and on what
export function History({ open, onOpenChange }) {
  const db = useDb();
  const days = useMemo(() => {
    const m = new Map();
    for (const f of [...db.focus].sort((a, b) => b.start.localeCompare(a.start))) { if (!m.has(f.day)) m.set(f.day, []); m.get(f.day).push(f); }
    return [...m.entries()].slice(0, 30);
  }, [db.focus]);
  const label = d => new Date(d + "T12:00").toLocaleDateString("ru", { weekday: "short", day: "numeric", month: "long" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl" aria-describedby={undefined}>
        <DialogTitle className="font-mono tracking-wide uppercase">История фокуса</DialogTitle>
        <div className="thin-scroll -mx-1 flex min-h-0 flex-col gap-5 overflow-y-auto px-1">
          {!days.length && <p className="text-sm text-muted-foreground">Пока пусто. Выдели задачи, нажми «Фокус», а потом «Завершить»: сессия появится здесь.</p>}
          {days.map(([day, list]) => {
            const sum = k => list.reduce((a, f) => a + (f[k] || 0), 0);
            return (
              <section key={day}>
                <h3 className="mb-2 flex items-baseline gap-3 font-mono text-sm font-semibold">{label(day)}
                  <span className="text-xs font-normal" style={{ color: COL.work }}>{dur(sum("work"))}</span>
                  {sum("away") > 0 && <span className="text-xs font-normal text-muted-foreground"><MoonIcon className="mr-0.5 inline size-3" />{dur(sum("away"))}</span>}
                </h3>
                <ul className="flex flex-col gap-2">
                  {list.map(f => (
                    <li key={f.id} className="rounded-lg border p-3">
                      <div className="mb-1.5 flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
                        <span>{new Date(f.start).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}–{new Date(f.end).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span style={{ color: COL.work }}>{dur(f.work)}</span>
                        {f.break > 0 && <span style={{ color: COL.break }}>перерыв {dur(f.break)}</span>}
                        {f.away > 0 && <span>отходил {dur(f.away)}</span>}
                        <span className="ml-auto">{f.done}/{f.tasks?.length || 0}</span>
                      </div>
                      <SessionStrip d={f} />
                      <p className="mt-1.5 truncate text-sm">{(f.texts || []).filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
