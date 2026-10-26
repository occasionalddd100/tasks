import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, FlameIcon, SparklesIcon, XIcon } from "lucide-react";
import { useDb, getDb, put } from "@/lib/db";
import { today, plural } from "@/lib/tasks";
import { addDone, removeDone, exText, exAt } from "@/lib/done";
import { openTask } from "@/components/tasks/TaskSheet";
import { cn } from "@/lib/utils";
import { MOODS, MARKS, MonthGrid, Thumb, moodOf } from "@/components/journal/JournalView";

// desktop diary: one feed of days you scroll with the wheel (thoughts and what got done, in time order),
// a single line to write into the day in view, a mood slider, and a small calendar on the right
const iso = d => d.toLocaleDateString("sv-SE");
const dayId = date => getDb().me + ":" + date;
const back = (date, n) => { const d = new Date(date + "T12:00"); d.setDate(d.getDate() - n); return iso(d); };
const hm = at => (at ? new Date(at).toTimeString().slice(0, 5) : "");
const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const dayTitle = date => {
  const d = new Date(date + "T12:00"), t = today();
  const rel = date === t ? "Сегодня" : date === back(t, 1) ? "Вчера" : null;
  return { main: rel || d.getDate() + " " + MON[d.getMonth()], sub: rel ? d.getDate() + " " + MON[d.getMonth()] + ", " + WD[d.getDay()] : WD[d.getDay()] };
};

// one day's entries in time order: diary thoughts, things written down as done, ticked tasks, habits
function useEntries(info) {
  const db = useDb();
  const taskMeta = useMemo(() => {
    const catOf = new Map(db.cats.map(c => [c.id, c])), boardOf = new Map(db.boards.map(b => [b.id, b])), projOf = new Map(db.projects.map(p => [p.id, p]));
    const m = new Map();
    for (const t of db.tasks) if (t.done && t.doneOn && (t.doneBy || t._owner || db.me) === db.me) {
      const p = projOf.get(boardOf.get(catOf.get(t.cat)?.board)?.project);
      m.set(t.doneOn + "\n" + t.text, { id: t.id, at: t.doneAt || null, where: p?.personal ? "Личное" : p?.name || "" });
    }
    return m;
  }, [db.tasks, db.cats, db.boards, db.projects, db.me]);
  return date => {
    const { doc, items, note } = info(date), out = [];
    if (doc?.memo) out.push({ key: "memo", kind: "thought", text: doc.memo, at: null, del: () => put("days", dayId(date), { date, memo: "" }) });
    for (const x of doc?.thoughts || []) out.push({ key: "t" + x.id, kind: "thought", text: x.text, at: x.at,
      del: () => put("days", dayId(date), { date, thoughts: (getDb().days.find(d => d.id === dayId(date))?.thoughts || []).filter(y => y.id !== x.id) }) });
    (doc?.extra || []).forEach((x, k) => out.push({ key: "e" + k, kind: "done", text: exText(x), at: exAt(x), del: () => removeDone(date, k) }));
    for (const it of items) {
      if (it.from === "вручную") continue; // already above, from doc.extra
      if (it.from === "из задач") { const t = taskMeta.get(date + "\n" + it.text); out.push({ key: "k" + (t?.id || it.text), kind: "task", text: it.text, at: t?.at, where: t?.where, open: t && (() => openTask(t.id)) }); }
      else out.push({ key: "h" + it.text + out.length, kind: it.from === "повторяющаяся" ? "habit" : "done", text: it.text, at: null });
    }
    // timed entries in order; the ones without a time keep their place after them
    const timed = out.filter(e => e.at).sort((a, b) => a.at.localeCompare(b.at));
    return { list: [...timed, ...out.filter(e => !e.at)], note, doc };
  };
}

export default function DiaryDesk({ info, onPick, burst }) {
  const now = today();
  const [count, setCount] = useState(21); // days loaded into the feed, grows as you scroll down
  const [active, setActive] = useState(now); // the day at the top of the view: the line and the slider write into it
  const secs = useRef(new Map()), feed = useRef(null), more = useRef(null), jump = useRef(false);
  const entries = useEntries(info);

  const days = useMemo(() => Array.from({ length: count }, (_, k) => back(now, k)), [count, now]);
  // runs of empty days fold into one quiet line
  const blocks = useMemo(() => {
    const out = [];
    for (const d of days) {
      const e = entries(d), empty = d !== now && !e.list.length && !e.doc?.mood && !e.doc?.photos?.length && !e.note;
      const last = out.at(-1);
      if (empty && last?.empty) last.days.push(d); else out.push(empty ? { empty: true, days: [d] } : { date: d, ...e });
    }
    return out;
  }, [days, entries]);

  useEffect(() => {
    const el = more.current; if (!el) return;
    const io = new IntersectionObserver(([x]) => x.isIntersecting && setCount(c => Math.min(c + 21, 730)), { rootMargin: "600px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  // which day is under the sticky writing line
  useEffect(() => {
    const on = () => {
      if (jump.current) return;
      const top = (feed.current?.getBoundingClientRect().top ?? 0) + 8;
      let cur = now;
      for (const [d, el] of secs.current) { if (!el) continue; const r = el.getBoundingClientRect(); if (r.top <= top + 90 && r.bottom > top + 90) { cur = d; break; } }
      setActive(a => (a === cur ? a : cur));
    };
    document.addEventListener("scroll", on, true);
    return () => document.removeEventListener("scroll", on, true);
  }, [now]);

  const goTo = date => {
    if (date > now) return;
    const need = Math.round((new Date(now + "T12:00") - new Date(date + "T12:00")) / 864e5) + 8;
    if (need > count) setCount(need);
    setActive(date); jump.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = secs.current.get(date) || [...secs.current.entries()].find(([d]) => d < date)?.[1];
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { jump.current = false; }, 700);
    }));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_17rem] items-start gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div ref={feed} className="min-w-0">
        <Composer date={active} doc={info(active).doc} onToday={() => goTo(now)} burst={burst} />
        <div className="flex flex-col">
          {blocks.map(b => b.empty
            ? <EmptyRun key={b.days[0]} days={b.days} onPick={onPick} />
            : <DaySection key={b.date} b={b} on={b.date === active} refFn={el => secs.current.set(b.date, el)} onPick={onPick} />)}
          <div ref={more} className="h-[60vh]" />
        </div>
      </div>
      <aside className="sticky top-6 flex flex-col gap-4">
        <MiniCalendar info={info} sel={active} onPick={goTo} />
        <Streak info={info} />
      </aside>
    </div>
  );
}

// the one line: write a thought or something done into the day in view, and set its mood
function Composer({ date, doc, onToday, burst }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("thought");
  const ta = useRef(null);
  const isToday = date === today(), t = dayTitle(date);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; } }, [text]);
  const add = () => {
    const v = text.trim(); if (!v) return;
    if (kind === "done") addDone(v, date);
    else {
      const cur = getDb().days.find(d => d.id === dayId(date))?.thoughts || [];
      put("days", dayId(date), { date, thoughts: [...cur, { id: Math.random().toString(36).slice(2, 9), at: isToday ? new Date().toISOString() : null, text: v }] });
    }
    setText("");
  };
  return (
    <div className="sticky top-0 z-10 -mx-2 mb-2 bg-background/85 px-2 pt-1 pb-3" style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
      <div className="rounded-2xl border bg-card shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
        <div className="flex items-end gap-1.5 p-1.5 pl-2">
          <div className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5" role="tablist" aria-label="Что записать">
            {[["thought", SparklesIcon, "Мысль"], ["done", CheckIcon, "Сделал"]].map(([k, Icon, l]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} title={l} onClick={() => { setKind(k); ta.current?.focus(); }}
                className={cn("relative grid size-8 place-items-center rounded-md transition-colors", kind === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {kind === k && <motion.span layoutId="desk-kind" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", bounce: 0.2, duration: 0.3 }} />}
                <Icon className={cn("relative size-4", kind === k && (k === "done" ? "text-good" : "text-[var(--ink)]"))} />
              </button>
            ))}
          </div>
          <textarea ref={ta} value={text} rows={1} onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); add(); }
              if (e.key === "Tab" && !text.includes("\t")) { e.preventDefault(); setKind(k => (k === "done" ? "thought" : "done")); }
            }}
            placeholder={kind === "done" ? "Что сделал?" : isToday ? "Что происходит, о чём думаешь?" : "Что было в этот день?"}
            aria-label={kind === "done" ? "Что сделал" : "Запись в дневник"}
            className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60" />
          <button type="button" onClick={add} disabled={!text.trim()} className="h-9 shrink-0 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-30">Записать</button>
        </div>
        <div className="flex items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
          <span className="shrink-0">в <b className="font-semibold text-foreground">{t.main.toLowerCase()}</b></span>
          {!isToday && <button type="button" onClick={onToday} className="shrink-0 rounded px-1 hover:text-foreground">к сегодня ↑</button>}
          <span className="max-xl:hidden">· Tab меняет мысль/дело</span>
          <MoodSlider date={date} mood={doc?.mood} burst={burst} />
        </div>
      </div>
    </div>
  );
}

// 1..5 on a short track; the thumb takes the mood's colour, × clears it
function MoodSlider({ date, mood, burst }) {
  const m = moodOf(mood);
  const [v, setV] = useState(mood || 3);
  useEffect(() => { setV(mood || 3); }, [mood, date]);
  const save = (n, e) => {
    if (n === mood) return;
    put("days", dayId(date), { date, mood: n });
    if (n === 5) burst(e, ["#10b981", "#84cc16", "#facc15", "#38bdf8"]);
    if (n === 1) burst(e, ["#be123c", "#7f1d1d", "#4c0519"], { sad: true });
  };
  const cur = moodOf(v), Icon = (m || cur).icon;
  return (
    <div className="ml-auto flex items-center gap-2">
      <Icon className="size-4 shrink-0 transition-colors" style={{ color: m ? m.color : undefined }} />
      <span className={cn("w-16 shrink-0 text-right", m && "font-medium")} style={m ? { color: m.color } : undefined}>{m ? m.label : "настроение"}</span>
      <input type="range" min={1} max={5} step={1} value={v} aria-label="Настроение дня" aria-valuetext={cur?.label}
        onChange={e => setV(+e.target.value)}
        onPointerUp={e => save(+e.currentTarget.value, e)} onKeyUp={e => save(+e.currentTarget.value, e)}
        className={cn("mood-range w-28", !m && "unset")} style={{ "--mood": (m || cur).color }} />
      <button type="button" onClick={() => put("days", dayId(date), { date, mood: 0 })} aria-label="Убрать настроение"
        className={cn("grid size-5 place-items-center rounded hover:bg-accent hover:text-foreground", !m && "invisible")}><XIcon className="size-3" /></button>
    </div>
  );
}

const DOT = { thought: "bg-[var(--ink)]", done: "bg-good", task: "bg-good", habit: "bg-violet-500" };

function DaySection({ b, on, refFn, onPick }) {
  const { date, list, doc, note } = b, t = dayTitle(date), mood = moodOf(doc?.mood);
  const marks = MARKS.filter(m => doc?.marks?.includes(m.k)), photos = doc?.photos || [];
  const done = list.filter(e => e.kind !== "thought").length;
  return (
    <section ref={refFn} data-date={date} className="scroll-mt-32 pt-5 pb-3">
      <header className="mb-2 flex items-baseline gap-2.5">
        <button type="button" onClick={() => onPick(date)} className="group flex items-baseline gap-2 text-left" title="Открыть день целиком">
          <h2 className={cn("text-lg font-semibold tracking-tight transition-colors", !on && "text-foreground/80")}>{t.main}</h2>
          <span className="text-sm text-muted-foreground group-hover:text-foreground">{t.sub}</span>
        </button>
        {mood && <span className="inline-flex items-center gap-1 self-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: mood.color + "22", color: mood.color }}><mood.icon className="size-3.5" />{mood.label}</span>}
        {marks.map(m => <m.icon key={m.k} className="size-3.5 self-center" style={{ color: m.color, fill: m.color }} aria-label={m.short} />)}
        {done > 0 && <span className="ml-auto self-center text-xs text-muted-foreground tabular-nums"><b className="font-semibold text-good">✓ {done}</b> {plural(done, ["дело", "дела", "дел"])}</span>}
      </header>
      {photos.length > 0 && (
        <button type="button" onClick={() => onPick(date)} className="mb-2 ml-[3.65rem] flex gap-1.5">
          {photos.slice(0, 5).map(p => <Thumb key={p.path} path={p.path} className="size-14 rounded-lg object-cover" />)}
          {photos.length > 5 && <span className="grid size-14 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">+{photos.length - 5}</span>}
        </button>
      )}
      {list.length > 0 ? (
        <ol className="flex flex-col">
          <AnimatePresence initial={false}>
            {list.map(e => (
              <motion.li key={e.key} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                className="group grid grid-cols-[2.9rem_1fr_auto] gap-x-2">
                <span className="pt-[3px] text-right text-xs text-muted-foreground tabular-nums">{hm(e.at)}</span>
                <div className="relative border-l pb-2 pl-4">
                  {e.kind === "thought"
                    ? <span aria-hidden className={cn("absolute top-[9px] -left-[4.5px] size-2 rounded-full ring-4 ring-background", DOT[e.kind])} />
                    : <span aria-hidden className={cn("absolute top-[5px] -left-[7.5px] grid size-3.5 place-items-center rounded-full text-white ring-4 ring-background", DOT[e.kind])}><CheckIcon className="size-2.5" strokeWidth={3.5} /></span>}
                  {e.kind === "thought"
                    ? <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{e.text}</p>
                    : <p className="text-[14px] leading-relaxed text-foreground/85">
                        {e.open ? <button type="button" onClick={e.open} className="text-left hover:underline">{e.text}</button> : e.text}
                        {e.where && <span className="ml-2 text-xs text-muted-foreground">{e.where}</span>}
                        {e.kind === "habit" && <span className="ml-2 text-xs text-muted-foreground">привычка</span>}
                      </p>}
                </div>
                {e.del ? (
                  <button type="button" onClick={e.del} aria-label="Удалить запись"
                    className="grid size-6 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100">
                    <XIcon className="size-3.5" />
                  </button>
                ) : <span />}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      ) : <p className="ml-[3.65rem] pl-4 text-sm text-muted-foreground/70">{date === today() ? "Пока пусто. Напиши строчку сверху." : "Без записей."}</p>}
      {note && <p className="mt-1 ml-[3.65rem] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{note}</p>}
    </section>
  );
}

function EmptyRun({ days, onPick }) {
  const n = days.length;
  return (
    <button type="button" onClick={() => onPick(days[0])} className="my-1 ml-[3.65rem] flex items-center gap-2 py-1 text-left text-xs text-muted-foreground/70 hover:text-foreground">
      <span className="h-px w-6 bg-border" />
      {n === 1 ? dayTitle(days[0]).main + " · без записей" : n + " " + plural(n, ["день", "дня", "дней"]) + " без записей"}
    </button>
  );
}

function MiniCalendar({ info, sel, onPick }) {
  const [shift, setShift] = useState(0);
  const now = new Date(), d = new Date(now.getFullYear(), now.getMonth() + shift, 1);
  // follow the scrolled day into its month
  useEffect(() => {
    const s = new Date(sel + "T12:00");
    setShift((s.getFullYear() - now.getFullYear()) * 12 + s.getMonth() - now.getMonth());
  }, [sel]);
  return (
    <section className="rounded-2xl border bg-card/80 p-3 shadow-xs">
      <div className="mb-1 flex items-center gap-1">
        <span className="flex-1 pl-1 text-sm font-semibold capitalize">{MONTHS_NOM[d.getMonth()]}{d.getFullYear() !== now.getFullYear() && " " + d.getFullYear()}</span>
        <button type="button" onClick={() => setShift(s => s - 1)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Прошлый месяц"><ChevronLeftIcon className="size-4" /></button>
        <button type="button" onClick={() => setShift(s => Math.min(0, s + 1))} disabled={shift >= 0} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Следующий месяц"><ChevronRightIcon className="size-4" /></button>
      </div>
      <MonthGrid y={d.getFullYear()} m={d.getMonth()} big bare info={info} sel={sel} onPick={onPick} hover={() => {}} leave={() => {}} />
      <div className="mt-2.5 flex flex-wrap justify-center gap-x-2.5 gap-y-1 text-[10.5px] text-muted-foreground">
        {MOODS.map(m => <span key={m.v} className="flex items-center gap-1"><i className="size-2 rounded-[3px]" style={{ background: m.color }} />{m.label}</span>)}
      </div>
    </section>
  );
}

function Streak({ info }) {
  const active = date => { const i = info(date); return i.items.length > 0 || !!i.doc?.mood || !!i.doc?.memo || !!i.doc?.thoughts?.length; };
  let n = 0, d = today();
  if (!active(d)) d = back(d, 1);
  while (active(d) && n < 999) { n++; d = back(d, 1); }
  const todayN = info(today()).items.length;
  return (
    <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
      <span>сегодня <b className="text-foreground">{todayN}</b> {plural(todayN, ["дело", "дела", "дел"])}</span>
      {n >= 2 && <span className="flex items-center gap-1"><FlameIcon className="size-3.5 text-orange-500" /><b className="text-foreground">{n}</b> {plural(n, ["день", "дня", "дней"])} подряд</span>}
    </div>
  );
}
