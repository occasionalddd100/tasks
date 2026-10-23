import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CrosshairIcon, FlameIcon, HashIcon, InboxIcon, ListTodoIcon, PlusIcon, XIcon, PencilIcon } from "lucide-react";
import { motion } from "motion/react";
import { useDb, updateMany } from "@/lib/db";
import { focusList, clearDone, inFocus, toFocus } from "@/lib/focus";
import { tagsOf, tagOfTask } from "@/lib/tags";
import { draftsOf } from "@/lib/personal";
import { cn } from "@/lib/utils";
import { stale, byOrder, today, dueLabel } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { VIEW } from "@/components/ViewHeader";
import TaskRow from "@/components/tasks/TaskRow";
import { useFresh, setAmbient } from "@/components/tasks/QuickAdd";
import { openTask } from "@/components/tasks/TaskSheet";
import { openWheel, moveWheel, endWheel } from "@/components/tasks/TagWheel";
import { Fan } from "@/components/Fan";
import { useTasksTap } from "@/components/MobileNav";
import { Habits } from "@/components/tasks/ProjectViews";
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
    return db.tasks.filter(t => mine.has(t.cat) && !t.done && !t.hidden && !t.parent && !inFocus(t) && t.text?.trim() && (!t.assignee || t.assignee === me))
      .sort((a, b) => rank(a) - rank(b) || (a.due || "9").localeCompare(b.due || "9") || byOrder(a, b));
  }, [db.tasks, db.me, drafts?.id, tags.map(t => t.id).join()]);
  const groups = useMemo(() => {
    const by = new Map([[NONE, []], ...tags.map(t => [t.id, []])]);
    for (const t of rest) {
      by.get(t.cat === drafts?.id ? NONE : t.cat)?.push(t);
    }
    return by;
  }, [rest, tags.map(t => t.id).join(), drafts?.id]);
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
      glyph: <span className="text-base font-semibold" style={t.color ? { color: t.color } : undefined}>{(t.name.trim()[0] || "#").toUpperCase()}</span> })),
  ].filter(Boolean).slice(0, 9).concat({ id: "\u0000edit", name: "Править теги", glyph: <PencilIcon className="size-5" /> });

  return (
    <div className={cn(VIEW, "max-w-5xl")}>
      <header className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-bold tracking-tight md:text-3xl">Задачи</h1>
      </header>

      <div ref={chipsRef} className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        <TagChip on={!shownTag} onClick={() => setFilter(null)}>Все</TagChip>
        <TagChip on={shownTag === WORK} n={list.length - done} onClick={() => setFilter(shownTag === WORK ? null : WORK)}><CrosshairIcon className="size-3.5" />В работе</TagChip>
        {groups.get(NONE)?.length > 0 && <TagChip on={shownTag === NONE} onClick={() => setFilter(shownTag === NONE ? null : NONE)} n={groups.get(NONE).length}><InboxIcon className="size-3.5" />Без тега</TagChip>}
        {tags.map(t => <TagChip key={t.id} on={shownTag === t.id} color={t.color} n={groups.get(t.id)?.length} onClick={() => setFilter(shownTag === t.id ? null : t.id)}>{t.name}</TagChip>)}
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

      {shownTag !== WORK && <section className="flex flex-col gap-3">
        {shownTag
          ? <TagList tasks={groups.get(shownTag) || []} name={tagName(shownTag)} onClear={() => setFilter(null)} />
          : [...groups].filter(([, l]) => l.length).map(([id, l]) => (
              <TagRow key={id} id={id} name={tagName(id)} color={tags.find(t => t.id === id)?.color} tasks={l} onOpen={() => setFilter(id)} />
            ))}
        {!rest.length && <p className="text-sm text-muted-foreground">Других открытых задач нет.</p>}
      </section>}

      {!shownTag && db.habits.length > 0 && <Habits habits={db.habits} />}

      <Fan open={fan} setOpen={setFan} items={fanItems} anchor="navRight"
        onPick={t => { if (t.id === "\u0000edit") { openTagEditor(); return; } setFilter(t.id === "\u0000all" ? null : t.id); jump(); }} />
    </div>
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

// "В работе": drag to reorder, subtasks under their task
function WorkList({ list }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = list.map(t => t.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    updateMany("tasks", next.map((id, i) => [id, i + 1]).filter(([id, f]) => list.find(t => t.id === id)?.focus !== f).map(([id, focus]) => [id, { focus }]));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={list.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="-mx-1">{list.map(t => <WorkItem key={t.id} t={t} />)}</ul>
      </SortableContext>
    </DndContext>
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
        <TaskRow t={t} noFocusMark sub={name && "#" + name} grip={{ ref: setActivatorNodeRef, ...attributes, ...listeners }} />
        {kids.length > 0 && <ul className="mb-1 ml-9 border-l pl-2" aria-label={"Подзадачи: " + t.text}>{kids.map(k => <li key={k.id}><TaskRow t={k} noFocusMark /></li>)}</ul>}
      </motion.div>
    </li>
  );
}

// one tag: its tasks as cards in a row you scroll sideways; the rows themselves scroll down
function TagRow({ id, name, color, tasks, onOpen }) {
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onOpen} className="flex h-7 items-center gap-1.5 self-start rounded-full px-2.5 text-sm font-semibold"
        style={color ? { background: `color-mix(in oklab, transparent 75%, ${color})` } : { background: "var(--muted)" }}>
        {id === NONE ? <InboxIcon className="size-4 text-muted-foreground" /> : <HashIcon className="size-3.5" style={{ color }} />}
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
  return (
    <div ref={ref} {...hold.handlers} onClick={() => !hold.held.current && openTask(t.id)} onContextMenu={e => { e.preventDefault(); if (!hold.held.current) openWheel(t, e.clientX, e.clientY, true); }}
      style={color ? { background: `color-mix(in oklab, var(--card) 84%, ${color})`, borderColor: `color-mix(in oklab, var(--border) 50%, ${color})` } : undefined}
      className={cn("relative flex h-32 w-44 shrink-0 snap-start cursor-pointer flex-col rounded-2xl border bg-card p-3 shadow-xs transition-[transform,box-shadow] select-none [-webkit-touch-callout:none] active:scale-[.98] md:w-52",
        fresh && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
      <p className="line-clamp-4 text-[14px] leading-snug font-medium">{t.text}</p>
      <div className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
        {t.due && <span className={cn("rounded-md bg-muted px-1.5 py-0.5 whitespace-nowrap", late && "text-destructive")}>{dueLabel(t.due)}{t.time ? " " + t.time : ""}</span>}
        {t.prio === "urgent" && <FlameIcon className="size-3.5 text-red-500" />}
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
