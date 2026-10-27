import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "motion/react";
import { ArchiveIcon, CheckIcon, ChevronRightIcon, LayersIcon, PlayIcon, PauseIcon, SunIcon, SunriseIcon, CrosshairIcon, XIcon, TimerIcon, SparklesIcon, RotateCcwIcon } from "lucide-react";
import { useDb, getDb, update, add } from "@/lib/db";
import { focusList, inFocus, inBucket, toBucket, nextFocus, placeOf } from "@/lib/focus";
import { today, addDays, byOrder, stale, nextOrder, plural } from "@/lib/tasks";
import { tagsOf } from "@/lib/tags";
import { draftsOf } from "@/lib/personal";
import { cn } from "@/lib/utils";
import { useZenTimer } from "@/lib/zenTimer";
import { WORK_GROUPS, groupOf, levelOf } from "@/components/tasks/FocusView";

// Фокус: a 3D space with one task in front and the rest of the queue going back into the depth.
// Two modes: «Делать» — the work queue one card at a time (✓ / later / to the pail, a 25-min timer);
// «Разбор» — open tasks not in work, one by one: today / tomorrow / into work / pail / skip.
// Big type, dark calm room, nothing else on screen: the point is to see one thing.
const GOAL = 3;
const done = t => update("tasks", t.id, { done: true, doneOn: today(), doneAt: new Date().toISOString(), doneBy: getDb().me });

export default function ZenView({ onClose }) {
  const db = useDb();
  const now = today(), tomorrow = addDays(1);
  const order = Object.fromEntries(WORK_GROUPS.map((g, k) => [g.k, k]));
  const work = useMemo(() => focusList(db).filter(t => !t.done && !t.parent)
    .sort((a, b) => order[groupOf(a, now, tomorrow)] - order[groupOf(b, now, tomorrow)] || a.focus - b.focus), [db.tasks, now]);

  // triage: what isn't decided yet, most pressing first
  const triage = useMemo(() => {
    const mine = new Set([draftsOf(db)?.id, ...tagsOf(db).map(t => t.id)]);
    const rank = t => (t.due && t.due < now ? 0 : t.due === now ? 1 : t.prio === "urgent" ? 2 : t.due && t.due <= addDays(3) ? 3 : t.due ? 4 : 5);
    return db.tasks.filter(t => mine.has(t.cat) && !t.done && !t.hidden && !t.parent && !inFocus(t) && !inBucket(t) && t.text?.trim() && (!t.assignee || t.assignee === db.me))
      .sort((a, b) => rank(a) - rank(b) || (a.due || "9").localeCompare(b.due || "9") || byOrder(a, b));
  }, [db.tasks, db.cats, now]);

  const doneToday = db.tasks.filter(t => t.done && t.doneOn === now && (t.doneBy || t._owner) === db.me && !t.parent).length;
  const [mode, setMode] = useState(() => (work.length ? "do" : "sort"));
  const [skipped, setSkipped] = useState([]); // «потом» in this visit only: next time the deck starts fresh
  const [fly, setFly] = useState(null); // how the front card leaves: up (done), right (later), down (pail)
  const queue = useMemo(() => {
    const src = (mode === "do" ? work : triage).filter(t => !skipped.includes(t.id));
    return [...src, ...skipped.map(id => (mode === "do" ? work : triage).find(t => t.id === id)).filter(Boolean)];
  }, [mode, work, triage, skipped]);
  const cur = queue[0];
  useEffect(() => setSkipped([]), [mode]);

  const leave = (dir, act) => { setFly(dir); act?.(); clearTimeout(flyT.current); flyT.current = setTimeout(() => setFly(null), 700); };
  const flyT = useRef(0);
  const later = () => cur && leave("right", () => setSkipped(s => [...s.filter(x => x !== cur.id), cur.id]));
  const actions = mode === "do" ? {
    done: () => cur && leave("up", () => done(cur)),
    later,
    pail: () => cur && leave("down", () => toBucket(cur)),
  } : {
    today: () => cur && leave("up", () => update("tasks", cur.id, { focus: nextFocus(), focusBy: db.me, due: now })),
    tomorrow: () => cur && leave("up", () => update("tasks", cur.id, { focus: nextFocus(), focusBy: db.me, due: tomorrow })),
    work: () => cur && leave("up", () => update("tasks", cur.id, { focus: nextFocus(), focusBy: db.me })),
    pail: () => cur && leave("down", () => toBucket(cur)),
    done: () => cur && leave("up", () => done(cur)),
    later,
  };

  const timer = useZenTimer();
  useEffect(() => {
    const on = e => {
      if (e.target.closest?.("input,textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "escape") return onClose();
      if (k === "tab") { e.preventDefault(); return setMode(m => (m === "do" ? "sort" : "do")); }
      if (mode === "do") {
        if (k === " " || k === "enter") { e.preventDefault(); actions.done(); }
        else if (k === "arrowright" || k === "l" || k === "д") actions.later();
        else if (k === "arrowdown" || k === "b" || k === "и") actions.pail();
        else if (k === "t" || k === "е") timer.toggle();
      } else {
        if (k === "1") actions.today(); else if (k === "2") actions.tomorrow(); else if (k === "3") actions.work();
        else if (k === "4" || k === "arrowdown") actions.pail(); else if (k === "arrowright" || k === " ") { e.preventDefault(); actions.later(); }
        else if (k === "enter") actions.done();
      }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });
  useEffect(() => { try { localStorage.setItem("zenSeen", today()); } catch {} }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="zen fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#07080c] text-white select-none">
      <Room />
      {/* top: mode switch, today's progress, close */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pt-6">
        <div className="flex rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
          {[["do", "Делать", CrosshairIcon, work.length], ["sort", "Разбор", LayersIcon, triage.length]].map(([k, l, Icon, n]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={cn("relative flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors", mode === k ? "text-black" : "text-white/60 hover:text-white")}>
              {mode === k && <motion.span layoutId="zen-mode" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", bounce: 0.2, duration: 0.35 }} />}
              <Icon className="relative size-4" /><span className="relative">{l}</span><span className="relative opacity-50 tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <Goal n={doneToday} />
        <button type="button" onClick={onClose} aria-label="Выйти из фокуса (Esc)" className="ml-auto grid size-10 place-items-center rounded-full text-white/50 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"><XIcon className="size-5" /></button>
      </div>

      {/* the deck in depth */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4" style={{ perspective: "1400px" }}>
        {cur ? (
          <div className="relative h-[min(56vh,460px)] w-[min(92vw,640px)]" style={{ transformStyle: "preserve-3d" }}>
            <AnimatePresence custom={fly}>
              {queue.slice(0, 5).map((t, k) => (
                <Card key={t.id} t={t} depth={k} mode={mode} timer={k === 0 ? timer : null} onSwipe={k === 0 ? (mode === "do" ? { up: actions.done, right: actions.later, down: actions.pail } : { up: actions.work, right: actions.later, down: actions.pail }) : null} fly={fly} />
              ))}
            </AnimatePresence>
          </div>
        ) : <Empty mode={mode} setMode={setMode} work={work.length} triage={triage.length} doneToday={doneToday} onClose={onClose} />}
      </div>

      {/* actions */}
      {cur && (
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-8">
          {mode === "do" ? <>
            <Act onClick={actions.pail} icon={ArchiveIcon} hint="↓">В ведёрко</Act>
            <Act onClick={actions.later} icon={ChevronRightIcon} hint="→">Потом</Act>
            <Act onClick={timer.toggle} icon={timer.running ? PauseIcon : TimerIcon} hint="T" on={timer.running}>{timer.active ? timer.label : "25 мин"}</Act>
            <Act onClick={actions.done} icon={CheckIcon} hint="Space" main>Сделал</Act>
          </> : <>
            <Act onClick={actions.today} icon={SunIcon} hint="1" main>Сегодня</Act>
            <Act onClick={actions.tomorrow} icon={SunriseIcon} hint="2">Завтра</Act>
            <Act onClick={actions.work} icon={CrosshairIcon} hint="3">В работу</Act>
            <Act onClick={actions.pail} icon={ArchiveIcon} hint="4">В ведёрко</Act>
            <Act onClick={actions.later} icon={ChevronRightIcon} hint="→">Пропустить</Act>
            <Act onClick={actions.done} icon={CheckIcon} hint="Enter">Уже сделано</Act>
          </>}
        </div>
      )}
      <p className="relative z-10 pb-3 text-center text-[11px] text-white/25 max-md:hidden">Tab: делать / разбор · Esc: выйти · карточку можно смахнуть</p>
    </motion.div>
  );
}

// a dark room with a floor grid running into the distance, so the deck stands somewhere
function Room() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 38%, rgba(99,102,241,0.16), transparent 70%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(16,185,129,0.08), transparent 70%)" }} />
      <div className="absolute inset-x-0 bottom-0 h-[50%] overflow-hidden" style={{ perspective: "420px", perspectiveOrigin: "50% 0%" }}>
        <div className="zen-floor absolute inset-x-[-60%] top-0 h-full" style={{ transform: "rotateX(58deg)", transformOrigin: "50% 0%",
          backgroundImage: "linear-gradient(rgba(140,150,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(140,150,255,0.10) 1px, transparent 1px)", backgroundSize: "56px 56px",
          maskImage: "linear-gradient(to bottom, transparent, black 30%, black 60%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 60%, transparent)" }} />
      </div>
    </div>
  );
}

function Card({ t, depth, mode, timer, onSwipe, fly }) {
  const db = useDb();
  const lv = levelOf(t), kids = db.tasks.filter(k => k.parent === t.id && !stale(k)).sort(byOrder);
  const x = useMotionValue(0), y = useMotionValue(0);
  const rotY = useTransform(x, [-300, 300], [-18, 18]), rotX = useTransform(y, [-300, 300], [14, -14]);
  const front = depth === 0;
  // the stack: each card further back, a little higher and dimmer
  const pose = { z: -depth * 120, y: -depth * 64, scale: 1, opacity: depth > 3 ? 0 : 1 - depth * 0.22, rotateX: depth ? 4 : 0, filter: `blur(${depth * 0.8}px)` };
  const out = { up: { y: -500, z: 300, opacity: 0, rotateX: 25 }, right: { x: 700, rotateY: 30, opacity: 0, z: -200 }, down: { y: 600, scale: 0.6, opacity: 0, rotateX: -30 } };
  const end = (_, info) => {
    const { offset: o, velocity: v } = info;
    if (o.y < -120 || v.y < -800) onSwipe.up();
    else if (o.x > 140 || v.x > 800) onSwipe.right();
    else if (o.y > 140 || v.y > 800) onSwipe.down();
    else { animate(x, 0, { type: "spring", bounce: 0.4 }); animate(y, 0, { type: "spring", bounce: 0.4 }); }
  };
  const [adding, setAdding] = useState(false);
  return (
    <motion.article custom={fly}
      initial={{ z: -800, y: -120, opacity: 0 }} animate={pose} exit={dir => ({ ...(out[dir] || out.up), transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } })}
      transition={{ type: "spring", stiffness: 170, damping: 22 }}
      drag={front} dragElastic={0.6} dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} onDragEnd={front ? end : undefined}
      style={{ ...(front ? { x, y, rotateY: rotY, rotateX: rotX } : {}), zIndex: 10 - depth, transformStyle: "preserve-3d" }}
      className={cn("absolute inset-0 flex flex-col overflow-hidden rounded-[28px] border p-6 md:p-9", front ? "cursor-grab border-white/15 active:cursor-grabbing" : "pointer-events-none border-white/5")}>
      <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(160deg, #1b1d27 0%, #12131a 60%, #0e0f15 100%)", boxShadow: front ? "0 40px 120px -20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08)" : "none" }} />
      {lv && <div className="absolute inset-x-0 top-0 h-1" style={{ background: lv.c, boxShadow: `0 0 24px ${lv.c}` }} />}
      <div className="flex items-center gap-2 text-sm text-white/45">
        {lv && <span className="inline-flex items-center gap-1 font-semibold" style={{ color: lv.c }}>{lv.icon && <lv.icon className="size-3.5" />}{lv.l}</span>}
        <span className="truncate">{placeOf(db, t).replace(/^Личное · ?/, "")}</span>
        {mode === "sort" && t.due && !lv && <span>· до {t.due.slice(8)}.{t.due.slice(5, 7)}</span>}
      </div>
      <h2 className="mt-4 line-clamp-4 text-[clamp(1.6rem,4.4vw,2.6rem)] leading-[1.15] font-semibold tracking-tight text-white/95">{t.text}</h2>
      {front && (kids.length > 0 || mode === "do") && (
        <ul className="mt-5 flex min-h-0 flex-col gap-1 overflow-y-auto" onPointerDownCapture={e => e.stopPropagation()}>
          {kids.map(k => (
            <li key={k.id}>
              <button type="button" onClick={() => update("tasks", k.id, k.done ? { done: false, doneOn: "", doneAt: "" } : { done: true, doneOn: today(), doneAt: new Date().toISOString() })}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-[17px] hover:bg-white/5">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors", k.done ? "border-emerald-400 bg-emerald-400 text-black" : "border-white/30")}>{k.done && <CheckIcon className="size-3.5" strokeWidth={3} />}</span>
                <span className={cn(k.done && "text-white/35 line-through")}>{k.text}</span>
              </button>
            </li>
          ))}
          {mode === "do" && (adding
            ? <li><form onSubmit={e => { e.preventDefault(); const v = e.currentTarget.elements.s.value.trim(); if (v) add("tasks", { text: v, cat: t.cat, parent: t.id, order: nextOrder(kids), done: false }); e.currentTarget.reset(); }}>
                <input name="s" autoFocus placeholder="Первый маленький шаг…" onBlur={e => !e.target.value.trim() && setAdding(false)} onKeyDown={e => e.key === "Escape" && setAdding(false)}
                  className="h-10 w-full rounded-xl bg-white/5 px-3 text-[16px] text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-white/20" />
              </form></li>
            : <li><button type="button" onClick={() => setAdding(true)} className="px-2 py-1 text-sm text-white/35 hover:text-white/70">+ разбить на шаги</button></li>)}
        </ul>
      )}
      {front && timer && timer.active && (
        <div className="mt-auto pt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-emerald-400" animate={{ width: (1 - timer.left / timer.total) * 100 + "%" }} transition={{ duration: 0.5 }} /></div>
          <div className="mt-1.5 flex justify-between text-xs text-white/40 tabular-nums"><span>{timer.running ? "фокус" : "пауза"}</span><span>{timer.label}</span></div>
        </div>
      )}
    </motion.article>
  );
}

function Act({ onClick, icon: Icon, hint, main, on, children }) {
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.94 }}
      className={cn("flex h-12 items-center gap-2 rounded-2xl px-4 text-[15px] font-medium ring-1 transition-colors",
        main ? "bg-white text-black ring-white hover:bg-white/90" : on ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40" : "bg-white/[0.04] text-white/80 ring-white/10 hover:bg-white/10 hover:text-white")}>
      <Icon className="size-[18px]" />{children}
      {hint && <kbd className={cn("ml-0.5 rounded-md px-1.5 py-px font-sans text-[10px] max-md:hidden", main ? "bg-black/10 text-black/50" : "bg-white/10 text-white/40")}>{hint}</kbd>}
    </motion.button>
  );
}

// three dots for today's goal; past three it just counts
function Goal({ n }) {
  return (
    <div className="flex items-center gap-2 text-sm text-white/50" title={`Сделано сегодня: ${n}`}>
      <div className="flex gap-1">
        {Array.from({ length: GOAL }, (_, k) => (
          <motion.span key={k} animate={{ scale: k < n ? [1, 1.4, 1] : 1, backgroundColor: k < n ? "#34d399" : "rgba(255,255,255,0.12)" }} transition={{ duration: 0.4 }} className="size-2.5 rounded-full" />
        ))}
      </div>
      <span className="tabular-nums max-sm:hidden">{n >= GOAL ? `${n} сегодня 🔥` : `${n} из ${GOAL}`}</span>
    </div>
  );
}

function Empty({ mode, setMode, work, triage, doneToday, onClose }) {
  const text = mode === "do"
    ? work === 0 && triage > 0 ? { h: "В работе пусто", p: `Разбери задачи: ${triage} ждут решения. Выбери 1–3 на сегодня.`, b: "Начать разбор", go: () => setMode("sort") }
      : { h: doneToday >= GOAL ? "Всё на сегодня сделано" : "Очередь пуста", p: doneToday ? `Сегодня ${doneToday} ${plural(doneToday, ["дело", "дела", "дел"])}. Можно выдохнуть.` : "Добавь задачу в работу, и она появится тут.", b: "Выйти", go: onClose }
    : { h: "Разобрано", p: work ? `В работе ${work}. Пора делать.` : "Нерешённых задач нет.", b: work ? "Делать" : "Выйти", go: work ? () => setMode("do") : onClose };
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex max-w-md flex-col items-center gap-3 text-center">
      <SparklesIcon className="size-8 text-white/40" />
      <h2 className="text-3xl font-semibold tracking-tight">{text.h}</h2>
      <p className="text-white/50">{text.p}</p>
      <button type="button" onClick={text.go} className="mt-3 h-12 rounded-2xl bg-white px-6 font-medium text-black">{text.b}</button>
    </motion.div>
  );
}
