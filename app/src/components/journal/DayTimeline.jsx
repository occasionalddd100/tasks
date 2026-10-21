import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlarmClockIcon, BellIcon, BellRingIcon, CheckIcon, CrosshairIcon, FlameIcon, MoonStarIcon, SunIcon, SunriseIcon, SunsetIcon, CalendarClockIcon, CalendarDaysIcon, ChevronDownIcon } from "lucide-react";
import { useDb, update } from "@/lib/db";
import { today, plural } from "@/lib/tasks";
import { inFocus } from "@/lib/focus";
import { timeOf, plan } from "@/lib/reminders";
import { isApp } from "@/lib/native";
import { cn } from "@/lib/utils";

// The day at a glance: a 30-hour strip from 06:00 today to tomorrow noon, coloured by part of day,
// with "now", every task that has a time and a countdown to the next one; the week and reminders fold below.

const H = 3600e3;
const SLEEP = 23; // hour the day ends for "до сна"
const PARTS = [
  { from: 23, to: 31, k: "night", label: "Ночь", icon: MoonStarIcon, bg: "linear-gradient(180deg,#1e1b4b,#312e81)", dot: "#a5b4fc" },
  { from: 7, to: 12, k: "morning", label: "Утро", icon: SunriseIcon, bg: "linear-gradient(180deg,#f59e0b,#fbbf24)", dot: "#fde68a" },
  { from: 12, to: 18, k: "day", label: "День", icon: SunIcon, bg: "linear-gradient(180deg,#0ea5e9,#38bdf8)", dot: "#bae6fd" },
  { from: 18, to: 23, k: "evening", label: "Вечер", icon: SunsetIcon, bg: "linear-gradient(180deg,#c2410c,#9333ea)", dot: "#fdba74" },
];
const partAt = h => PARTS.find(p => (h >= p.from && h < p.to) || (h + 24 >= p.from && h + 24 < p.to)) || PARTS[0];

const iso = d => d.toLocaleDateString("sv-SE");
const hm = ms => new Date(ms).toTimeString().slice(0, 5);
const at = (date, time) => new Date(date + "T" + time + ":00").getTime();

function span(ms) {
  const m = Math.round(Math.abs(ms) / 60e3);
  if (m < 60) return m + " мин";
  const h = Math.floor(m / 60), r = m % 60;
  return h + " ч" + (r ? " " + r + " мин" : "");
}

function useNow(step) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), step); return () => clearInterval(i); }, [step]);
  return now;
}

export default function DayTimeline() {
  const db = useDb();
  const now = useNow(20e3);
  // 6 hours behind, a day ahead: "now" sits near the left and tomorrow morning is always in view
  const start = useMemo(() => { const d = new Date(now); d.setMinutes(0, 0, 0); return d.getTime() - 6 * H; }, [Math.floor(now / H)]);
  const end = start + 30 * H;

  const { events, untimed } = useMemo(() => {
    const me = db.me, d0 = iso(new Date(start)), td = today();
    const dates = new Set([d0, iso(new Date(start + 12 * H)), iso(new Date(start + 24 * H)), iso(new Date(end))]);
    const mineOpen = t => (t.assignee ? t.assignee === me : t._owner === me);
    const mineDone = t => (t.doneBy || t._owner || me) === me;
    const events = [], untimed = [];
    for (const t of db.tasks) {
      if (t.hidden || !t.text?.trim()) continue;
      if (t.done ? !(mineDone(t) && t.doneOn >= d0) : !mineOpen(t)) continue;
      const time = timeOf(t);
      const important = !t.done && ((t.due && t.due <= td) || t.prio === "urgent" || inFocus(t));
      if (!time) { if (important) untimed.push(t); continue; }
      let when = null;
      if (t.due) { if (dates.has(t.due)) when = at(t.due, time); else if (!t.done && t.due < d0) { untimed.push(t); continue; } }
      else if (t.done || important || !t.time) {
        // no date: the next time this clock time comes round (an hour of slack, so a just-missed one still shows)
        when = at(d0, time);
        while (when < now - H && when + 24 * H < end) when += 24 * H;
      }
      if (when != null && when >= start && when <= end) events.push({ t, when, time });
    }
    events.sort((a, b) => a.when - b.when);
    const rank = t => (t.due && t.due < td ? 0 : t.prio === "urgent" ? 1 : t.due === td ? 2 : inFocus(t) ? 3 : 4);
    untimed.sort((a, b) => rank(a) - rank(b));
    return { events, untimed };
  }, [db.tasks, db.me, start, end, Math.floor(now / 60e3)]);

  const next = events.find(e => !e.t.done && e.when >= now);
  const missed = events.filter(e => !e.t.done && e.when < now);
  const toggle = t => update("tasks", t.id, t.done ? { done: false, doneOn: "", doneBy: "", hidden: false } : { done: true, doneOn: today(), doneBy: db.me });

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <Hero now={now} next={next} missed={missed.length} left={events.filter(e => !e.t.done && e.when >= now).length} onTick={toggle} />
      <Strip now={now} start={start} end={end} events={events} onTick={toggle} />
      <Ahead db={db} now={now} />
    </motion.section>
  );
}

/* ───────── top: where we are, what's next ───────── */

function Hero({ now, next, missed, left, onTick }) {
  const d = new Date(now), part = partAt(d.getHours()), Icon = part.icon;
  const night = d.getHours() >= SLEEP || d.getHours() < 5;
  const dayStart = new Date(d).setHours(7, 0, 0, 0), dayEnd = new Date(d).setHours(SLEEP, 0, 0, 0);
  const progress = night ? 1 : Math.min(1, Math.max(0, (now - dayStart) / (dayEnd - dayStart)));
  const toSleep = night ? 0 : dayEnd - now;
  return (
    <div className="grid grid-cols-1 gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center [&>*]:min-w-0">
      <div className="flex items-center gap-3">
        <motion.div className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-md" style={{ background: part.bg }}
          animate={{ rotate: [0, -6, 6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
          <Icon className="size-6" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{hm(now)}</span>
            <span className="text-sm text-muted-foreground lowercase">{part.label}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full" style={{ background: part.bg }} initial={{ width: 0 }} animate={{ width: progress * 100 + "%" }} transition={{ duration: 1.2, ease: "easeOut" }} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {toSleep > 0 ? <>до сна <b className="text-foreground">{span(toSleep)}</b> · день прошёл на {Math.round(progress * 100)}%</> : <>уже ночь, пора спать</>}
          </div>
        </div>
      </div>

      <NextUp next={next} onTick={onTick} />

      <div className="flex gap-2 md:flex-col md:items-end">
        <Pill tone={missed ? "bad" : "mute"} n={missed} label={plural(missed, ["пропущена", "пропущены", "пропущено"])} pulse={missed > 0} />
        <Pill tone="mute" n={left} label="впереди" />
      </div>
    </div>
  );
}

function Pill({ tone, n, label, pulse }) {
  return (
    <span className={cn("relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
      tone === "bad" ? "border-destructive/40 bg-destructive/10 text-destructive" : "text-muted-foreground")}>
      {pulse && <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/70" /><span className="relative inline-flex size-2 rounded-full bg-destructive" /></span>}
      <b className="tabular-nums">{n}</b> {label}
    </span>
  );
}

// the next timed task with a live countdown; the ring fills over the last 3 hours before it
function NextUp({ next, onTick }) {
  const now = useNow(1000);
  if (!next) return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
      <CalendarClockIcon className="size-5" />Задач со временем впереди нет. Поставь время задаче, и она встанет на таймлайн.
    </div>
  );
  const ms = next.when - now, soon = ms < H, ring = 1 - Math.min(1, ms / (3 * H));
  const s = Math.max(0, Math.floor(ms / 1000));
  const clock = soon ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : span(ms);
  const R = 26, C = 2 * Math.PI * R;
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border p-3 transition-colors", soon ? "border-amber-500/50 bg-amber-500/10" : "bg-muted/30")}>
      <div className="relative size-16 shrink-0">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
          <motion.circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round" className={soon ? "stroke-amber-500" : "stroke-[var(--ink)]"}
            strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - ring) }} transition={{ duration: 1, ease: "easeOut" }} />
        </svg>
        <AlarmClockIcon className={cn("absolute inset-0 m-auto size-5", soon ? "text-amber-500" : "text-muted-foreground")} />
        {soon && <motion.span className="absolute inset-0 rounded-full border-2 border-amber-500/60" animate={{ scale: [1, 1.25], opacity: [0.8, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Дальше · {next.time}{iso(new Date(next.when)) !== today() ? " завтра" : ""}</div>
        <div className="truncate text-[15px] font-semibold" title={next.t.text}>{next.t.text}</div>
        <div className={cn("text-xl font-bold tabular-nums", soon && "text-amber-500")}>через {clock}</div>
      </div>
      <button type="button" onClick={() => onTick(next.t)} title="Сделано" aria-label={"Отметить: " + next.t.text}
        className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-good hover:bg-good/10">
        <CheckIcon className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}

/* ───────── the strip ───────── */

const PIN_W = 156, LANE_H = 44, LANES = 3;

function Strip({ now, start, end, events, onTick }) {
  const box = useRef(null), [w, setW] = useState(960);
  const pct = ms => ((ms - start) / (end - start)) * 100;
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW((el.firstChild?.offsetWidth || 992) - 32)); ro.observe(el); return () => ro.disconnect();
  }, []);
  // open with "now" a third of the way in, so the morning ahead is in view on the phone
  useEffect(() => { const el = box.current; if (el) el.scrollLeft = Math.max(0, (pct(now) / 100) * el.scrollWidth - el.clientWidth / 3); }, []);

  // bands of the day parts across the 30 hours
  const bands = useMemo(() => {
    const out = [];
    for (let t = start; t < end;) {
      const h = new Date(t).getHours(), p = partAt(h);
      const d = new Date(t); let stop = new Date(d); stop.setHours(p.to % 24, 0, 0, 0); if (stop <= d) stop.setDate(stop.getDate() + 1);
      const e = Math.min(end, stop.getTime());
      out.push({ p, from: t, to: e }); t = e;
    }
    return out;
  }, [start, end]);

  // pins go into lanes above the strip so labels never overlap
  const pins = useMemo(() => {
    const last = Array(LANES).fill(-1e9);
    return events.map(e => {
      const x = (pct(e.when) / 100) * w, shift = Math.max(0, x + PIN_W - w + 4), left = x - shift;
      let lane = last.findIndex(l => left - l > PIN_W + 6);
      if (lane < 0) lane = last.indexOf(Math.min(...last));
      last[lane] = left;
      return { ...e, lane, x, shift };
    });
  }, [events, w, start, end]);
  const used = pins.length ? Math.max(...pins.map(p => p.lane)) + 1 : 0;
  const midnight = new Date(start); midnight.setHours(24, 0, 0, 0);
  const hours = [];
  for (let t = start; t <= end; t += 3 * H) hours.push(t);

  return (
    <div ref={box} className="overflow-x-auto [scrollbar-width:thin]">
      <div className="relative min-w-[1000px] px-4 pt-4 pb-3" style={{ "--pins": used * LANE_H + "px" }}>
        {/* pins */}
        <div className="relative" style={{ height: used * LANE_H + 8 }}>
          {pins.map((e, k) => <Pin key={e.t.id + e.when} e={e} now={now} k={k} onTick={onTick} />)}
        </div>
        {/* the coloured strip */}
        <div className="relative h-14 overflow-hidden rounded-xl">
          {bands.map(({ p, from, to }, k) => {
            const I = p.icon;
            return (
              <motion.div key={k} className="absolute inset-y-0 flex items-center overflow-hidden" style={{ left: pct(from) + "%", width: pct(to) - pct(from) + "%", background: p.bg }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: k * 0.06 }}>
                {p.k === "night" && <Stars />}
                <span className="relative flex items-center gap-1.5 px-3 text-xs font-semibold text-white/90 drop-shadow"><I className="size-3.5" />{p.label}</span>
              </motion.div>
            );
          })}
          {/* what is already behind us */}
          <motion.div className="absolute inset-y-0 left-0 bg-background/60" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,.18) 6px 7px)" }}
            initial={{ width: 0 }} animate={{ width: Math.min(100, Math.max(0, pct(now))) + "%" }} transition={{ duration: 1, ease: "easeOut" }} />
          {/* stems of the pins and done/missed dots on the strip */}
          {pins.map(e => (
            <span key={"d" + e.t.id + e.when} className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/80",
              e.t.done ? "bg-good" : e.when < now ? "bg-destructive" : "bg-white")} style={{ left: pct(e.when) + "%" }} />
          ))}
        </div>
        {/* midnight */}
        <div className="pointer-events-none absolute bottom-3 w-px bg-white/40" style={{ left: `calc(1rem + (100% - 2rem) * ${pct(midnight.getTime()) / 100})`, top: `calc(1rem + ${used * LANE_H + 8}px)`, height: "3.5rem" }}>
          <span className="absolute bottom-0.5 left-1 rounded bg-background/80 px-1 text-[10px] font-semibold text-muted-foreground">завтра</span>
        </div>
        {/* now */}
        <motion.div className="pointer-events-none absolute z-10 w-0.5 rounded-full bg-foreground shadow-[0_0_12px_2px] shadow-foreground/40"
          style={{ top: "0.5rem", height: `calc(${used * LANE_H + 8}px + 4.5rem)` }}
          initial={false} animate={{ left: `calc(1rem + (100% - 2rem) * ${pct(now) / 100})` }} transition={{ duration: 0.8 }}>
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-background tabular-nums">сейчас {hm(now)}</span>
          <motion.span className="absolute bottom-0 left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground" animate={{ scale: [1, 1.6, 1] }} transition={{ duration: 2, repeat: Infinity }} />
        </motion.div>
        {/* hours */}
        <div className="relative mt-1 h-4 text-[10px] text-muted-foreground tabular-nums">
          {hours.map(t => <span key={t} className="absolute -translate-x-1/2" style={{ left: pct(t) + "%" }}>{hm(t).slice(0, 2)}</span>)}
        </div>
      </div>
    </div>
  );
}

function Stars() {
  const stars = useMemo(() => Array.from({ length: 14 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, d: Math.random() * 3 })), []);
  return stars.map((s, k) => (
    <motion.span key={k} className="absolute size-[2px] rounded-full bg-white" style={{ left: s.x + "%", top: s.y + "%" }}
      animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 2.5, delay: s.d, repeat: Infinity }} />
  ));
}

function Pin({ e, now, k, onTick }) {
  const done = e.t.done, missed = !done && e.when < now, soon = !done && !missed && e.when - now < H;
  const tone = done ? "border-good/50 bg-good/10" : missed ? "border-destructive/60 bg-destructive/10" : soon ? "border-amber-500/70 bg-amber-500/15" : "bg-card";
  const hint = done ? "сделано" : missed ? span(now - e.when) + " назад" : "через " + span(e.when - now);
  return (
    <motion.div className="absolute" style={{ left: e.x, top: e.lane * LANE_H, width: PIN_W }}
      initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15 + k * 0.04, type: "spring", stiffness: 300, damping: 22 }}>
      {/* stem down to the strip */}
      <span className="absolute left-0 w-px bg-border" style={{ top: 34, height: `calc(var(--pins) - ${e.lane * LANE_H + 34}px + 8px + 1.75rem)` }} />
      <div style={{ marginLeft: -e.shift }} className={cn("relative -translate-x-3 flex h-[38px] items-center gap-1.5 rounded-lg border px-1.5 shadow-xs", tone)} title={e.t.text}>
        {soon && <motion.span className="absolute inset-0 rounded-lg border-2 border-amber-500" animate={{ opacity: [0.9, 0] , scale: [1, 1.08] }} transition={{ duration: 1.4, repeat: Infinity }} />}
        {missed && <motion.span className="absolute inset-0 rounded-lg border-2 border-destructive" animate={{ opacity: [0.8, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />}
        <button type="button" onClick={() => onTick(e.t)} aria-label={(done ? "Снять отметку: " : "Отметить: ") + e.t.text}
          className={cn("relative grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors", done ? "border-good bg-good text-white" : "border-muted-foreground/50 hover:border-good")}>
          {done && <CheckIcon className="size-3" strokeWidth={3} />}
        </button>
        <div className="min-w-0 leading-tight">
          <div className={cn("truncate text-[12px] font-semibold", done && "text-muted-foreground line-through")}>{e.t.text}</div>
          <div className={cn("truncate text-[10px] whitespace-nowrap tabular-nums", missed ? "text-destructive" : soon ? "text-amber-500" : "text-muted-foreground")}>{e.time} · {hint}</div>
        </div>
      </div>
    </motion.div>
  );
}

/* ───────── important, but without a time ───────── */

/* ───────── the days ahead and the reminders that will come ───────── */

const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function Ahead({ db, now }) {
  const td = today();
  const days = useMemo(() => {
    const me = db.me, mine = t => !t.done && !t.hidden && t.due && (t.assignee ? t.assignee === me : t._owner === me);
    const out = [];
    for (let k = 1; k <= 7; k++) {
      const d = new Date(now); d.setDate(d.getDate() + k); const day = iso(d);
      const list = db.tasks.filter(t => mine(t) && t.due === day).sort((a, b) => (timeOf(a) || "99").localeCompare(timeOf(b) || "99"));
      out.push({ day, d, list });
    }
    return out;
  }, [db.tasks, db.me, td]);
  const next = useMemo(() => plan(db, now).slice(0, 5), [db.tasks, db.cats, db.boards, db.me, Math.floor(now / 60e3)]);
  const [perm, setPerm] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "denied"));
  const ask = async () => setPerm(await Notification.requestPermission());
  const [open, setOpenRaw] = useState(() => { try { return localStorage.getItem("ahead") === "1"; } catch { return false; } });
  const setOpen = v => { setOpenRaw(v); try { localStorage.setItem("ahead", v ? "1" : "0"); } catch {} };
  const count = days.reduce((n, d) => n + d.list.length, 0);
  if (!count && !next.length) return null;
  const when = r => (iso(r.at) === td ? "сегодня" : iso(r.at) === iso(new Date(now + 24 * H)) ? "завтра" : WD[r.at.getDay()] + " " + r.at.getDate() + "." + String(r.at.getMonth() + 1).padStart(2, "0")) + " в " + hm(r.at);
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2 border-t px-4 py-3 text-left text-sm hover:bg-accent/40">
      <CalendarDaysIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        <b className="text-foreground">Неделя</b>{count ? ` · ${count} ${plural(count, ["дело", "дела", "дел"])}` : ""}{next[0] ? ` · напомню ${when(next[0])}` : ""}
      </span>
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
  return (
    <div className="grid gap-4 border-t p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <button type="button" onClick={() => setOpen(false)} className="-mt-1 flex items-center gap-2 text-sm font-semibold lg:col-span-2">
        <CalendarDaysIcon className="size-4 text-muted-foreground" />Неделя и напоминания<ChevronDownIcon className="ml-auto size-4 rotate-180 text-muted-foreground" />
      </button>
      <div className="min-w-0">
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Впереди</div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {days.map(({ day, d, list }, n) => (
            <motion.div key={day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + n * 0.04 }}
              className={cn("w-36 shrink-0 rounded-xl border p-2.5", list.length ? "bg-muted/30" : "opacity-50")}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold">{n === 0 ? "Завтра" : WD[d.getDay()]}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{d.getDate()}.{String(d.getMonth() + 1).padStart(2, "0")}</span>
                {list.length > 0 && <span className="ml-auto rounded-full bg-[var(--ink)]/15 px-1.5 text-[11px] font-semibold tabular-nums text-[var(--ink)]">{list.length}</span>}
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {list.slice(0, 3).map(t => (
                  <li key={t.id} className="flex items-baseline gap-1 text-[12px] leading-tight" title={t.text}>
                    {timeOf(t) && <b className="shrink-0 tabular-nums text-[var(--ink)]">{timeOf(t)}</b>}
                    <span className="truncate">{t.text}</span>
                  </li>
                ))}
                {list.length > 3 && <li className="text-[11px] text-muted-foreground">ещё {list.length - 3}</li>}
                {!list.length && <li className="text-[11px] text-muted-foreground">свободно</li>}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Напоминания
          {!isApp && perm === "default" && (
            <button type="button" onClick={ask} className="ml-auto rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold tracking-normal text-primary-foreground normal-case">Включить на этом устройстве</button>
          )}
          {!isApp && perm === "denied" && <span className="ml-auto text-[11px] tracking-normal normal-case">выключены в браузере</span>}
        </div>
        <ul className="flex flex-col gap-1.5">
          {next.map((r, k) => {
            const ms = r.at - now, soon = ms < 3 * H;
            return (
              <motion.li key={r.key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + k * 0.05 }}
                className="flex items-start gap-2.5 rounded-xl border bg-background/60 px-3 py-2">
                <motion.span animate={soon ? { rotate: [0, -14, 14, -8, 0] } : {}} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2.5 }}
                  className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", soon ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground")}>
                  {soon ? <BellRingIcon className="size-3.5" /> : <BellIcon className="size-3.5" />}
                </motion.span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {iso(r.at) === td ? "сегодня" : iso(r.at) === iso(new Date(now + 24 * H)) ? "завтра" : WD[r.at.getDay()] + " " + r.at.getDate() + "." + String(r.at.getMonth() + 1).padStart(2, "0")} в {hm(r.at)} · через {span(ms)}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
