import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  AngryIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, FrownIcon, HeartIcon, ImagePlusIcon, LaughIcon, Loader2Icon, MehIcon,
  SmileIcon, SparklesIcon, StarIcon, Trash2Icon, ZapIcon, FlameIcon, CalendarDaysIcon, TrendingUpIcon, TrendingDownIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDb, getDb, put, update } from "@/lib/db";
import { today, addDays, dayDiff, fmtDate, plural, MONTHS } from "@/lib/tasks";
import { usePhotoUrl, uploadPhoto, deletePhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { Badge, Habits, useJournal } from "@/components/tasks/ProjectViews";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useNavItems, scrollTop } from "@/components/MobileNav";
import { ClipboardPasteIcon, PencilIcon, PlusIcon, XIcon, ListChecksIcon, CornerDownRightIcon, CalendarCheckIcon, NotebookPenIcon, BarChart3Icon } from "lucide-react";

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
// a day's words: the old single note, or its latest diary entry
const dayText = doc => doc?.memo || doc?.thoughts?.at(-1)?.text || "";
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
  const [open, setOpen] = useState(null); // { date, edit }
  const bursts = useConfetti();

  // done items: tasks, habits, old log, plus what I wrote down by hand for that day
  const info = date => ({
    items: [...(items.get(date)?.items || []), ...(mine.get(date)?.extra || []).map(text => ({ text, from: "вручную" }))],
    note: items.get(date)?.note || "", doc: mine.get(date),
  });
  const active = date => { const i = info(date); return i.items.length > 0 || !!i.doc?.mood || !!dayText(i.doc) || !!i.doc?.photos?.length; };

  const streak = useMemo(() => {
    let n = 0, d = new Date();
    if (!active(iso(d))) d.setDate(d.getDate() - 1);
    while (active(iso(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }, [items, mine]);
  const deadline = Math.ceil((new Date("2026-10-31T23:59:00+03:00") - new Date()) / 864e5);
  const todayDone = info(today()).items.length;
  const todayMood = moodOf(mine.get(today())?.mood);

  const pick = (date, edit = false) => setOpen({ date, edit });
  const [tab, setTabRaw] = useState(() => { try { return localStorage.getItem("journalTab") || "day"; } catch { return "day"; } });
  const setTab = t => { setTabRaw(t); try { localStorage.setItem("journalTab", t); } catch {} };
  const only = t => tab !== t && "max-md:hidden"; // on the phone each tab shows its own blocks
  const memories = useMemories(info, mine);

  if (!db.ready) return <div className="p-8 text-sm text-muted-foreground">Загружаю…</div>;
  return (
    <div className="relative mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 pt-5 pb-8 md:px-8 md:pt-8 md:pb-16">
      {/* soft glow tinted by today's mood */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[42rem] max-w-full -translate-x-1/2 rounded-full"
        style={{ filter: "blur(64px)", WebkitFilter: "blur(64px)" }} animate={{ backgroundColor: todayMood?.color || "#64748b", opacity: todayMood ? 0.18 : 0.08 }} transition={{ duration: 0.8 }} />
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Журнал</h1>
          <span className="ml-auto"><MemoriesButton cards={memories} onPick={pick} /></span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>сегодня: <b>{todayDone}</b> {plural(todayDone, ["дело", "дела", "дел"])}</Badge>
          {streak >= 2 && <Badge><FlameIcon className="size-3.5 text-orange-500" />подряд: <b>{streak}</b> {plural(streak, ["день", "дня", "дней"])}</Badge>}
          {deadline >= 0 && <Badge>до 31.10: <b>{deadline}</b> {plural(deadline, ["день", "дня", "дней"])}</Badge>}
        </div>
      </header>

      <div className={cn(only("day"))}><QuickDone extra={mine.get(today())?.extra || []} burst={bursts.fire} /></div>
      {/* desktop: two columns filling the width; phone: tabs switched from the bottom bar */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-5 max-lg:contents">
          <div className={cn("max-lg:order-2", only("days"))}><Heatmap info={info} sel={open?.date} onPick={pick} /></div>
          <div className={cn("max-lg:order-3", only("thoughts"))}><ThoughtsCard i={info(today())} /></div>
          <div className={cn("max-lg:order-5", only("stats"))}><Habits habits={db.habits} /></div>
        </div>
        <div className="flex flex-col gap-5 max-lg:contents">
          <div className={cn("max-lg:order-1", only("day"))}><TodayPanel i={info(today())} onOpen={edit => pick(today(), edit)} /></div>
          <div className={cn("max-lg:order-4", only("stats"))}><Stats info={info} items={items} mine={mine} streak={streak} /></div>
        </div>
      </div>
      <BottomNav tab={tab} setTab={setTab} thoughts={(mine.get(today())?.thoughts?.length || 0)} />
      <DayDialog open={open} setOpen={setOpen} info={info} burst={bursts.fire} />
      {bursts.layer}
    </div>
  );
}

const TABS = [
  { k: "day", label: "Сегодня", icon: CalendarCheckIcon },
  { k: "thoughts", label: "Мысли", icon: NotebookPenIcon },
  { k: "days", label: "Дни", icon: CalendarDaysIcon },
  { k: "stats", label: "Итоги", icon: BarChart3Icon },
];

// phone only: tabs at the thumb, instead of one long scroll
function BottomNav({ tab, setTab, thoughts }) {
  useNavItems(TABS.map(({ k, label, icon }) => ({ k, label, icon, active: tab === k, badge: k === "thoughts" ? thoughts : 0, onClick: () => { setTab(k); scrollTop(); } })));
  return null;
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

function Heatmap({ info, sel, onPick: pick }) {
  const [tip, setTip] = useState(null);
  const onPick = d => { setTip(null); pick(d); };
  const [range, setRange] = useState(() => { try { return localStorage.getItem("journalRange") || "3"; } catch { return "3"; } });
  const pickRange = r => { setRange(r); setTip(null); try { localStorage.setItem("journalRange", r); } catch {} };
  const hover = (date, e) => { if (matchMedia("(hover: none)").matches) return; const r = e.currentTarget.getBoundingClientRect(); setTip({ date, x: r.left + r.width / 2, y: r.top, h: r.height }); };
  const months = useMemo(() => {
    const t = new Date(), out = [];
    for (let k = +range - 1; k >= 0; k--) { const d = new Date(t.getFullYear(), t.getMonth() - k, 1); out.push([d.getFullYear(), d.getMonth()]); }
    return out;
  }, [range]);
  return (
    <section className="rounded-2xl border bg-card/80 p-4 shadow-xs" style={GLASS}>
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

// big hover card: cover photo, mood, memo, what got done
function Tip({ date, x, y, h, i }) {
  const mood = moodOf(i.doc?.mood), marks = MARKS.filter(m => i.doc?.marks?.includes(m.k)), photo = i.doc?.photos?.[0];
  const W = 288, below = y < 340;
  const left = Math.max(8, Math.min(innerWidth - W - 8, x - W / 2));
  return createPortal(
    <motion.div initial={{ opacity: 0, scale: 0.92, y: below ? -6 : 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", bounce: 0.25, duration: 0.3 }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl"
      style={{ left, width: W, ...(below ? { top: y + h + 8 } : { bottom: innerHeight - y + 8 }), transformOrigin: below ? "top center" : "bottom center" }}>
      {photo && (
        <div className="relative h-40 overflow-hidden bg-muted">
          <motion.div initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={{ duration: 0.6, ease: "easeOut" }} className="size-full">
            <Thumb path={photo.path} className="size-full object-cover" />
          </motion.div>
          {i.doc.photos.length > 1 && <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">+{i.doc.photos.length - 1} фото</span>}
        </div>
      )}
      {mood && <div className="h-1" style={{ background: mood.color }} />}
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{fmtDate(date)}</span>
          {mood && <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium" style={{ color: mood.color }}><mood.icon className="size-3.5" />{mood.label}</span>}
        </div>
        {marks.length > 0 && <div className="flex flex-wrap gap-1.5">{marks.map(m => <span key={m.k} className="inline-flex items-center gap-1 text-xs"><m.icon className="size-3" style={{ color: m.color, fill: m.color }} />{m.short}</span>)}</div>}
        {dayText(i.doc) && <p className="line-clamp-4 text-[13px] leading-snug">{dayText(i.doc)}</p>}
        {i.items.length > 0
          ? <div className="text-xs text-muted-foreground"><b className="font-semibold text-good">{i.items.length}</b> {plural(i.items.length, ["дело", "дела", "дел"])}: {i.items.slice(0, 3).map(x => x.text).join(" · ")}{i.items.length > 3 && " …"}</div>
          : !dayText(i.doc) && !mood && <div className="text-xs text-muted-foreground">Пустой день. Нажми, чтобы записать.</div>}
      </div>
    </motion.div>,
    document.body
  );
}

/* ───────────── one day ───────────── */

function DayEditor({ date, info, burst }) {
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

  return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">{isToday ? "Как идёт день?" : "Как прошёл день?"}</p>
          <div className="grid grid-cols-5 gap-2 max-sm:gap-1.5">
            {MOODS.map(m => {
              const on = doc?.mood === m.v;
              return (
                <motion.button key={m.v} type="button" onClick={e => setMood(m.v, e)} whileTap={{ scale: 0.9 }} aria-pressed={on}
                  className={cn("relative flex min-w-0 flex-col items-center gap-1 rounded-xl border px-0.5 py-2.5 text-xs font-medium transition-colors max-sm:text-[10.5px]", on ? "border-transparent text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
                  {on && <motion.span layoutId="mood-pill" className="absolute inset-0 rounded-xl" style={{ background: m.color + "26", boxShadow: `inset 0 0 0 1.5px ${m.color}` }} transition={{ type: "spring", bounce: 0.3, duration: 0.4 }} />}
                  <motion.span className="relative" animate={on ? { scale: [1, 1.35, 1], rotate: m.v === 1 ? [0, -8, 8, 0] : [0, 0] } : { scale: 1 }} transition={{ duration: 0.45 }}>
                    <m.icon className="size-7 max-sm:size-6" style={{ color: m.color }} strokeWidth={on ? 2.4 : 1.8} />
                  </motion.span>
                  <span className="relative max-w-full truncate">{m.label}</span>
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

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><SparklesIcon className="size-3.5" />{isToday ? "Мысли за сегодня" : "Мысли и записи"}</p>
          <Thoughts date={date} doc={doc} />
        </div>
        <Photos date={date} photos={doc?.photos || []} save={save} />

        <ExtraDone date={date} extra={doc?.extra || []} save={save} />
        <DayTasks date={date} />
        <DoneList items={items.filter(it => it.from !== "вручную" && it.from !== "из задач")} note={note} future={future} title="Привычки и прочее" hideEmpty />
      </div>
  );
}

// the fastest way in: one line at the top, Enter writes it into today
function QuickDone({ extra, burst }) {
  const [text, setText] = useState("");
  const [flash, setFlash] = useState(null);
  const submit = e => {
    e.preventDefault(); const v = text.trim(); if (!v) return;
    const date = today(), cur = getDb().days.find(d => d.id === dayId(date))?.extra || [];
    put("days", dayId(date), { date, extra: [...cur, v] });
    setText(""); setFlash(v); setTimeout(() => setFlash(f => f === v ? null : f), 2200);
    burst({ currentTarget: e.currentTarget.querySelector("button") }, ["#10b981", "#84cc16", "#38bdf8"]);
  };
  return (
    <form onSubmit={submit} className="relative">
      <div className="flex items-center gap-2 rounded-2xl border bg-card p-1.5 pl-4 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
        <CheckIcon className="size-5 shrink-0 text-good" />
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Что сделал? Например: поработал над приложением" aria-label="Что сделал сегодня"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60" />
        <button type="submit" disabled={!text.trim()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-30">
          <PlusIcon className="size-4" /><span className="max-sm:hidden">Записать</span>
        </button>
      </div>
      <AnimatePresence>
        {flash && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-1.5 px-2 text-xs text-good">
            Записал в сегодня: «{flash}» · всего вручную: {extra.length}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}

// things done that aren't tasks: typed straight into the day
function ExtraDone({ date, extra, save }) {
  const [text, setText] = useState("");
  const submit = e => {
    e.preventDefault(); const v = text.trim(); if (!v) return;
    setText(""); save({ extra: [...(getDb().days.find(d => d.id === dayId(date))?.extra || []), v] });
  };
  const del = k => save({ extra: extra.filter((_, i) => i !== k) });
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">Что ещё сделал</p>
      {extra.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {extra.map((t, k) => (
              <motion.li key={t + k} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-good/40 bg-good/10 py-1 pr-1 pl-2 text-[13px]">
                <CheckIcon className="size-3.5 shrink-0 text-good" />
                <span className="truncate">{t}</span>
                <button type="button" onClick={() => del(k)} aria-label={"Убрать: " + t} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground">
                  <XIcon className="size-3" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Например: поработал над приложением 3 часа"
          className="h-9 min-w-0 flex-1 rounded-lg border border-dashed bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-solid focus:ring-2 focus:ring-ring/40" />
        <button type="submit" disabled={!text.trim()} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40"><PlusIcon className="size-4" />Добавить</button>
      </form>
    </div>
  );
}

// the day's tasks from projects: done that day, and still open (due that day, or overdue/urgent for today),
// grouped by project, subtasks indented under their parent
function DayTasks({ date }) {
  const db = useDb();
  const now = today();
  const data = useMemo(() => {
    const catOf = new Map(db.cats.map(c => [c.id, c])), boardOf = new Map(db.boards.map(b => [b.id, b])), projOf = new Map(db.projects.map(p => [p.id, p]));
    const byId = new Map(db.tasks.map(t => [t.id, t]));
    const mineDone = t => (t.doneBy || t._owner || db.me) === db.me;
    const mineOpen = t => t.assignee ? t.assignee === db.me : t._owner === db.me;
    const done = db.tasks.filter(t => t.done && t.doneOn === date && mineDone(t));
    const open = db.tasks.filter(t => !t.done && mineOpen(t) && byId.size && (
      date === now ? (t.due && t.due <= now) || t.prio === "urgent" : t.due === date));
    const pick = new Map([...done, ...open].map(t => [t.id, t]));
    // parents of listed subtasks come along as context rows, so nesting stays visible
    for (const t of [...pick.values()]) for (let p = byId.get(t.parent); p && !pick.has(p.id); p = byId.get(p.parent)) pick.set(p.id, { ...p, ctx: true });
    const project = t => projOf.get(boardOf.get(catOf.get(t.cat)?.board)?.project);
    const groups = new Map();
    for (const t of pick.values()) {
      const p = project(t), k = p?.id || "";
      if (!groups.has(k)) groups.set(k, { name: p?.name || "Без проекта", id: k, list: [] });
      groups.get(k).list.push(t);
    }
    // order inside a project: parents before kids, by board order
    const tree = list => {
      const ids = new Set(list.map(t => t.id)), kids = new Map(), roots = [];
      for (const t of [...list].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))) {
        if (t.parent && ids.has(t.parent)) { if (!kids.has(t.parent)) kids.set(t.parent, []); kids.get(t.parent).push(t); } else roots.push(t);
      }
      const out = [], walk = (t, d) => { out.push({ t, d }); (kids.get(t.id) || []).forEach(k => walk(k, d + 1)); };
      roots.forEach(t => walk(t, 0));
      return out;
    };
    return { done: done.length, open: open.length, groups: [...groups.values()].map(g => ({ ...g, rows: tree(g.list) })) };
  }, [db.tasks, db.cats, db.boards, db.projects, db.me, date]);
  const toggle = t => update("tasks", t.id, t.done ? { done: false, doneOn: "", doneBy: "", hidden: false } : { done: true, doneOn: today(), doneBy: db.me });
  const canTick = date === now;

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        Задачи
        {data.done > 0 && <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs font-semibold text-good tabular-nums">✓ {data.done}</span>}
        {data.open > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">○ {data.open}</span>}
      </p>
      {!data.groups.length && <p className="text-sm text-muted-foreground/80">{date > now ? "На этот день задач нет." : "В этот день задач не было."}</p>}
      <div className="flex flex-col gap-2">
        {data.groups.map(g => (
          <section key={g.id} className="overflow-hidden rounded-xl border bg-background">
            <a href={g.id ? "#project=" + g.id : undefined} className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <ListChecksIcon className="size-3.5" />{g.name}
              <span className="ml-auto font-normal tabular-nums">{g.rows.filter(r => r.t.done && !r.t.ctx).length} / {g.rows.filter(r => !r.t.ctx).length}</span>
            </a>
            <ul className="py-1">
              {g.rows.map(({ t, d }) => {
                const late = !t.done && t.due && t.due < now;
                if (t.ctx) return (
                  <li key={t.id} className="flex items-center gap-2 py-1 pr-3 text-[13px] text-muted-foreground" style={{ paddingLeft: 12 + d * 22 }}>
                    <CornerDownRightIcon className="size-3.5 shrink-0 -scale-x-100 rotate-180 opacity-60" /><span className="truncate">{t.text}</span>
                  </li>
                );
                return (
                  <li key={t.id} className="relative flex items-start gap-2 py-1 pr-3" style={{ paddingLeft: 12 + d * 22 }}>
                    {d > 0 && <span aria-hidden className="absolute top-0 bottom-0 w-px bg-border" style={{ left: 12 + (d - 1) * 22 + 8 }} />}
                    <button type="button" disabled={!canTick} onClick={() => toggle(t)} aria-label={(t.done ? "Снять отметку: " : "Отметить: ") + t.text}
                      className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors disabled:cursor-default",
                        t.done ? "border-good bg-good text-white" : "border-muted-foreground/40 enabled:hover:border-good")}>
                      {t.done && <CheckIcon className="size-3" strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1 text-[14px] leading-snug">
                      <span className={cn(t.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{t.text}</span>
                      {(t.due || t.prio) && !t.done && (
                        <span className={cn("ml-2 text-xs", late ? "text-destructive" : "text-muted-foreground")}>
                          {late ? "просрочено" : t.prio === "urgent" ? "срочно" : ""}{t.time ? " · " + t.time : ""}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function DoneList({ items, note, future, title = "Сделано", hideEmpty }) {
  if (hideEmpty && !items.length && !note) return null;
  return (
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {title}
            {items.length > 0 && <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs font-semibold text-good tabular-nums">{items.length}</span>}
          </p>
          {items.length ? (
            <ul className="flex flex-col divide-y rounded-xl border bg-background">
              {items.map((it, k) => (
                <motion.li key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(k * 0.025, 0.4) }}
                  className="flex items-center gap-2 px-3 py-1.5 text-[14px]" title={it.from}>
                  <CheckIcon className={cn("size-3.5 shrink-0", it.from === "повторяющаяся" ? "text-violet-500" : "text-good")} />
                  <span className="min-w-0 flex-1">{it.text}</span>
                  {it.from && <span className="shrink-0 text-xs text-muted-foreground">{it.from}</span>}
                </motion.li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground/80">{future ? "Этот день ещё впереди." : "В этот день отмеченных дел нет."}</p>}
          {note && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{note}</p>}
        </div>
  );
}

// a day opened from anywhere: read it first, edit only on purpose
function DayDialog({ open, setOpen, info, burst }) {
  const [edit, setEdit] = useState(false);
  const date = open?.date;
  useEffect(() => { if (open) setEdit(!!open.edit); }, [open]);
  const i = date ? info(date) : null;
  const go = n => { const d = new Date(date); d.setDate(d.getDate() + n); const k = iso(d); if (k <= today()) setOpen({ date: k, edit: false }); };
  const mood = moodOf(i?.doc?.mood);
  const isToday = date === today();
  return (
    <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}>
      <DialogContent className="max-h-[92vh] max-h-[92dvh] grid-cols-[minmax(0,1fr)] gap-0 overflow-x-hidden overflow-y-auto p-0 sm:max-w-2xl max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]">
        {date && <>
          <motion.div aria-hidden className="sticky top-0 z-10 h-1" animate={{ backgroundColor: mood?.color || "transparent" }} />
          <div className="flex items-center gap-1 border-b px-3 py-2.5 pr-12">
            <button type="button" onClick={() => go(-1)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Предыдущий день"><ChevronLeftIcon className="size-4" /></button>
            <button type="button" onClick={() => go(1)} disabled={isToday} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Следующий день"><ChevronRightIcon className="size-4" /></button>
            <DialogTitle className="ml-1 min-w-0 flex-1 truncate text-base">{fmtDate(date).replace("Сегодня · ", "")}{isToday && <span className="ml-2 text-xs font-medium text-muted-foreground max-[380px]:hidden">сегодня</span>}</DialogTitle>
            {edit
              ? <button type="button" onClick={() => setEdit(false)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"><CheckIcon className="size-4" />Готово</button>
              : <button type="button" onClick={() => setEdit(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"><PencilIcon className="size-3.5" />Изменить</button>}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={date + edit} initial={{ opacity: 0, x: edit ? 12 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="p-4 md:p-5">
              {edit ? <DayEditor date={date} info={i} burst={burst} /> : <DayRead date={date} i={i} onEdit={() => setEdit(true)} />}
            </motion.div>
          </AnimatePresence>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function DayRead({ date, i, onEdit }) {
  const mood = moodOf(i.doc?.mood), marks = MARKS.filter(m => i.doc?.marks?.includes(m.k)), photos = i.doc?.photos || [];
  const [lb, setLb] = useState(null);
  const empty = !mood && !marks.length && !dayText(i.doc) && !photos.length;
  return (
    <div className="flex flex-col gap-4">
      {photos.length > 0 && (
        <div className={cn("grid gap-2", photos.length === 1 ? "grid-cols-1" : "grid-cols-3")}>
          {photos.slice(0, 4).map((p, k) => (
            <motion.button key={p.path} type="button" onClick={() => setLb(k)} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: k * 0.05 }}
              className={cn("group relative overflow-hidden rounded-xl bg-muted", photos.length === 1 ? "aspect-[16/10]" : k === 0 ? "col-span-3 aspect-[16/9]" : "aspect-square")}>
              <Thumb path={p.path} className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
              {k === 3 && photos.length > 4 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-semibold text-white">+{photos.length - 4}</span>}
            </motion.button>
          ))}
        </div>
      )}
      {(mood || marks.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {mood && <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold" style={{ background: mood.color + "22", color: mood.color }}><mood.icon className="size-4" />{mood.label}</span>}
          {marks.map(m => <span key={m.k} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm" style={{ borderColor: m.color }}><m.icon className="size-3.5" style={{ color: m.color, fill: m.color }} />{m.label}</span>)}
        </div>
      )}
      {dayText(i.doc) && <Thoughts date={date} doc={i.doc} readOnly />}
      {empty && (
        <button type="button" onClick={onEdit} className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
          <SparklesIcon className="size-5" />{date === today() ? "Написать о сегодня" : "Этот день пока без записи. Добавить?"}
        </button>
      )}
      <DayTasks date={date} />
      <DoneList items={i.items.filter(it => it.from !== "из задач")} note={i.note} future={date > today()} title="Ещё сделано" hideEmpty />
      <Lightbox photos={photos} index={lb} setIndex={setLb} />
    </div>
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
      <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><SparklesIcon className="size-3.5" />{date === today() ? "Заметки о сегодня" : "Что запомнилось"}</span>
      <textarea ref={ta} value={text} rows={3} onChange={e => change(e.target.value)}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; flush(); }}
        placeholder={date === today() ? "Что происходит, о чём думаешь, что хочется не забыть. Можно дописывать в течение дня" : "Пара строк о дне: что было, что почувствовал, что хочется не забыть"}
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
  // Ctrl+V anywhere while the day is open puts a copied picture into the day's photos
  const addRef = useRef(addFiles); addRef.current = addFiles;
  useEffect(() => {
    const on = e => { const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith("image/")); if (f.length) { e.preventDefault(); addRef.current(f); } };
    window.addEventListener("paste", on);
    return () => window.removeEventListener("paste", on);
  }, []);
  // button for phones: read a picture from the clipboard
  const pasteClip = async () => {
    try {
      const out = [];
      for (const it of await navigator.clipboard.read()) {
        const type = it.types.find(t => t.startsWith("image/"));
        if (type) { const b = await it.getType(type); out.push(new File([b], "clip." + type.split("/")[1], { type })); }
      }
      out.length ? addFiles(out) : toast("В буфере нет картинки");
    } catch { toast("Не получилось прочитать буфер. На компьютере просто нажми Ctrl+V"); }
  };
  const del = async p => {
    setOpen(null);
    const cur = getDb().days.find(d => d.id === dayId(date))?.photos || [];
    await save({ photos: cur.filter(x => x.path !== p.path) });
    deletePhoto(p.path);
  };

  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
      <p className="mb-2 flex items-baseline gap-2 text-sm font-medium text-muted-foreground">Фото дня<span className="text-xs font-normal opacity-70 max-md:hidden">перетащи или вставь Ctrl+V</span></p>
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
        {"clipboard" in navigator && "read" in navigator.clipboard && (
          <button type="button" onClick={pasteClip}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent/40 hover:text-foreground">
            <ClipboardPasteIcon className="size-5" />вставить
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
      <Lightbox photos={photos} index={open} setIndex={setOpen} onDelete={del} />
    </div>
  );
}

function Thumb({ path, className, style }) {
  const url = usePhotoUrl(path);
  const [loaded, setLoaded] = useState(false);
  return url
    ? <img src={url} alt="" loading="lazy" style={style} onLoad={() => setLoaded(true)} className={cn(className, "transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")} />
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
      <DialogContent className="grid-cols-[minmax(0,1fr)] max-w-[min(64rem,calc(100%-1rem))] gap-3 border-none bg-black/90 p-3 text-white sm:max-w-[min(64rem,calc(100%-2rem))]"
        onKeyDown={e => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); }}>
        <DialogTitle className="sr-only">Фото дня</DialogTitle>
        <div className="relative grid min-h-60 place-items-center">
          <AnimatePresence mode="wait">
            {url && <motion.img key={p?.path} src={url} alt="" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="max-h-[78vh] max-w-full w-auto rounded-lg object-contain" />}
          </AnimatePresence>
          {photos.length > 1 && <>
            <button type="button" onClick={() => step(-1)} className="absolute left-1 grid size-10 place-items-center rounded-full bg-black/40 hover:bg-black/60" aria-label="Предыдущее"><ChevronLeftIcon /></button>
            <button type="button" onClick={() => step(1)} className="absolute right-1 grid size-10 place-items-center rounded-full bg-black/40 hover:bg-black/60" aria-label="Следующее"><ChevronRightIcon /></button>
          </>}
        </div>
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>{index + 1} / {photos.length}</span>
          {onDelete && <button type="button" onClick={() => armed ? onDelete(p) : setArmed(true)}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white/10", armed && "text-red-400")}>
            <Trash2Icon className="size-4" />{armed ? "точно удалить?" : "удалить"}
          </button>}
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
    const cnt = d => info(d).items.length;
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
    <section className="grid grid-cols-2 gap-3">
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
      <div className="col-span-2 flex items-center justify-around gap-2 rounded-2xl border bg-card p-3 shadow-xs">
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

/* ───────────── overview ───────────── */

const hasEntry = i => !!(i.doc?.mood || dayText(i.doc) || i.doc?.photos?.length || i.doc?.marks?.length);

// written out plainly (not Tailwind's filter variables) so the blur also works in the phone app's WebView
const SOFT = { filter: "blur(12px) brightness(0.55) saturate(1.2)", WebkitFilter: "blur(12px) brightness(0.55) saturate(1.2)" };
const GLASS = { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" };

function Cover({ photo, mood, sharp, className, children }) {
  return (
    <div className={cn("relative overflow-hidden", className)} style={!photo ? { background: mood ? `linear-gradient(135deg, ${mood.color}55, ${mood.color}11)` : undefined } : undefined}>
      {photo && <Thumb path={photo.path} className={cn("absolute inset-0 size-full object-cover transition-transform duration-700",
        sharp ? "group-hover:scale-105" : "scale-110 group-hover:scale-[1.16]")} style={sharp ? undefined : SOFT} />}
      {photo && <div className={cn("absolute inset-0 bg-gradient-to-t", sharp ? "from-black/70 via-transparent to-black/45" : "from-black/75 via-black/35 to-black/20")} />}
      {children}
    </div>
  );
}

// "on this day", but smart: same date a week/month/quarter/year ago, then the brightest recent days
function useMemories(info, mine) {
  return useMemo(() => {
    const out = [], seen = new Set();
    const back = (k, unit) => { const d = new Date(); unit === "d" ? d.setDate(d.getDate() - k) : d.setMonth(d.getMonth() - k); return iso(d); };
    for (const [d, label] of [[back(7, "d"), "Неделю назад"], [back(1, "m"), "Месяц назад"], [back(3, "m"), "3 месяца назад"], [back(6, "m"), "Полгода назад"], [back(12, "m"), "Год назад"]]) {
      const i = info(d); if (hasEntry(i)) { out.push({ d, label, i }); seen.add(d); }
    }
    const score = x => (x.photos?.length ? 3 : 0) + (x.marks?.includes("heart") ? 3 : 0) + (x.marks?.includes("star") ? 2 : 0) + (x.mood === 5 ? 2 : x.mood === 4 ? 1 : 0) + (dayText(x) ? 1 : 0);
    const from = addDays(-90), now = today();
    const best = [...mine.values()].filter(x => x.date >= from && x.date < now && !seen.has(x.date) && score(x) >= 3).sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date)).slice(0, 8);
    for (const x of best) out.push({ d: x.date, label: x.marks?.includes("heart") ? "Важный день" : x.marks?.includes("star") ? "Достижение" : x.photos?.length ? "Яркий момент" : "Хороший день", i: info(x.date) });
    return out;
  }, [mine]);
}

const SEEN = "seenMemories";
const loadSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN) || "[]")); } catch { return new Set(); } };

// header button: glows while there are memories not opened yet
function MemoriesButton({ cards, onPick }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(loadSeen);
  const fresh = cards.filter(c => !seen.has(c.d + c.label)).length;
  const show = () => {
    setOpen(true);
    const n = new Set([...seen, ...cards.map(c => c.d + c.label)]);
    setSeen(n); try { localStorage.setItem(SEEN, JSON.stringify([...n].slice(-200))); } catch {}
  };
  return (
    <>
      <motion.button type="button" onClick={show} whileTap={{ scale: 0.95 }}
        className={cn("relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border px-3.5 text-sm font-medium transition-colors",
          fresh ? "border-amber-400/60 bg-amber-400/10 text-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
        {fresh > 0 && <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 30% 50%, #fbbf2455, transparent 70%)" }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.08, 1] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />}
        <motion.span className="relative" animate={fresh ? { rotate: [0, -12, 12, 0], scale: [1, 1.2, 1] } : {}} transition={{ duration: 1.2, repeat: fresh ? Infinity : 0, repeatDelay: 1.5 }}>
          <SparklesIcon className={cn("size-4", fresh ? "text-amber-500" : "")} />
        </motion.span>
        <span className="relative">Воспоминания</span>
        {fresh > 0 && <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white tabular-nums">{fresh}</span>}
      </motion.button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-4xl max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-2xl">
          <DialogTitle className="flex items-center gap-2"><SparklesIcon className="size-5 text-amber-500" />Воспоминания</DialogTitle>
          {!cards.length && <p className="text-sm text-muted-foreground">Пока пусто. Сюда попадают тот же день неделю, месяц, полгода и год назад, если в нём есть запись, и самые яркие дни за 3 месяца: с сердцем, звездой, фото или отличным настроением.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ d, label, i }, k) => {
              const mood = moodOf(i.doc?.mood), photo = i.doc?.photos?.[0], text = dayText(i.doc);
              return (
                <motion.button key={d} type="button" onClick={() => { setOpen(false); onPick(d); }} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.05 + k * 0.05 }}
                  whileHover={{ y: -4 }} className="group overflow-hidden rounded-2xl border bg-card text-left shadow-sm">
                  <Cover photo={photo} mood={mood} className="h-44">
                    <div className={cn("relative flex h-full flex-col gap-1 p-3.5", photo && "text-white")}>
                      <span style={GLASS} className={cn("self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold", photo ? "bg-white/20" : "bg-background/70")}>{label}</span>
                      <div className="mt-auto flex items-center gap-1.5">
                        <span className="text-sm font-semibold">{fmtDate(d)}</span>
                        {mood && <mood.icon className="ml-auto size-4 shrink-0" style={{ color: photo ? "#fff" : mood.color }} />}
                      </div>
                      {text && <p className={cn("line-clamp-2 text-[13px] leading-snug", photo ? "text-white/85" : "text-muted-foreground")}>{text}</p>}
                    </div>
                  </Cover>
                </motion.button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── today & thoughts ───────────── */

// today's tasks front and centre: done and still open, with the day's mood next to it
function TodayPanel({ i, onOpen }) {
  const mood = moodOf(i.doc?.mood), photo = i.doc?.photos?.[0];
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Сегодня</div>
          <div className="truncate text-lg font-bold tracking-tight">{fmtDate(today()).replace("Сегодня · ", "")}</div>
        </div>
        {photo && <button type="button" onClick={() => onOpen(false)} className="size-10 shrink-0 overflow-hidden rounded-lg border"><Thumb path={photo.path} className="size-full object-cover" /></button>}
        <button type="button" onClick={() => onOpen(!mood)} title={mood ? "Открыть день" : "Отметить настроение"}
          className="grid size-10 shrink-0 place-items-center rounded-xl border transition-transform hover:scale-105" style={mood ? { background: mood.color, borderColor: mood.color } : undefined}>
          {mood ? <mood.icon className="size-6 text-white" /> : <SmileIcon className="size-5 text-muted-foreground" />}
        </button>
        <button type="button" onClick={() => onOpen(false)} className="h-10 shrink-0 rounded-xl border px-3 text-sm font-medium hover:bg-accent">Открыть<span className="max-sm:hidden"> день</span></button>
      </div>
      <div className="p-4"><DayTasks date={today()} /></div>
    </motion.section>
  );
}

// diary: short entries through the day, each with its time; the old single note shows first
function Thoughts({ date, doc, readOnly }) {
  const [text, setText] = useState("");
  const ta = useRef(null);
  const list = [...(doc?.memo ? [{ id: "memo", text: doc.memo }] : []), ...(doc?.thoughts || [])];
  const cur = () => getDb().days.find(d => d.id === dayId(date));
  const add = () => {
    const v = text.trim(); if (!v) return;
    put("days", dayId(date), { date, thoughts: [...(cur()?.thoughts || []), { id: Math.random().toString(36).slice(2, 9), at: new Date().toISOString(), text: v }] });
    setText(""); setTimeout(() => ta.current?.focus());
  };
  const del = id => put("days", dayId(date), id === "memo" ? { date, memo: "" } : { date, thoughts: (cur()?.thoughts || []).filter(x => x.id !== id) });
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 180) + "px"; } }, [text]);
  const time = x => x.at ? new Date(x.at).toTimeString().slice(0, 5) : "";

  return (
    <div className="flex flex-col gap-3">
      {list.length > 0 ? (
        <ol className="relative flex flex-col">
          <AnimatePresence initial={false}>
            {list.map((x, k) => (
              <motion.li key={x.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                className="group relative grid grid-cols-[2.6rem_1fr_auto] gap-x-2 pb-3 last:pb-0">
                <span className="pt-0.5 text-right text-xs text-muted-foreground tabular-nums">{time(x)}</span>
                <div className="relative border-l pl-3.5">
                  <span aria-hidden className="absolute top-[7px] -left-[4.5px] size-2 rounded-full bg-[var(--ink)] ring-4 ring-card" />
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{x.text}</p>
                </div>
                {!readOnly ? (
                  <button type="button" onClick={() => del(x.id)} aria-label="Удалить запись"
                    className="grid size-6 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100 max-md:opacity-50">
                    <XIcon className="size-3.5" />
                  </button>
                ) : <span />}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      ) : readOnly ? null : <p className="text-sm text-muted-foreground/80">Пиши сюда в течение дня: мысли, события, что почувствовал. Каждая запись встанет в ленту со временем.</p>}
      {!readOnly && (
        <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 pl-3 focus-within:ring-2 focus-within:ring-ring/40">
          <textarea ref={ta} value={text} rows={1} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }}
            placeholder="Мысль, событие, что угодно…" aria-label="Новая запись в дневник"
            className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60" />
          <button type="button" onClick={add} disabled={!text.trim()} className="h-9 shrink-0 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-30">Записать</button>
        </div>
      )}
    </div>
  );
}

function ThoughtsCard({ i }) {
  const n = (i.doc?.thoughts?.length || 0) + (i.doc?.memo ? 1 : 0);
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-xs">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><SparklesIcon className="size-4 text-[var(--ink)]" />Мысли за сегодня{n > 0 && <span className="text-sm font-normal text-muted-foreground">{n}</span>}</h2>
      <Thoughts date={today()} doc={i.doc} />
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
