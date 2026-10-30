import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArchiveIcon, BookOpenIcon, CheckIcon, CrosshairIcon, FlameIcon, ImageIcon, LayoutGridIcon, ListTodoIcon, PlayIcon, Share2Icon, SparklesIcon, StickyNoteIcon, SunIcon, SunriseIcon, TimerIcon, AlarmClockIcon, CalendarClockIcon, SmileIcon } from "lucide-react";
import { useDb } from "@/lib/db";
import { cn } from "@/lib/utils";

// A short tour of the app: a few slides, each a small picture and two lines. Shown once to a new account
// (one with almost nothing in it yet), skippable at any point; «Настройки → Вид» opens it again.
const KEY = "tourSeen";
let open = false; const subs = new Set();
const emit = () => subs.forEach(f => f());
export const openTour = () => { open = true; emit(); };
const close = () => { open = false; try { localStorage.setItem(KEY, "1"); } catch {} emit(); };

export function TourHost() {
  const db = useDb();
  const isOpen = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => open);
  // first visit of a fresh account: show it once
  useEffect(() => {
    if (!db.ready || db.error) return;
    let seen = true; try { seen = localStorage.getItem(KEY) === "1"; } catch {}
    if (seen) return;
    const mine = ["tasks", "notes", "clips", "stashes"].reduce((n, c) => n + (db[c] || []).filter(x => x._owner === db.me).length, 0);
    if (mine < 6) setTimeout(openTour, 900); else try { localStorage.setItem(KEY, "1"); } catch {}
  }, [db.ready]);
  return <AnimatePresence>{isOpen && <Tour key="tour" />}</AnimatePresence>;
}

const phone = () => matchMedia("(max-width: 767px)").matches;

function Tour() {
  const [at, setAt] = useState(0), [dir, setDir] = useState(1);
  const ph = phone();
  const slides = SLIDES(ph);
  const last = at === slides.length - 1;
  const go = d => { const k = at + d; if (k < 0) return; if (k >= slides.length) return close(); setDir(d); setAt(k); };
  useEffect(() => {
    const on = e => { if (e.key === "ArrowRight" || e.key === "Enter") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") close(); };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });
  const s = slides[at];
  return (
    <motion.div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 md:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} onClick={close}>
      <motion.div onClick={e => e.stopPropagation()} role="dialog" aria-label="Знакомство с приложением"
        initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl md:rounded-3xl max-md:pb-[var(--sab)]">
        <button type="button" onClick={close} className="absolute top-3 right-3 z-10 rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/40">Пропустить</button>
        {/* the picture: swipe on the phone */}
        <div className="relative h-64 overflow-hidden md:h-72" style={{ background: s.bg }}>
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div key={at} custom={dir} className="absolute inset-0 grid place-items-center"
              initial={{ x: dir * 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -dir * 80, opacity: 0 }} transition={{ type: "spring", bounce: 0.1, duration: 0.4 }}
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.4} style={{ touchAction: "pan-y" }}
              onDragEnd={(e, i) => { if (i.offset.x < -50) go(1); else if (i.offset.x > 50) go(-1); }}>
              {s.art}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-5 pb-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={at} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="flex min-h-28 flex-col gap-2">
              <h2 className="text-xl font-bold tracking-tight">{s.title}</h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex flex-1 gap-1.5">
              {slides.map((_, k) => <button key={k} type="button" aria-label={"Слайд " + (k + 1)} onClick={() => { setDir(k > at ? 1 : -1); setAt(k); }}
                className={cn("h-1.5 rounded-full transition-all duration-300", k === at ? "w-6 bg-foreground" : "w-1.5 bg-foreground/20")} />)}
            </div>
            {at > 0 && <button type="button" onClick={() => go(-1)} className="h-10 rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-foreground">Назад</button>}
            <button type="button" onClick={() => go(1)} className="h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-transform active:scale-95">{last ? "Начать" : "Дальше"}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ───── the pictures: small mock-ups drawn with icons, floating in a little ───── */
const float = (k, amp = 6) => ({ animate: { y: [0, -amp, 0] }, transition: { duration: 3 + k * 0.4, repeat: Infinity, ease: "easeInOut", delay: k * 0.2 } });
const pop = k => ({ initial: { opacity: 0, scale: 0.6, y: 10 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { type: "spring", bounce: 0.35, delay: 0.08 + k * 0.07 } });
const Glass = ({ className, children, ...p }) => <motion.div {...p} className={cn("rounded-2xl bg-white/85 text-black shadow-xl ring-1 ring-black/5 dark:bg-white/90", className)}>{children}</motion.div>;

function Welcome() {
  const items = [[ListTodoIcon, "Задачи", "#f59e0b"], [LayoutGridIcon, "Стэши", "#ec4899"], [BookOpenIcon, "Дневник", "#8b5cf6"]];
  return (
    <div className="flex items-end gap-3">
      {items.map(([I, l, c], k) => (
        <motion.div key={l} {...pop(k)}><motion.div {...float(k, 8)}>
          <Glass className={cn("flex w-24 flex-col items-center gap-2 py-4", k === 1 && "mb-6")}>
            <span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: c }}><I className="size-6" /></span>
            <span className="text-sm font-semibold">{l}</span>
          </Glass>
        </motion.div></motion.div>
      ))}
    </div>
  );
}

function TasksArt() {
  const groups = [[AlarmClockIcon, "Просрочено", "#ef4444", ["Сдать конспект"]], [SunIcon, "Сегодня", "#f59e0b", ["Позвонить в сервис", "Купить продукты"]], [CalendarClockIcon, "Запланированные", "#8b5cf6", ["Записаться к врачу"]]];
  return (
    <Glass {...pop(0)} className="w-72 p-2.5">
      {groups.map(([I, l, c, list], g) => (
        <motion.div key={l} {...pop(g + 1)} className="mb-1.5 last:mb-0">
          <div className="flex items-center gap-1.5 px-1 text-xs font-bold"><span className="grid size-5 place-items-center rounded-md" style={{ background: c + "22" }}><I className="size-3" style={{ color: c }} /></span>{l}</div>
          {list.map(t => <div key={t} className="flex items-center gap-2 px-1.5 py-1 text-[13px]"><span className="size-3.5 rounded border border-black/30" />{t}</div>)}
        </motion.div>
      ))}
    </Glass>
  );
}

function WheelArt() {
  const acts = [[CheckIcon, "#22c55e"], [SunIcon, "#f59e0b"], [SunriseIcon, "#0ea5e9"], [FlameIcon, "#ef4444"], [ArchiveIcon, "#64748b"]];
  return (
    <div className="relative size-52">
      <motion.div {...pop(0)} className="absolute inset-0 rounded-full border-2 border-white/40" />
      {acts.map(([I, c], k) => {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / acts.length;
        return (
          <motion.div key={k} initial={{ x: 0, y: 0, opacity: 0 }} animate={{ x: Math.cos(a) * 82, y: Math.sin(a) * 82, opacity: 1 }} transition={{ type: "spring", bounce: 0.3, delay: 0.1 + k * 0.06 }}
            className="absolute top-1/2 left-1/2 -mt-6 -ml-6 grid size-12 place-items-center rounded-full bg-white shadow-lg"><I className="size-5" style={{ color: c }} /></motion.div>
        );
      })}
      <motion.div {...pop(2)} className="absolute top-1/2 left-1/2 -mt-5 -ml-5 grid size-10 place-items-center rounded-full bg-white/30 ring-4 ring-white/40">
        <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.6, repeat: Infinity }} className="size-4 rounded-full bg-white" />
      </motion.div>
    </div>
  );
}

function StashArt() {
  const cards = [["YouTube", "#ef4444", true], ["TikTok", "#111827", true], ["X", "#0f172a", false], ["Instagram", "#d946ef", false]];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {cards.map(([n, c, play], k) => (
        <motion.div key={n} {...pop(k)}><motion.div {...float(k, 5)}>
          <Glass className="w-32 overflow-hidden p-0">
            <div className="relative grid h-12 place-items-center" style={{ background: `linear-gradient(135deg, ${c}, ${c}aa)` }}>
              {play ? <PlayIcon className="size-6 fill-white text-white" /> : <ImageIcon className="size-6 text-white/90" />}
            </div>
            <div className="px-2 py-1.5 text-[11px] font-semibold">{n}<div className="mt-1 h-1.5 w-16 rounded-full bg-black/10" /></div>
          </Glass>
        </motion.div></motion.div>
      ))}
    </div>
  );
}

function BoardsArt() {
  const tags = [["вдохновение", 300], ["посмотреть", 200], ["рецепты", 30], ["музыка", 140]];
  return (
    <div className="flex w-72 flex-col items-center gap-3">
      <motion.div {...pop(0)} className="flex gap-1.5">
        {["Все", "Видео", "Идеи"].map((b, k) => <span key={b} className={cn("rounded-full px-3 py-1 text-xs font-semibold shadow", k === 1 ? "bg-white text-black" : "bg-white/30 text-white")}>{b}</span>)}
      </motion.div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {tags.map(([t, h], k) => <motion.span key={t} {...pop(k + 1)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow" style={{ background: `hsl(${h} 70% 48%)` }}>
          {k < 2 && <CheckIcon className="size-3" strokeWidth={3} />}{t}</motion.span>)}
      </div>
      <motion.div {...pop(5)} className="flex gap-2">
        <Glass className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium"><StickyNoteIcon className="size-4 text-amber-500" />Заметка к карточке</Glass>
        <Glass className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium"><Share2Icon className="size-4 text-sky-500" />Поделиться</Glass>
      </motion.div>
    </div>
  );
}

function FocusArt() {
  return (
    <div className="flex items-center gap-4">
      <motion.div {...pop(0)} className="flex w-40 flex-col items-center gap-2 rounded-2xl bg-[#11121a] p-4 text-white shadow-2xl">
        <CrosshairIcon className="size-5 text-white/50" />
        <div className="text-center text-sm font-semibold">Дописать курсовую</div>
        <div className="flex items-center gap-1 text-xs text-emerald-400"><TimerIcon className="size-3.5" />24:59</div>
      </motion.div>
      <Glass {...pop(1)} className="flex w-32 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-1.5 text-xs font-bold"><SmileIcon className="size-4 text-amber-500" />Сегодня</div>
        {["Зал", "Конспект", "Звонок маме"].map(t => <div key={t} className="flex items-center gap-1.5 text-[11px]"><CheckIcon className="size-3 text-emerald-600" strokeWidth={3} />{t}</div>)}
      </Glass>
    </div>
  );
}

function DoneArt() {
  return (
    <motion.div {...pop(0)} className="relative grid size-28 place-items-center rounded-full bg-white shadow-2xl">
      <SparklesIcon className="size-12 text-violet-500" />
      {[0, 1, 2, 3, 4, 5].map(k => <motion.span key={k} className="absolute size-2.5 rounded-full" style={{ background: ["#f43f5e", "#f59e0b", "#22c55e", "#0ea5e9", "#a855f7", "#ec4899"][k] }}
        initial={{ x: 0, y: 0, opacity: 0 }} animate={{ x: Math.cos(k) * 90, y: Math.sin(k) * 70, opacity: [0, 1, 0.8] }} transition={{ delay: 0.2 + k * 0.05, duration: 0.8 }} />)}
    </motion.div>
  );
}

const SLIDES = ph => [
  { bg: "linear-gradient(135deg,#6366f1,#a855f7 55%,#ec4899)", art: <Welcome />, title: "Привет! Тут всё по полочкам",
    text: "Задачи, стэши с интересным из интернета и дневник в одном месте. Минута, и покажу главное." },
  { bg: "linear-gradient(135deg,#f59e0b,#f97316 60%,#ef4444)", art: <TasksArt />, title: "Задачи сами раскладываются по срокам",
    text: ph ? "Жми ＋ внизу и пиши. #тег сразу ставит тег. Просрочено, сегодня, завтра видно с первого взгляда." : "Жми N или «Новая задача» и пиши. #тег сразу ставит тег. Просрочено, сегодня, завтра видно с первого взгляда." },
  { bg: "linear-gradient(135deg,#0ea5e9,#6366f1)", art: <WheelArt />, title: "Быстрые действия",
    text: ph ? "Зажми задачу: появится круговое меню. Готово, на сегодня, на завтра, приоритет, в ведёрко или другой тег." : "Правый клик по задаче открывает круговое меню: готово, на сегодня, на завтра, приоритет, в ведёрко или другой тег." },
  { bg: "linear-gradient(135deg,#ec4899,#f43f5e 50%,#f97316)", art: <StashArt />, title: "Стэши: копилка всего интересного",
    text: "Вставь ссылку на YouTube, TikTok, X, Instagram или любой сайт, и получится карточка с превью, названием и описанием. Картинки можно просто бросить." },
  { bg: "linear-gradient(135deg,#14b8a6,#0ea5e9)", art: <BoardsArt />, title: "Доски, теги и заметки",
    text: ph ? "Раскладывай карточки по доскам и тегам, добавляй картинки и заметки. Из других приложений можно делиться прямо в стэш." : "Раскладывай карточки по доскам и тегам, добавляй картинки и заметки. Карточки перетаскиваются между досками." },
  { bg: "linear-gradient(135deg,#334155,#6366f1)", art: <FocusArt />, title: "Фокус и дневник",
    text: "«Фокус» показывает одну задачу и таймер на 25 минут. В дневнике настроение, мысли и всё, что сделано за день." },
  { bg: "linear-gradient(135deg,#a855f7,#6366f1 60%,#0ea5e9)", art: <DoneArt />, title: "Готово, пользуйся",
    text: "Это обучение всегда можно открыть снова: Настройки → Вид → «Показать обучение»." },
];
