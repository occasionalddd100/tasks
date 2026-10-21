import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, FlameIcon, InboxIcon, LayersIcon, PlusIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { useDb } from "@/lib/db";
import { today, addDays, dueLabel, dayDiff } from "@/lib/tasks";
import { inFocus, toFocus } from "@/lib/focus";
import { draftsOf } from "@/lib/personal";
import { timeOf } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import TaskSheet from "@/components/tasks/TaskSheet";
import TaskNoteDialog from "@/components/tasks/TaskNoteDialog";

// "Что взять в фокус": every open task of mine that is not in the focus yet, as a 3D carousel of cards,
// the important ones first. Filters narrow it; "Все" with search lets you dig up any small thing too.

const KINDS = {
  late: { label: "просрочено", cls: "from-rose-500 to-red-600", icon: FlameIcon },
  urgent: { label: "срочно", cls: "from-orange-500 to-red-500", icon: FlameIcon },
  today: { label: "сегодня", cls: "from-amber-400 to-orange-500", icon: CalendarIcon },
  soon: { label: "скоро", cls: "from-sky-500 to-indigo-500", icon: CalendarIcon },
  draft: { label: "черновик", cls: "from-violet-500 to-fuchsia-500", icon: InboxIcon },
  rest: { label: "когда-нибудь", cls: "from-slate-400 to-slate-600", icon: LayersIcon },
};
const FILTERS = [
  { k: "hot", label: "Важное", icon: FlameIcon, test: c => c.score >= 40 },
  { k: "draft", label: "Черновики", icon: InboxIcon, test: c => c.kind === "draft" },
  { k: "all", label: "Все", icon: LayersIcon, test: () => true },
];

function useCandidates() {
  const db = useDb();
  return useMemo(() => {
    const td = today(), week = addDays(7), drafts = draftsOf(db)?.id;
    const catOf = new Map(db.cats.map(c => [c.id, c])), boardOf = new Map(db.boards.map(b => [b.id, b])), projOf = new Map(db.projects.map(p => [p.id, p]));
    const byId = new Map(db.tasks.map(t => [t.id, t]));
    const mine = t => (t.assignee ? t.assignee === db.me : t._owner === db.me);
    const out = [];
    for (const t of db.tasks) {
      if (t.done || t.hidden || inFocus(t) || !t.text?.trim() || !mine(t)) continue;
      const late = t.due && t.due < td;
      const kind = late ? "late" : t.prio === "urgent" ? "urgent" : t.due === td ? "today" : t.due && t.due <= week ? "soon" : t.cat === drafts ? "draft" : "rest";
      const score = { late: 100, urgent: 85, today: 70, soon: 50 - dayDiff(td, t.due), draft: 20, rest: 10 }[kind];
      const cat = catOf.get(t.cat), board = boardOf.get(cat?.board), proj = projOf.get(board?.project);
      out.push({ t, kind, score, parent: byId.get(t.parent)?.text || "",
        where: [proj?.personal ? "Личное" : proj?.name, cat?.drafts ? "" : cat?.name].filter(Boolean).join(" · ") });
    }
    return out.sort((a, b) => b.score - a.score || (a.t.due || "9").localeCompare(b.t.due || "9") || (a.t.order ?? 0) - (b.t.order ?? 0));
  }, [db.tasks, db.cats, db.boards, db.projects, db.me]);
}

export default function FocusPicker() {
  const all = useCandidates();
  const [filter, setFilter] = useState(() => { try { return localStorage.getItem("pick.filter") || "hot"; } catch { return "hot"; } });
  const [q, setQ] = useState("");
  const pickFilter = k => { setFilter(k); setQ(""); try { localStorage.setItem("pick.filter", k); } catch {} };
  const f = FILTERS.find(x => x.k === filter) || FILTERS[0];
  const list = all.filter(f.test).filter(c => !q || (c.t.text + " " + c.where).toLowerCase().includes(q.toLowerCase()));
  const counts = Object.fromEntries(FILTERS.map(x => [x.k, all.filter(x.test).length]));

  return (
    <section className="flex flex-col gap-3 md:max-w-3xl">
      <header className="flex items-center gap-2 px-1">
        <SparklesIcon className="size-4 text-primary" />
        <h2 className="text-base font-semibold">Что взять в фокус</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{list.length}</span>
      </header>
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(({ k, label, icon: Icon }) => (
          <button key={k} type="button" onClick={() => pickFilter(k)}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
              filter === k ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent")}>
            <Icon className="size-4" />{label}<span className="tabular-nums opacity-60">{counts[k]}</span>
          </button>
        ))}
        {filter === "all" && (
          <label className="relative flex h-9 min-w-40 flex-1 items-center">
            <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Найти задачу" className="h-9 w-full rounded-full border bg-background pr-8 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring/40" />
            {q && <button type="button" onClick={() => setQ("")} className="absolute right-2 grid size-6 place-items-center text-muted-foreground" aria-label="Очистить"><XIcon className="size-4" /></button>}
          </label>
        )}
      </div>
      {list.length
        ? <Carousel key={filter + q} list={list} />
        : <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{q ? "Ничего не нашлось." : filter === "hot" ? "Ничего не горит. Можно взять что-то из «Все»." : "Пусто."}</p>}
    </section>
  );
}

// cards on a horizontal snap scroll; each one turns and shrinks by its distance from the centre, so the row reads as a 3D wheel
function Carousel({ list }) {
  const box = useRef(null), raf = useRef(0);
  const [taken, setTaken] = useState(null);
  // a tap on a card opens the whole task (the card cuts long text)
  const [opened, setOpened] = useState(null), [note, setNote] = useState(false);
  const db = useDb(), shown = opened && db.tasks.find(t => t.id === opened);
  const paint = () => {
    const el = box.current; if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    for (const c of el.children) {
      if (!c.dataset.card) continue;
      const d = (c.offsetLeft + c.offsetWidth / 2 - mid) / c.offsetWidth; // -1 left neighbour, 0 centre, 1 right
      const a = Math.max(-1.6, Math.min(1.6, d));
      c.firstChild.style.transform = `perspective(900px) translateZ(${-Math.abs(a) * 90}px) rotateY(${-a * 28}deg) scale(${1 - Math.min(Math.abs(a), 1) * 0.08})`;
      c.firstChild.style.opacity = String(1 - Math.min(Math.abs(a), 1.6) * 0.35);
      c.style.zIndex = String(10 - Math.round(Math.abs(a) * 3));
    }
  };
  const onScroll = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(paint); };
  useLayoutEffect(paint, [list.length]);
  useEffect(() => { const ro = new ResizeObserver(paint); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, []);
  const step = dir => { const el = box.current; el?.scrollBy({ left: dir * (el.children[1]?.offsetWidth || 260), behavior: "smooth" }); };
  const take = c => { setTaken(c.t.id); setTimeout(() => { toFocus(c.t); setTaken(null); }, 280); };

  return (
    <div className="relative">
      <div ref={box} onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[14%] py-4 [scrollbar-width:none] md:mx-0 md:px-[30%] [&::-webkit-scrollbar]:hidden">
        <AnimatePresence initial={false}>
          {list.map((c, i) => (
            <motion.div key={c.t.id} data-card="1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="relative w-[72%] shrink-0 snap-center md:w-[40%]">
              <div style={{ transition: "opacity .15s" }}><Card c={c} n={i + 1} total={list.length} taken={taken === c.t.id} onTake={() => take(c)} onOpen={() => setOpened(c.t.id)} /></div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {shown && <TaskSheet t={shown} open={!!shown} onOpenChange={o => !o && setOpened(null)} onNote={() => setNote(true)} />}
      {shown && note && <TaskNoteDialog t={shown} open={note} onOpenChange={o => { setNote(o); if (!o) setOpened(null); }} />}
      {list.length > 1 && <>
        <button type="button" onClick={() => step(-1)} aria-label="Назад" className="absolute top-1/2 left-0 z-20 hidden size-9 -translate-y-1/2 place-items-center rounded-full border bg-background/90 shadow md:grid"><ChevronLeftIcon className="size-4" /></button>
        <button type="button" onClick={() => step(1)} aria-label="Дальше" className="absolute top-1/2 right-0 z-20 hidden size-9 -translate-y-1/2 place-items-center rounded-full border bg-background/90 shadow md:grid"><ChevronRightIcon className="size-4" /></button>
      </>}
    </div>
  );
}

function Card({ c, n, total, taken, onTake, onOpen }) {
  const k = KINDS[c.kind], Icon = k.icon, t = c.t;
  const when = t.due ? dueLabel(t.due) + (timeOf(t) ? " " + timeOf(t) : "") : timeOf(t);
  return (
    <motion.div animate={taken ? { y: -30, scale: 1.04, rotateX: 12 } : { y: 0, scale: 1, rotateX: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      style={{ transformStyle: "preserve-3d", willChange: "transform" }}
      onClick={e => !e.target.closest("button") && onOpen()} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && e.target === e.currentTarget && onOpen()}
      className="flex h-56 cursor-pointer flex-col overflow-hidden rounded-3xl border bg-card shadow-lg">
      <div className={cn("relative flex items-center gap-1.5 bg-gradient-to-br px-4 py-3 text-xs font-semibold tracking-wide text-white uppercase", k.cls)}>
        <Icon className="size-3.5" />{k.label}
        {when && <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 normal-case tabular-nums">{when}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-4 pt-3">
        {c.parent && <div className="truncate text-xs text-muted-foreground">↳ {c.parent}</div>}
        <div className="line-clamp-3 text-[17px] leading-snug font-semibold break-words">{t.text}</div>
        <div className="mt-auto truncate pb-2 text-xs text-muted-foreground">{c.where}</div>
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-2.5">
        <span className="text-xs text-muted-foreground tabular-nums">{n} / {total}</span>
        <button type="button" onClick={onTake}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow transition-transform active:scale-95">
          <PlusIcon className="size-4" />В фокус
        </button>
      </div>
    </motion.div>
  );
}
