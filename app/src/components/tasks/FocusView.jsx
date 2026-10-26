import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CrosshairIcon, FlameIcon, HashIcon, InboxIcon, ListTodoIcon, PlusIcon, XIcon, PencilIcon, AlarmClockIcon, ChevronRightIcon, CheckIcon, ArchiveIcon, SunIcon, SunriseIcon, CalendarClockIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as Pop from "@radix-ui/react-popover";
import { useDb, updateMany } from "@/lib/db";
import { focusList, clearDone, inFocus, toFocus, inBucket, toBucket } from "@/lib/focus";
import { exText, exAt } from "@/lib/done";
import Bucket from "@/components/tasks/Bucket";
import { tagsOf, tagOfTask } from "@/lib/tags";
import { draftsOf } from "@/lib/personal";
import { cn } from "@/lib/utils";
import { stale, byOrder, today, dueLabel, dayDiff, plural, addDays } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { VIEW } from "@/components/ViewHeader";
import TaskRow from "@/components/tasks/TaskRow";
import { useFresh, setAmbient } from "@/components/tasks/QuickAdd";
import { TagMark } from "@/components/tasks/TagMark";
import { openTask } from "@/components/tasks/TaskSheet";
import { openWheel, moveWheel, endWheel } from "@/components/tasks/TagWheel";
import { Fan } from "@/components/Fan";
import { useTasksTap } from "@/components/MobileNav";
import { Habits, useJournal } from "@/components/tasks/ProjectViews";
import { openTagEditor } from "@/components/tasks/TagEditor";

// The home screen. On top: add a task (with a tag it lands on that board). Then "В работе": what I'm on now,
// added and removed at will. Below, the rest of «Личное»: one row per tag (its categories), scrolled sideways (or one tag as a list).
const NONE = "\u0000none", WORK = "\u0000work";
let lastTag = null;
const store = { get: () => { try { return localStorage.getItem("tasksTag"); } catch { return null; } }, set: v => { try { v ? localStorage.setItem("tasksTag", v) : localStorage.removeItem("tasksTag"); } catch {} } };

export default function FocusView() {
  const db = useDb();
  const tags = tagsOf(db);
  const [filter, setFilterRaw] = useState(() => lastTag ?? store.get());
  const setFilter = v => { lastTag = v; store.set(v); setFilterRaw(v); };
  const [fan, setFan] = useState(false);
  const chipsRef = useRef(null);
  // a filter picked in the fan: the page starts over at the top, its chip in view
  const jump = () => setTimeout(() => {
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
    const row = chipsRef.current, chip = row?.querySelector("[aria-pressed=true]");
    if (chip) row.scrollTo({ left: chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2, behavior: "smooth" });
  }, 60);
  useTasksTap(() => setFan(f => !f));
  const list = focusList(db);
  const done = list.filter(t => t.done).length;
  const drafts = draftsOf(db);

  // open tasks not in work, top level, not someone else's
  const rest = useMemo(() => {
    const me = db.me, now = today();
    const rank = t => (t.due && t.due < now ? 0 : t.due === now ? 1 : t.prio === "urgent" ? 2 : t.due ? 3 : 4);
    const mine = new Set([drafts?.id, ...tags.map(t => t.id)]);
    return db.tasks.filter(t => mine.has(t.cat) && !t.done && !t.hidden && !t.parent && !inFocus(t) && !inBucket(t) && t.text?.trim() && (!t.assignee || t.assignee === me))
      .sort((a, b) => rank(a) - rank(b) || (a.due || "9").localeCompare(b.due || "9") || byOrder(a, b));
  }, [db.tasks, db.me, drafts?.id, tags.map(t => t.id).join()]);
  const now = today();
  const overdue = useMemo(() => rest.filter(t => t.due && t.due < now), [rest, now]);
  const groups = useMemo(() => {
    const by = new Map([[NONE, []], ...tags.map(t => [t.id, []])]);
    // in «Все» the overdue ones have their own block on top, so they don't repeat in the rows
    for (const t of rest) {
      if (!filter && t.due && t.due < now) continue;
      by.get(t.cat === drafts?.id ? NONE : t.cat)?.push(t);
    }
    return by;
  }, [rest, tags.map(t => t.id).join(), drafts?.id, !filter, now]);
  const shownTag = filter && (filter === NONE || filter === WORK || tags.some(t => t.id === filter)) ? filter : null;
  // a task just added from ＋ must be seen: drop a filter that would hide it
  const freshId = useFresh(), fresh = db.tasks.find(t => t.id === freshId);
  useEffect(() => {
    if (!fresh || !shownTag) return;
    const key = inFocus(fresh) ? WORK : fresh.cat === drafts?.id ? NONE : fresh.cat;
    if (key !== shownTag) setFilter(null);
  }, [fresh?.id]);
  // ＋ adds to what's on screen: the picked tag, or straight into work
  useEffect(() => { setAmbient({ tag: shownTag && shownTag !== NONE && shownTag !== WORK ? shownTag : null, work: shownTag === WORK }); return () => setAmbient(null); }, [shownTag]);
  const tagName = id => id === NONE ? "Без тега" : tags.find(t => t.id === id)?.name;

  const fanItems = [
    { id: "\u0000all", name: "Все", on: !shownTag, glyph: <ListTodoIcon className="size-5" /> },
    { id: WORK, name: "В работе", n: list.length - done, on: shownTag === WORK, glyph: <CrosshairIcon className="size-5" /> },
    groups.get(NONE)?.length && { id: NONE, name: "Без тега", n: groups.get(NONE).length, on: shownTag === NONE, glyph: <InboxIcon className="size-5" /> },
    ...tags.map(t => ({ id: t.id, name: t.name, n: groups.get(t.id)?.length || 0, on: shownTag === t.id,
      glyph: t.emoji ? <span className="text-xl leading-none">{t.emoji}</span> : <span className="text-base font-semibold" style={t.color ? { color: t.color } : undefined}>{(t.name.trim()[0] || "#").toUpperCase()}</span> })),
  ].filter(Boolean).slice(0, 9).concat({ id: "\u0000edit", name: "Править теги", glyph: <PencilIcon className="size-5" /> });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // the pail wins whenever the pointer is over it; otherwise the usual nearest slot in the list
  const collide = args => { const hit = pointerWithin(args).find(c => c.id === "bucket"); return hit ? [hit] : closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => c.id !== "bucket") }); };
  const [dragId, setDragId] = useState(null);
  const dragged = dragId && list.find(t => t.id === dragId);
  const onDragEnd = ({ active, over }) => {
    setDragId(null);
    if (!over || active.id === over.id) return;
    if (over.id === "bucket") { const t = list.find(x => x.id === active.id); if (t) toBucket(t); return; }
    const ids = list.map(t => t.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    updateMany("tasks", next.map((id, i) => [id, i + 1]).filter(([id, f]) => list.find(t => t.id === id)?.focus !== f).map(([id, focus]) => [id, { focus }]));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={e => setDragId(e.active.id)} onDragCancel={() => setDragId(null)} onDragEnd={onDragEnd}>
    <div className={cn(VIEW, "max-w-5xl")}>
      <header className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-bold tracking-tight md:text-3xl">Задачи</h1>
        <TodayDone />
      </header>

      <div ref={chipsRef} className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        <TagChip on={!shownTag} onClick={() => setFilter(null)}>Все</TagChip>
        <TagChip on={shownTag === WORK} n={list.length - done} onClick={() => setFilter(shownTag === WORK ? null : WORK)}><CrosshairIcon className="size-3.5" />В работе</TagChip>
        {groups.get(NONE)?.length > 0 && <TagChip on={shownTag === NONE} onClick={() => setFilter(shownTag === NONE ? null : NONE)} n={groups.get(NONE).length}><InboxIcon className="size-3.5" />Без тега</TagChip>}
        {tags.map(t => <TagChip key={t.id} on={shownTag === t.id} n={groups.get(t.id)?.length} onClick={() => setFilter(shownTag === t.id ? null : t.id)}><TagMark t={t} />{t.name}</TagChip>)}
        <button type="button" onClick={() => openTagEditor()} aria-label="Править теги" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:text-foreground"><PencilIcon className="size-3.5" />Теги</button>
      </div>

      {(!shownTag || shownTag === WORK) && <section className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold"><CrosshairIcon className="size-4 text-primary" />В работе</h2>
          {list.length > 0 && <span className="rounded-full bg-foreground/[.06] px-2 py-px text-xs font-medium text-muted-foreground tabular-nums">{list.length - done}</span>}
          {done > 0 && <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={clearDone}>Убрать сделанные</Button>}
        </div>
        {list.length === 0
          ? <p className="py-3 text-sm text-muted-foreground">Пусто. Смахни задачу влево или нажми ＋ на карточке ниже, и она окажется тут.</p>
          : <WorkList list={list} />}
      </section>}

      {!shownTag && overdue.length > 0 && <Overdue tasks={overdue} />}

      {shownTag !== WORK && <section className="flex flex-col gap-3">
        {shownTag
          ? <TagList tasks={groups.get(shownTag) || []} name={tagName(shownTag)} onClear={() => setFilter(null)} />
          : [...groups].filter(([, l]) => l.length).map(([id, l]) => (
              <TagRow key={id} id={id} name={tagName(id)} tag={tags.find(t => t.id === id)} color={tags.find(t => t.id === id)?.color} tasks={l} onOpen={() => setFilter(id)} />
            ))}
        {!rest.length && <p className="text-sm text-muted-foreground">Других открытых задач нет.</p>}
      </section>}

      {!shownTag && db.habits.length > 0 && <Habits habits={db.habits} />}

      <Fan open={fan} setOpen={setFan} items={fanItems} anchor="navRight"
        onPick={t => { if (t.id === "\u0000edit") { openTagEditor(); return; } setFilter(t.id === "\u0000all" ? null : t.id); jump(); }} />
      <Bucket />
      {/* the task you hold follows the finger as a small card; dropped on the pail it just vanishes into it */}
      <DragOverlay dropAnimation={null}>
        {dragged && <div className="max-w-72 cursor-grabbing rounded-xl border bg-card px-3 py-2 text-sm font-medium shadow-2xl" style={{ rotate: "-2deg" }}>{dragged.text}</div>}
      </DragOverlay>
    </div>
    </DndContext>
  );
}

function TagChip({ on, color, n, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}{children}
      {n > 0 && <span className="opacity-60 tabular-nums">{n}</span>}
    </button>
  );
}

// "В работе": drag to reorder, or onto the pail to put aside; subtasks under their task
function WorkList({ list }) {
  const now = today(), tomorrow = addDays(1);
  const groups = WORK_GROUPS.map(g => ({ ...g, tasks: list.filter(t => groupOf(t, now, tomorrow) === g.k) })).filter(g => g.tasks.length);
  return (
    <SortableContext items={list.map(t => t.id)} strategy={verticalListSortingStrategy}>
      <div className="flex flex-col gap-2">
        {groups.map(g => (
          <Group key={g.k} id={"work:" + g.k} title={g.l} icon={g.icon} color={g.c} n={g.tasks.length}>
            <ul>{g.tasks.map(t => <WorkItem key={t.id} t={t} />)}</ul>
          </Group>
        ))}
      </div>
    </SortableContext>
  );
}

// «В работе» split by when: each task lands in the first group that fits
const WORK_GROUPS = [
  { k: "late", l: "Просрочено", c: "#ef4444", icon: AlarmClockIcon },
  { k: "urgent", l: "Приоритет", c: "#f97316", icon: FlameIcon },
  { k: "today", l: "Сегодня", c: "#f59e0b", icon: SunIcon },
  { k: "tomorrow", l: "Завтра", c: "#0ea5e9", icon: SunriseIcon },
  { k: "planned", l: "Запланированные", c: "#8b5cf6", icon: CalendarClockIcon },
  { k: "free", l: "Без срока", c: "#64748b", icon: InboxIcon },
  { k: "done", l: "Сделано", c: "#22c55e", icon: CheckIcon },
];
function groupOf(t, now, tomorrow) {
  if (t.done) return "done";
  if (t.due && t.due < now) return "late";
  if (t.prio === "urgent") return "urgent";
  if (t.due === now || t.prio === "today") return "today";
  if (t.due === tomorrow) return "tomorrow";
  if (t.due) return "planned";
  return "free";
}

// one foldable block, the same look everywhere: coloured edge and tint, title, count, chevron (remembered per block)
const FOLD = "folded";
const loadFold = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLD) || "[]")); } catch { return new Set(); } };
function Group({ id, title, icon: Icon, color, n, children }) {
  const [open, setOpenRaw] = useState(() => !loadFold().has(id));
  const setOpen = v => { setOpenRaw(v); try { const f = loadFold(); v ? f.delete(id) : f.add(id); localStorage.setItem(FOLD, JSON.stringify([...f])); } catch {} };
  return (
    <section className="overflow-hidden rounded-2xl border" style={{ borderColor: `color-mix(in oklab, var(--border) 55%, ${color})`, background: `color-mix(in oklab, transparent 96%, ${color})` }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Icon className="size-4" style={{ color }} />
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <span className="rounded-full px-2 py-px text-xs font-semibold tabular-nums" style={{ color, background: `color-mix(in oklab, transparent 85%, ${color})` }}>{n}</span>
        <ChevronRightIcon className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden px-1 pb-1">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function WorkItem({ t }) {
  const db = useDb();
  const kids = db.tasks.filter(k => k.parent === t.id && !stale(k)).sort(byOrder);
  const tag = tagOfTask(db, t), cat = db.cats.find(c => c.id === t.cat), board = db.boards.find(b => b.id === cat?.board);
  const name = tag?.name || (cat?.drafts ? "" : db.projects.find(p => p.id === board?.project)?.name);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, ...(tag ? { background: `color-mix(in oklab, transparent 92%, ${tag.color})` } : {}) }}
      className={cn("relative mb-1 rounded-lg", isDragging && "z-10 opacity-30")}>
      {/* a soft tint and a thin bar in the tag's colour, so work from different tags reads apart */}
      {tag && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: tag.color }} />}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <div className="group/w relative">
          <TaskRow t={t} noFocusMark sub={name && (tag?.emoji ? tag.emoji + " " : "#") + name} grip={{ ref: setActivatorNodeRef, ...attributes, ...listeners }} />
          {!t.done && <button type="button" onClick={() => toBucket(t)} title="Отложить в ведёрко" aria-label={"Отложить: " + t.text}
            className="absolute top-1/2 right-11 grid size-7 -translate-y-1/2 place-items-center rounded-md bg-background/80 text-muted-foreground opacity-0 transition-opacity group-hover/w:opacity-100 hover:text-foreground max-md:hidden">
            <ArchiveIcon className="size-4" /></button>}
        </div>
        {kids.length > 0 && <ul className="mb-1 ml-9 border-l pl-2" aria-label={"Подзадачи: " + t.text}>{kids.map(k => <li key={k.id}><TaskRow t={k} noFocusMark /></li>)}</ul>}
      </motion.div>
    </li>
  );
}

// one tag: its tasks as cards in a row you scroll sideways; the rows themselves scroll down
function TagRow({ id, name, tag, color, tasks, onOpen }) {
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onOpen} className="flex h-7 items-center gap-1.5 self-start rounded-full px-2.5 text-sm font-semibold"
        style={color ? { background: `color-mix(in oklab, transparent 75%, ${color})` } : { background: "var(--muted)" }}>
        {id === NONE ? <InboxIcon className="size-4 text-muted-foreground" /> : tag?.emoji ? <TagMark t={tag} size="md" /> : <HashIcon className="size-3.5" style={{ color }} />}
        {name}<span className="font-normal opacity-60 tabular-nums">{tasks.length}</span>
      </button>
      <div data-hscroll className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
        {tasks.slice(0, 30).map(t => <Card key={t.id} t={t} color={color} />)}
        {tasks.length > 30 && <button type="button" onClick={onOpen} className="grid w-28 shrink-0 snap-start place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground">ещё {tasks.length - 30}</button>}
      </div>
    </div>
  );
}

function TagList({ tasks, name, onClear }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{tasks.length ? `${tasks.length} в «${name}»` : `В «${name}» открытых задач нет`}</span>
        <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1 hover:text-foreground"><XIcon className="size-3.5" />Все теги</button>
      </div>
      <ul className="-mx-1">{tasks.map(t => <li key={t.id}><TaskRow t={t} /></li>)}</ul>
    </div>
  );
}

// a card: tap opens the task, hold opens the tag wheel, ＋ puts it in work
function Card({ t, color }) {
  const db = useDb(), fresh = useFresh() === t.id;
  const ref = useRef(null);
  useEffect(() => { if (fresh) setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }), 250); }, [fresh]);
  const kids = db.tasks.filter(k => k.parent === t.id && !stale(k));
  const late = t.due && t.due < today();
  const hold = useHold(t);
  const lv = levelOf(t);
  return (
    <div ref={ref} {...hold.handlers} onClick={() => !hold.held.current && openTask(t.id)} onContextMenu={e => { e.preventDefault(); if (!hold.held.current) openWheel(t, e.clientX, e.clientY, true); }}
      style={color ? { background: `color-mix(in oklab, var(--card) 84%, ${color})`, borderColor: `color-mix(in oklab, var(--border) 50%, ${color})` } : undefined}
      className={cn("relative flex h-32 w-44 shrink-0 snap-start cursor-pointer flex-col rounded-2xl border bg-card p-3 shadow-xs transition-[transform,box-shadow] select-none [-webkit-touch-callout:none] active:scale-[.98] md:w-52",
        fresh && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
      {lv && <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] rounded-b-full" style={{ background: lv.c }} />}
      {lv && <span className="mb-1 inline-flex items-center gap-1 self-start text-[11px] font-semibold" style={{ color: lv.c }}>{lv.icon && <lv.icon className="size-3" />}{lv.l}</span>}
      <p className={cn("text-[14px] leading-snug font-medium", lv ? "line-clamp-3" : "line-clamp-4")}>{t.text}</p>
      <div className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
        {t.due && !(lv && lv.l !== "срочно") && <span className={cn("rounded-md bg-muted px-1.5 py-0.5 whitespace-nowrap", late && "text-destructive")}>{dueLabel(t.due)}{t.time ? " " + t.time : ""}</span>}
        {kids.length > 0 && <span className="tabular-nums">{kids.filter(k => k.done).length}/{kids.length}</span>}
        <button type="button" onClick={e => { e.stopPropagation(); toFocus(t); }} aria-label={"В работу: " + t.text}
          className="ml-auto grid size-8 place-items-center rounded-full bg-foreground/[.06] text-foreground hover:bg-primary hover:text-primary-foreground">
          <PlusIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

// hold a card still for a moment: the tag wheel opens under the finger, the same finger picks
function useHold(t) {
  const timer = useRef(0), start = useRef(null), held = useRef(false);
  const stopScroll = (el, on) => { const s = el?.closest("[data-hscroll]"); if (s) s.style.overflowX = on ? "hidden" : ""; };
  const handlers = {
    onPointerDown: e => {
      if (e.pointerType === "mouse") return;
      held.current = false; start.current = { x: e.clientX, y: e.clientY, el: e.currentTarget };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { held.current = true; stopScroll(start.current.el, true); openWheel(t, start.current.x, start.current.y); }, 450);
    },
    onPointerMove: e => {
      if (held.current) return moveWheel(e.clientX, e.clientY);
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clearTimeout(timer.current);
    },
    onPointerUp: () => { clearTimeout(timer.current); if (held.current) { endWheel(); stopScroll(start.current?.el, false); setTimeout(() => { held.current = false; }, 400); } start.current = null; },
    onPointerCancel: () => { clearTimeout(timer.current); if (held.current) { endWheel(); stopScroll(start.current?.el, false); held.current = false; } start.current = null; },
  };
  return { handlers, held };
}

// how pressing a task is, at a glance: overdue and urgent in red, today in amber, the next few days in blue
const RED = "#ef4444", AMBER = "#f59e0b", BLUE = "#0ea5e9";
export function levelOf(t) {
  const now = today(), k = t.due ? dayDiff(now, t.due) : null;
  if (t.due && t.due < now) return { c: RED, l: "просрочено на " + -k + " " + plural(-k, ["день", "дня", "дней"]), icon: AlarmClockIcon };
  if (t.prio === "urgent") return { c: RED, l: "срочно", icon: FlameIcon };
  if (t.due === now || t.prio === "today") return { c: AMBER, l: "сегодня" + (t.time ? " в " + t.time : "") };
  if (k != null && k <= 3) return { c: BLUE, l: dueLabel(t.due) };
  return null;
}

// overdue tasks outside work: one block on top, in the same look as the groups of «В работе»
function Overdue({ tasks }) {
  return (
    <Group id="overdue" title="Просрочено, не в работе" icon={AlarmClockIcon} color="#ef4444" n={tasks.length}>
      <ul>{tasks.map(t => <li key={t.id}><TaskRow t={t} /></li>)}</ul>
    </Group>
  );
}

// "✓ N сегодня": hover (or tap) shows everything done today, in time order
function TodayDone() {
  const db = useDb();
  const journal = useJournal(db);
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  const now = today();
  const items = useMemo(() => {
    const out = [], hm = at => (at ? new Date(at).toTimeString().slice(0, 5) : "");
    const byText = new Map(db.tasks.filter(t => t.done && t.doneOn === now).map(t => [t.text, t]));
    for (const it of journal.get(now)?.items || []) {
      const t = it.from === "из задач" ? byText.get(it.text) : null;
      out.push({ text: it.text, at: t?.doneAt || "", time: hm(t?.doneAt), id: t?.id, habit: it.from === "повторяющаяся" });
    }
    const day = db.days.find(d => d.id === db.me + ":" + now);
    for (const x of day?.extra || []) out.push({ text: exText(x), at: exAt(x) || "", time: hm(exAt(x)) });
    return out.sort((a, b) => (a.at || "~").localeCompare(b.at || "~"));
  }, [journal, db.days, db.tasks, now]);
  const hover = v => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(v), v ? 80 : 180); };
  return (
    <Pop.Root open={open} onOpenChange={setOpen}>
      <Pop.Trigger asChild>
        <button type="button" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors", items.length ? "border-good/40 bg-good/10 text-good" : "text-muted-foreground")}>
          <CheckIcon className="size-4" strokeWidth={2.6} /><span className="tabular-nums">{items.length}</span><span className="max-sm:hidden">сегодня</span>
        </button>
      </Pop.Trigger>
      <Pop.Portal>
        <Pop.Content align="end" sideOffset={6} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} onOpenAutoFocus={e => e.preventDefault()}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl data-[state=open]:animate-[menu-in_140ms_ease-out]">
          <p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">Сделано сегодня{items.length > 0 && ": " + items.length}</p>
          {items.length === 0
            ? <p className="px-2.5 pb-2 text-sm text-muted-foreground">Пока ничего. Первая галочка будет тут.</p>
            : <ul className="max-h-80 overflow-y-auto">
                {items.map((x, k) => (
                  <li key={k}>
                    <button type="button" disabled={!x.id} onClick={() => { setOpen(false); openTask(x.id); }}
                      className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm enabled:hover:bg-accent">
                      <span className="w-10 shrink-0 pt-px text-xs text-muted-foreground tabular-nums">{x.time}</span>
                      <CheckIcon className={cn("mt-0.5 size-3.5 shrink-0", x.habit ? "text-violet-500" : "text-good")} strokeWidth={3} />
                      <span className="min-w-0 flex-1 leading-snug">{x.text}</span>
                    </button>
                  </li>
                ))}
              </ul>}
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}
