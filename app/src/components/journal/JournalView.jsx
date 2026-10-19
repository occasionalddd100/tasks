import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  AngryIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, FrownIcon, HeartIcon, ImagePlusIcon, LaughIcon, Loader2Icon, MehIcon,
  SmileIcon, SparklesIcon, StarIcon, Trash2Icon, ZapIcon, FlameIcon, CalendarDaysIcon, TrendingUpIcon, TrendingDownIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDb, getDb, put } from "@/lib/db";
import { today, addDays, dayDiff, fmtDate, plural, MONTHS } from "@/lib/tasks";
import { usePhotoUrl, uploadPhoto, deletePhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { Badge, Habits, useJournal } from "@/components/tasks/ProjectViews";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// how the day went: 5 moods, each with its colour; "Ужасный" is a stormy crimson that glows
export const MOODS = [
  { v: 5, label: "Огонь", icon: LaughIcon, color: "#10b981" },
  { v: 4, label: "Хороший", icon: SmileIcon, color: "#84cc16" },
  { v: 3, label: "Обычный", icon: MehIcon, color: "#38bdf8" },
  { v: 2, label: "Тяжёлый", icon: FrownIcon, color: "#f59e0b" },
  { v: 1, label: "Ужасный", icon: AngryIcon, color: "#be123c" },
];
const moodOf = v => MOODS.find(m => m.v === v);
// marks change the cell's shape; the first one set wins
export const MARKS = [
  { k: "heart", label: "Важное хорошее событие", short: "Событие", icon: HeartIcon, color: "#ec4899" },
  { k: "star", label: "Достижение", short: "Достижение", icon: StarIcon, color: "#eab308" },
  { k: "bolt", label: "Важное плохое событие", short: "Удар", icon: ZapIcon, color: "#8b5cf6" },
];

const iso = d => d.toLocaleDateString("sv-SE");
const dayId = date => getDb().me + ":" + date;
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const WDS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

// journal days merged: done items (tasks, habits, old log) + my mood/marks/memo/photos
function useDays(db) {
  const items = useJournal(db);
  const mine = useMemo(() => {
    const m = new Map();
    for (const d of db.days) if (d._owner === db.me && d.date) m.set(d.date, d);
    return m;
  }, [db.days, db.me]);
  return { items, mine };
}

export default function JournalView() {
  const db = useDb();
  const { items, mine } = useDays(db);
  const [sel, setSel] = useState(today());
  const panel = useRef(null);
  const bursts = useConfetti();

  const info = date => ({ items: items.get(date)?.items || [], note: items.get(date)?.note || "", doc: mine.get(date) });
  const active = date => { const i = info(date); return i.items.length > 0 || !!i.doc?.mood || !!i.doc?.memo || !!i.doc?.photos?.length; };

  const streak = useMemo(() => {
    let n = 0, d = new Date();
    if (!active(iso(d))) d.setDate(d.getDate() - 1);
    while (active(iso(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }, [items, mine]);
  const deadline = Math.ceil((new Date("2026-10-31T23:59:00+03:00") - new Date()) / 864e5);
  const todayDone = items.get(today())?.items.length || 0;
  const todayMood = moodOf(mine.get(today())?.mood);

  const pick = date => { setSel(date); setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  if (!db.ready) return <div className="p-8 text-sm text-muted-foreground">Загружаю…</div>;
  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-5 pb-16 md:px-8 md:pt-8">
      {/* soft glow tinted by today's mood */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[42rem] max-w-full -translate-x-1/2 rounded-full blur-3xl"
        animate={{ backgroundColor: todayMood?.color || "#64748b", opacity: todayMood ? 0.18 : 0.08 }} transition={{ duration: 0.8 }} />
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Журнал</h1>
        <div className="flex flex-wrap gap-2">
          <Badge>сегодня: <b>{todayDone}</b> {plural(todayDone, ["дело", "дела", "дел"])}</Badge>
          {streak >= 2 && <Badge><FlameIcon className="size-3.5 text-orange-500" />подряд: <b>{streak}</b> {plural(streak, ["день", "дня", "дней"])}</Badge>}
          {deadline >= 0 && <Badge>до 31.10: <b>{deadline}</b> {plural(deadline, ["день", "дня", "дней"])}</Badge>}
        </div>
      </header>

      <Heatmap info={info} sel={sel} onPick={pick} />
      <div ref={panel} className="scroll-mt-4">
        <DayPanel key={sel} date={sel} setDate={setSel} info={info(sel)} burst={bursts.fire} />
      </div>
      <Stats info={info} items={items} mine={mine} streak={streak} />
      <Habits habits={db.habits} />
      <Feed info={info} items={items} mine={mine} onPick={pick} />
      {bursts.layer}
    </div>
  );
}

/* ───────────── year grid ───────────── */

const S = 13, G = 3, STEP = S + G, TOP = 18, LEFT = 24;
const HEART = "M6.5 12 C6.5 12 0.6 8.2 0.6 4.3 C0.6 2.3 2.2 0.9 3.9 0.9 C5.1 0.9 6 1.6 6.5 2.5 C7 1.6 7.9 0.9 9.1 0.9 C10.8 0.9 12.4 2.3 12.4 4.3 C12.4 8.2 6.5 12 6.5 12 Z";
const STAR = (() => {
  const p = [];
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.8 : 6.6, a = -Math.PI / 2 + (i * Math.PI) / 5; p.push((6.5 + r * Math.cos(a)).toFixed(2) + " " + (7 + r * Math.sin(a)).toFixed(2)); }
  return "M" + p.join(" L") + " Z";
})();
const BOLT = "M7.8 0.4 L1.6 7.4 H5.9 L4.8 12.6 L11.4 5.2 H7.1 Z";
const SHAPES = { heart: HEART, star: STAR, bolt: BOLT };

function cellLook(i) {
  const mood = moodOf(i.doc?.mood), mark = MARKS.find(m => i.doc?.marks?.includes(m.k));
  const n = i.items.length;
  const fill = mood ? mood.color
    : mark ? mark.color
    : n ? `color-mix(in oklch, var(--foreground) ${n >= 8 ? 70 : n >= 5 ? 50 : n >= 3 ? 34 : 20}%, transparent)`
    : "var(--muted)";
  return { fill, mark, mood, n };
}

const RANGES = [["1", "Месяц"], ["3", "3 месяца"], ["12", "Год"]];

function Heatmap({ info, sel, onPick }) {
  const [tip, setTip] = useState(null);
  const [range, setRange] = useState(() => { try { return localStorage.getItem("journalRange") || "3"; } catch { return "3"; } });
  const pickRange = r => { setRange(r); setTip(null); try { localStorage.setItem("journalRange", r); } catch {} };
  const hover = (date, e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ date, x: r.left + r.width / 2, y: r.top }); };
  const months = useMemo(() => {
    const t = new Date(), out = [];
    for (let k = +range - 1; k >= 0; k--) { const d = new Date(t.getFullYear(), t.getMonth() - k, 1); out.push([d.getFullYear(), d.getMonth()]); }
    return out;
  }, [range]);
  return (
    <section className="rounded-2xl border bg-card/80 p-4 shadow-xs backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDaysIcon className="size-4 text-muted-foreground" />
        <h2 className="text-[15px] font-semibold">Дни</h2>
        <div role="tablist" className="ml-auto inline-flex gap-0.5 rounded-lg border bg-muted p-0.5">
          {RANGES.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => pickRange(k)}
              className={cn("relative h-7 rounded-md px-2.5 text-xs font-medium transition-colors", range === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {range === k && <motion.span layoutId="range-pill" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", bounce: 0.15, duration: 0.35 }} />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={range} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {range === "12"
            ? <YearGrid info={info} sel={sel} onPick={onPick} hover={hover} leave={() => setTip(null)} />
            : <div className={cn("grid gap-4", range === "3" ? "grid-cols-3 max-sm:gap-2" : "mx-auto max-w-md")}>
                {months.map(([y, m]) => <MonthGrid key={y + "-" + m} y={y} m={m} big={range === "1"} info={info} sel={sel} onPick={onPick} hover={hover} leave={() => setTip(null)} />)}
              </div>}
        </motion.div>
      </AnimatePresence>
      <Legend />
      {tip && <Tip {...tip} i={info(tip.date)} />}
    </section>
  );
}

// one month as a calendar: weeks in rows, Monday first
function MonthGrid({ y, m, big, info, sel, onPick, hover, leave }) {
  const now = today();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), pad = (first.getDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...Array.from({ length: days }, (_, k) => iso(new Date(y, m, k + 1)))];
  return (
    <div className="min-w-0">
      <div className={cn("mb-1.5 font-semibold capitalize", big ? "text-center text-[15px]" : "text-[13px] max-sm:text-xs")}>
        {MONTHS_NOM[m]}{y !== new Date().getFullYear() && " " + y}
      </div>
      <div className={cn("grid grid-cols-7", big ? "gap-1.5" : "gap-1 max-sm:gap-[3px]")}>
        {WDS.map(w => <span key={w} className={cn("text-center text-muted-foreground", big ? "pb-1 text-xs" : "text-[10px] max-sm:hidden")}>{w}</span>)}
        {cells.map((date, k) => {
          if (!date) return <span key={"p" + k} />;
          const future = date > now, i = info(date), { fill, mark, mood } = cellLook(i);
          return (
            <button key={date} type="button" disabled={future} onClick={() => onPick(date)} onMouseEnter={e => hover(date, e)} onMouseLeave={leave}
              aria-label={fmtDate(date) + (mood ? ", " + mood.label : "")}
              className={cn("cell relative grid aspect-square place-items-center rounded-[22%] transition-[opacity,transform] hover:scale-110 disabled:pointer-events-none disabled:opacity-35",
                mood?.v === 1 && "terrible", date === sel && "ring-2 ring-foreground ring-offset-2 ring-offset-card", date === now && date !== sel && "ring-1 ring-foreground/70 ring-offset-1 ring-offset-card")}
              style={{ background: mark ? "transparent" : fill, animationDelay: Math.min(k * 12, 500) + "ms" }}>
              {mark && <svg viewBox="0 0 13 13" className="absolute inset-0 size-full"><path d={SHAPES[mark.k]} style={{ fill }} /></svg>}
              {big && <span className={cn("relative text-xs font-medium tabular-nums", mood || mark || i.items.length >= 5 ? "text-white drop-shadow" : "text-muted-foreground")}>{+date.slice(8)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YearGrid({ info, sel, onPick, hover, leave }) {
  const box = useRef(null);
  const weeks = useMemo(() => {
    const t = new Date(), start = new Date(t);
    start.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 52 * 7);
    const out = [];
    for (let d = new Date(start), w = -1; d <= t; d.setDate(d.getDate() + 1)) {
      if ((d.getDay() + 6) % 7 === 0) { out.push([]); w++; }
      out[w].push(iso(d));
    }
    return out;
  }, []);
  useEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth; }, []);
  const W = LEFT + weeks.length * STEP, H = TOP + 7 * STEP;
  const now = today();
  let lastMonth = -1;

  return (
      <div ref={box} className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <svg width={W} height={H} className="block select-none" role="grid" aria-label="Дни за год">
          {weeks.map((wk, x) => {
            const m = +wk[0].slice(5, 7) - 1, label = m !== lastMonth && +wk[0].slice(8) <= 7 ? MONTHS[m].slice(0, 3) : null;
            if (label) lastMonth = m;
            return label && <text key={"m" + x} x={LEFT + x * STEP} y={11} className="fill-muted-foreground text-[10px]">{label}</text>;
          })}
          {[0, 2, 4].map(r => <text key={r} x={0} y={TOP + r * STEP + 10} className="fill-muted-foreground text-[10px]">{WDS[r]}</text>)}
          {weeks.map((wk, x) => wk.map((date, y) => {
            const i = info(date), { fill, mark, mood } = cellLook(i);
            const tx = LEFT + x * STEP, ty = TOP + y * STEP, isSel = date === sel, isToday = date === now;
            const common = {
              className: cn("cell cursor-pointer", mood?.v === 1 && "terrible"),
              style: { fill, animationDelay: Math.min(x * 14, 700) + "ms" },
              onClick: () => onPick(date),
              onMouseEnter: e => hover(date, e),
              onMouseLeave: leave,
              role: "gridcell", "aria-label": fmtDate(date) + (mood ? ", " + mood.label : ""),
            };
            return (
              <g key={date} transform={`translate(${tx} ${ty})`}>
                {mark ? <path d={SHAPES[mark.k]} {...common} /> : <rect width={S} height={S} rx={3} {...common} />}
                {isToday && <rect x={-1.5} y={-1.5} width={S + 3} height={S + 3} rx={4} className="today-ring pointer-events-none fill-none stroke-foreground" strokeWidth={1.2} />}
                {isSel && <rect x={-2} y={-2} width={S + 4} height={S + 4} rx={4.5} className="pointer-events-none fill-none stroke-foreground" strokeWidth={1.8} />}
              </g>
            );
          }))}
        </svg>
      </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        меньше дел
        {[0, 20, 34, 50, 70].map(p => <i key={p} className="size-2.5 rounded-[3px]" style={{ background: p ? `color-mix(in oklch, var(--foreground) ${p}%, transparent)` : "var(--muted)" }} />)}
        больше
      </span>
      <span className="flex flex-wrap items-center gap-2.5">
        {MOODS.map(m => <span key={m.v} className="flex items-center gap-1"><i className="size-2.5 rounded-[3px]" style={{ background: m.color }} />{m.label}</span>)}
      </span>
      <span className="flex items-center gap-2.5">
        {MARKS.map(m => <span key={m.k} className="flex items-center gap-1"><m.icon className="size-3" style={{ color: m.color, fill: m.color }} />{m.short}</span>)}
      </span>
    </div>
  );
}

function Tip({ date, x, y, i }) {
  const mood = moodOf(i.doc?.mood), marks = MARKS.filter(m => i.doc?.marks?.includes(m.k));
  return createPortal(
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }}
      className="pointer-events-none fixed z-50 max-w-60 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg"
      style={{ left: x, top: y - 6 }}>
      <div className="font-semibold">{fmtDate(date)}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
        {mood && <span style={{ color: mood.color }}>{mood.label}</span>}
        {marks.map(m => <span key={m.k} style={{ color: m.color }}>{m.short}</span>)}
        <span>{i.items.length ? `${i.items.length} ${plural(i.items.length, ["дело", "дела", "дел"])}` : "без дел"}</span>
        {i.doc?.photos?.length > 0 && <span>· фото {i.doc.photos.length}</span>}
      </div>
      {i.doc?.memo && <div className="mt-1 line-clamp-2">{i.doc.memo}</div>}
    </motion.div>,
    document.body
  );
}

/* ───────────── one day ───────────── */

function DayPanel({ date, setDate, info, burst }) {
  const { doc, items, note } = info;
  const id = dayId(date);
  const save = f => put("days", id, { date, ...f });
  const mood = moodOf(doc?.mood);
  const marks = doc?.marks || [];
  const isToday = date === today(), future = date > today();
  const dir = useRef(0);

  const setMood = (v, e) => {
    const next = doc?.mood === v ? 0 : v;
    save({ mood: next });
    if (next === 5) burst(e, ["#10b981", "#84cc16", "#facc15", "#38bdf8"]);
    if (next === 1) burst(e, ["#be123c", "#7f1d1d", "#4c0519"], { sad: true });
  };
  const toggleMark = (k, e) => {
    const on = marks.includes(k);
    save({ marks: on ? marks.filter(x => x !== k) : [...marks, k] });
    if (!on && k !== "bolt") burst(e, k === "heart" ? ["#ec4899", "#f472b6", "#fb7185"] : ["#eab308", "#facc15", "#fde047"], { shape: k });
  };
  const go = n => { const d = new Date(date); d.setDate(d.getDate() + n); const k = iso(d); if (k <= today()) setDate(k); };

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <motion.div aria-hidden className="absolute inset-x-0 top-0 h-1" animate={{ backgroundColor: mood?.color || "transparent" }} />
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <button type="button" onClick={() => go(-1)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Предыдущий день"><ChevronLeftIcon className="size-4" /></button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate text-lg font-semibold">{fmtDate(date)}</h2>
          {!isToday && <button type="button" onClick={() => setDate(today())} className="text-xs text-muted-foreground hover:text-foreground">
            {dayDiff(date, today()) === 1 ? "вчера" : `${dayDiff(date, today())} ${plural(dayDiff(date, today()), ["день", "дня", "дней"])} назад`} · к сегодня
          </button>}
        </div>
        <button type="button" onClick={() => go(1)} disabled={isToday || future} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Следующий день"><ChevronRightIcon className="size-4" /></button>
      </div>

      <div className="flex flex-col gap-5 p-4 md:p-5">
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Как прошёл день?</p>
          <div className="grid grid-cols-5 gap-2">
            {MOODS.map(m => {
              const on = doc?.mood === m.v;
              return (
                <motion.button key={m.v} type="button" onClick={e => setMood(m.v, e)} whileTap={{ scale: 0.9 }} aria-pressed={on}
                  className={cn("relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-xs font-medium transition-colors", on ? "border-transparent text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
                  {on && <motion.span layoutId="mood-pill" className="absolute inset-0 rounded-xl" style={{ background: m.color + "26", boxShadow: `inset 0 0 0 1.5px ${m.color}` }} transition={{ type: "spring", bounce: 0.3, duration: 0.4 }} />}
                  <motion.span className="relative" animate={on ? { scale: [1, 1.35, 1], rotate: m.v === 1 ? [0, -8, 8, 0] : [0, 0] } : { scale: 1 }} transition={{ duration: 0.45 }}>
                    <m.icon className="size-7" style={{ color: m.color }} strokeWidth={on ? 2.4 : 1.8} />
                  </motion.span>
                  <span className="relative">{m.label}</span>
                </motion.button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {MARKS.map(m => {
              const on = marks.includes(m.k);
              return (
                <motion.button key={m.k} type="button" whileTap={{ scale: 0.92 }} onClick={e => toggleMark(m.k, e)} aria-pressed={on}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors", on ? "font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60")}
                  style={on ? { background: m.color + "22", borderColor: m.color } : undefined}>
                  <motion.span animate={on ? { scale: [1, 1.5, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}>
                    <m.icon className="size-3.5" style={{ color: m.color, fill: on ? m.color : "none" }} />
                  </motion.span>
                  {m.label}
                </motion.button>
              );
            })}
          </div>
        </div>

        <Memo key={id} date={date} value={doc?.memo || ""} save={save} />
        <Photos date={date} photos={doc?.photos || []} save={save} />

        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            Сделано
            {items.length > 0 && <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs font-semibold text-good tabular-nums">{items.length}</span>}
          </p>
          {items.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {items.map((it, k) => (
                <motion.li key={k} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(k * 0.025, 0.4) }}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-background px-2 py-1 text-[13px]" title={it.from}>
                  <CheckIcon className={cn("size-3.5 shrink-0", it.from === "повторяющаяся" ? "text-violet-500" : "text-good")} />
                  <span className="truncate">{it.text}</span>
                </motion.li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground/80">{future ? "Этот день ещё впереди." : "В этот день отмеченных дел нет."}</p>}
          {note && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{note}</p>}
        </div>
      </div>
    </motion.section>
  );
}

function Memo({ date, value, save }) {
  const [text, setText] = useState(value);
  const focused = useRef(false), timer = useRef(null), pending = useRef(null), ta = useRef(null);
  useEffect(() => { if (!focused.current) setText(value); }, [value]);
  const flush = () => { clearTimeout(timer.current); if (pending.current !== null) { save({ memo: pending.current }); pending.current = null; } };
  useEffect(() => flush, []);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, [text]);
  const change = v => { setText(v); pending.current = v; clearTimeout(timer.current); timer.current = setTimeout(flush, 700); };
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><SparklesIcon className="size-3.5" />Что запомнилось</span>
      <textarea ref={ta} value={text} rows={3} onChange={e => change(e.target.value)}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; flush(); }}
        placeholder="Пара строк о дне: что было, что почувствовал, что хочется не забыть"
        className="w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-[15px] leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/40" />
    </label>
  );
}

function Photos({ date, photos, save }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(0);
  const [open, setOpen] = useState(null);
  const [over, setOver] = useState(false);

  const addFiles = async files => {
    const list = [...files].filter(f => f.type.startsWith("image/"));
    if (!list.length) return;
    setBusy(list.length);
    for (const f of list) {
      try {
        if (f.size > 25e6) throw new Error("файл больше 25 МБ");
        const p = await uploadPhoto(f, date);
        const cur = getDb().days.find(d => d.id === dayId(date))?.photos || [];
        await save({ photos: [...cur, p] });
      } catch (e) { toast.error("Фото не загрузилось: " + (e.message || e)); }
      setBusy(b => b - 1);
    }
  };
  const del = async p => {
    setOpen(null);
    const cur = getDb().days.find(d => d.id === dayId(date))?.photos || [];
    await save({ photos: cur.filter(x => x.path !== p.path) });
    deletePhoto(p.path);
  };

  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
      onPaste={e => addFiles(e.clipboardData.files)}>
      <p className="mb-2 text-sm font-medium text-muted-foreground">Фото дня</p>
      <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2 rounded-xl transition-shadow sm:grid-cols-[repeat(auto-fill,7rem)]", over && "ring-2 ring-ring/50 ring-offset-4 ring-offset-card")}>
        <AnimatePresence initial={false}>
          {photos.map((p, k) => (
            <motion.button key={p.path} type="button" layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
              onClick={() => setOpen(k)} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
              <Thumb path={p.path} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </motion.button>
          ))}
          {Array.from({ length: busy }, (_, k) => (
            <motion.div key={"b" + k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid aspect-square animate-pulse place-items-center rounded-xl bg-muted">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </motion.div>
          ))}
        </AnimatePresence>
        <button type="button" onClick={() => input.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent/40 hover:text-foreground">
          <ImagePlusIcon className="size-5" />добавить
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
      <Lightbox photos={photos} index={open} setIndex={setOpen} onDelete={del} />
    </div>
  );
}

function Thumb({ path, className }) {
  const url = usePhotoUrl(path);
  const [loaded, setLoaded] = useState(false);
  return url
    ? <img src={url} alt="" loading="lazy" onLoad={() => setLoaded(true)} className={cn(className, "transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")} />
    : <div className={cn(className, "animate-pulse bg-muted")} />;
}

function Lightbox({ photos, index, setIndex, onDelete }) {
  const p = index != null ? photos[index] : null;
  const url = usePhotoUrl(p?.path);
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(false), [index]);
  const step = n => setIndex(i => (i + n + photos.length) % photos.length);
  return (
    <Dialog open={!!p} onOpenChange={o => !o && setIndex(null)}>
      <DialogContent className="max-w-[min(64rem,calc(100%-1rem))] gap-3 border-none bg-black/90 p-3 text-white sm:max-w-[min(64rem,calc(100%-2rem))]"
        onKeyDown={e => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); }}>
        <DialogTitle className="sr-only">Фото дня</DialogTitle>
        <div className="relative grid min-h-60 place-items-center">
          <AnimatePresence mode="wait">
            {url && <motion.img key={p?.path} src={url} alt="" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="max-h-[78vh] w-auto rounded-lg object-contain" />}
          </AnimatePresence>
          {photos.length > 1 && <>
            <button type="button" onClick={() => step(-1)} className="absolute left-1 grid size-10 place-items-center rounded-full bg-black/40 hover:bg-black/60" aria-label="Предыдущее"><ChevronLeftIcon /></button>
            <button type="button" onClick={() => step(1)} className="absolute right-1 grid size-10 place-items-center rounded-full bg-black/40 hover:bg-black/60" aria-label="Следующее"><ChevronRightIcon /></button>
          </>}
        </div>
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>{index + 1} / {photos.length}</span>
          <button type="button" onClick={() => armed ? onDelete(p) : setArmed(true)}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white/10", armed && "text-red-400")}>
            <Trash2Icon className="size-4" />{armed ? "точно удалить?" : "удалить"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── numbers ───────────── */

function Stats({ info, items, mine, streak }) {
  const s = useMemo(() => {
    const last = n => Array.from({ length: n }, (_, k) => addDays(-(n - 1 - k)));
    const d30 = last(30), d14 = last(14);
    const moods = d30.map(d => mine.get(d)?.mood || 0);
    const rated = moods.filter(Boolean);
    const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
    const cnt = d => items.get(d)?.items.length || 0;
    const week = d14.slice(7).reduce((a, d) => a + cnt(d), 0), prev = d14.slice(0, 7).reduce((a, d) => a + cnt(d), 0);
    const dist = MOODS.map(m => ({ ...m, n: moods.filter(v => v === m.v).length }));
    const year = String(new Date().getFullYear());
    const events = [...mine.values()].filter(d => d.date.startsWith(year));
    return {
      moods, avg, rated: rated.length, week, prev, dist,
      hearts: events.filter(d => d.marks?.includes("heart")).length,
      stars: events.filter(d => d.marks?.includes("star")).length,
      photos: events.reduce((a, d) => a + (d.photos?.length || 0), 0),
    };
  }, [items, mine]);
  const avgMood = moodOf(Math.round(s.avg));
  const delta = s.week - s.prev;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Серия" value={streak} unit={plural(streak, ["день", "дня", "дней"])} hint="подряд с делами или отметкой" icon={FlameIcon} tint="#f97316" />
      <Tile label="Сделано за 7 дней" value={s.week} hint={delta === 0 ? "как на прошлой неделе" : `${delta > 0 ? "+" : ""}${delta} к прошлой неделе`}
        icon={delta >= 0 ? TrendingUpIcon : TrendingDownIcon} tint={delta >= 0 ? "#10b981" : "#f59e0b"} />
      <div className="col-span-2 flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Настроение за 30 дней</span>
          <span className="text-sm font-semibold" style={{ color: avgMood?.color }}>{avgMood ? avgMood.label : "нет отметок"}</span>
        </div>
        <Spark values={s.moods} />
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {s.dist.filter(m => m.n).map(m => (
            <motion.i key={m.v} title={`${m.label}: ${m.n}`} className="block h-full" style={{ background: m.color }}
              initial={{ width: 0 }} animate={{ width: (m.n / 30) * 100 + "%" }} transition={{ duration: 0.8, ease: [0.2, 0, 0, 1] }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          {s.dist.filter(m => m.n).map(m => <span key={m.v}><b className="font-semibold" style={{ color: m.color }}>{m.n}</b> {m.label.toLowerCase()}</span>)}
          {s.rated < 30 && <span>{30 - s.rated} без отметки</span>}
        </div>
      </div>
      <div className="col-span-2 flex items-center justify-around gap-2 rounded-2xl border bg-card p-3 shadow-xs md:col-span-4">
        <Count icon={HeartIcon} color="#ec4899" n={s.hearts} label={plural(s.hearts, ["важное событие", "важных события", "важных событий"])} />
        <Count icon={StarIcon} color="#eab308" n={s.stars} label={plural(s.stars, ["достижение", "достижения", "достижений"])} />
        <Count icon={ImagePlusIcon} color="#38bdf8" n={s.photos} label="фото за год" />
      </div>
    </section>
  );
}

function Tile({ label, value, unit, hint, icon: Icon, tint }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4 shadow-xs">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="size-3.5" style={{ color: tint }} />{label}</span>
      <span className="text-3xl font-bold tracking-tight tabular-nums"><Num n={value} />{unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function Count({ icon: Icon, color, n, label }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-5" style={{ color, fill: color + "33" }} />
      <span className="text-xl font-bold tabular-nums"><Num n={n} /></span>
      <span className="text-xs text-muted-foreground max-sm:hidden">{label}</span>
    </div>
  );
}

// counts up from 0 on first show
function Num({ n }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, t0;
    const tick = t => { t0 ??= t; const k = Math.min(1, (t - t0) / 700); setV(Math.round(n * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return v;
}

function Spark({ values }) {
  const W = 300, H = 44, step = W / (values.length - 1);
  const pts = values.map((v, k) => v ? [k * step, H - 4 - ((v - 1) / 4) * (H - 8)] : null).filter(Boolean);
  const line = pts.map(p => p.join(",")).join(" ");
  if (pts.length < 2) return <p className="grid h-11 place-items-center text-xs text-muted-foreground">Отмечай дни, и тут появится график</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spark" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2={H - 4}>
          <stop offset="0%" stopColor="#10b981" /><stop offset="50%" stopColor="#38bdf8" /><stop offset="100%" stopColor="#be123c" />
        </linearGradient>
      </defs>
      {pts.length > 1 && <>
        <motion.polygon points={`${pts[0][0]},${H} ${line} ${pts.at(-1)[0]},${H}`} fill="url(#spark)" opacity={0.12} initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ delay: 0.6 }} />
        <motion.polyline points={line} fill="none" stroke="url(#spark)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
      </>}
    </svg>
  );
}

/* ───────────── recent days ───────────── */

function Feed({ info, items, mine, onPick }) {
  const [limit, setLimit] = useState(14);
  const dates = useMemo(() => {
    const all = new Set([...items.keys(), ...mine.keys()]);
    return [...all].filter(d => d <= today()).sort().reverse().filter(d => { const i = info(d); return i.items.length || i.doc?.memo || i.doc?.mood || i.doc?.photos?.length || i.note; });
  }, [items, mine]);
  if (!dates.length) return <p className="text-sm text-muted-foreground">Тут появится лента дней. Отметь, как прошёл сегодняшний, и добавь пару строк.</p>;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[15px] font-semibold">Лента</h2>
      {dates.slice(0, limit).map((d, k) => {
        const i = info(d), { fill, mark, mood } = cellLook(i);
        return (
          <motion.button key={d} type="button" onClick={() => onPick(d)} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-20px" }}
            transition={{ duration: 0.3, delay: Math.min(k, 6) * 0.03 }}
            className="group flex items-start gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:bg-accent/40">
            <svg width={18} height={18} viewBox="0 0 13 13" className="mt-0.5 shrink-0">
              {mark ? <path d={SHAPES[mark.k]} style={{ fill }} /> : <rect width={13} height={13} rx={3} style={{ fill }} />}
            </svg>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] font-semibold">{fmtDate(d)}</span>
                {mood && <span className="text-xs font-medium" style={{ color: mood.color }}>{mood.label}</span>}
                {i.items.length > 0 && <span className="text-xs text-muted-foreground">{i.items.length} {plural(i.items.length, ["дело", "дела", "дел"])}</span>}
              </div>
              {(i.doc?.memo || i.note) && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{i.doc?.memo || i.note}</p>}
              {!i.doc?.memo && !i.note && i.items.length > 0 && <p className="mt-0.5 truncate text-sm text-muted-foreground">{i.items.slice(0, 4).map(x => x.text).join(" · ")}</p>}
            </div>
            {i.doc?.photos?.length > 0 && (
              <div className="flex shrink-0 -space-x-3">
                {i.doc.photos.slice(0, 3).map(p => <Thumb key={p.path} path={p.path} className="size-11 rounded-lg border-2 border-card object-cover" />)}
              </div>
            )}
          </motion.button>
        );
      })}
      {dates.length > limit && <button type="button" onClick={() => setLimit(l => l + 14)} className="self-center rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">Показать ещё</button>}
    </section>
  );
}

/* ───────────── confetti ───────────── */

function useConfetti() {
  const [list, setList] = useState([]);
  const fire = (e, colors, { sad, shape } = {}) => {
    const r = e?.currentTarget?.getBoundingClientRect?.();
    const x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : innerHeight / 2;
    const id = Math.random();
    const parts = Array.from({ length: sad ? 14 : 26 }, (_, k) => {
      const a = sad ? Math.PI / 2 + (Math.random() - 0.5) * 1.2 : (k / 26) * Math.PI * 2 + Math.random() * 0.4;
      const dist = sad ? 60 + Math.random() * 60 : 50 + Math.random() * 90;
      return { k, dx: Math.cos(a) * dist, dy: Math.sin(a) * dist - (sad ? 0 : 30), c: colors[k % colors.length], rot: Math.random() * 540 - 270, s: 5 + Math.random() * 5 };
    });
    setList(l => [...l, { id, x, y, parts, sad, shape }]);
    setTimeout(() => setList(l => l.filter(b => b.id !== id)), 1300);
  };
  const layer = createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
      {list.map(b => b.parts.map(p => (
        <motion.span key={b.id + "-" + p.k} className="absolute" style={{ left: b.x, top: b.y }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 }}
          animate={{ x: p.dx, y: [0, p.dy, p.dy + (b.sad ? 40 : 60)], opacity: [1, 1, 0], scale: 1, rotate: p.rot }}
          transition={{ duration: b.sad ? 1.1 : 1.0, ease: "easeOut" }}>
          {b.shape === "heart" ? <HeartIcon style={{ color: p.c, fill: p.c, width: p.s + 4, height: p.s + 4 }} />
            : b.shape === "star" ? <StarIcon style={{ color: p.c, fill: p.c, width: p.s + 4, height: p.s + 4 }} />
            : <i className={cn("block", b.sad ? "rounded-full" : "rounded-[2px]")} style={{ background: p.c, width: p.s, height: b.sad ? p.s : p.s * 0.6 }} />}
        </motion.span>
      )))}
    </div>,
    document.body
  );
  return { fire, layer };
}
