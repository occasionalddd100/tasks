import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { CrosshairIcon, FlameIcon, InboxIcon, ListTodoIcon, PlusIcon, XIcon, PencilIcon, AlarmClockIcon, ChevronDownIcon, ChevronRightIcon, CheckIcon, ArchiveIcon, SunIcon, SunriseIcon, CalendarClockIcon, CornerDownRightIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as Pop from "@radix-ui/react-popover";
import { useDb, update, add } from "@/lib/db";
import { openList, toBucket } from "@/lib/focus";
import { timeOf } from "@/lib/reminders";
import { exText, exAt } from "@/lib/done";
import Bucket from "@/components/tasks/Bucket";
import { tagsOf, tagOfTask } from "@/lib/tags";
import { draftsOf } from "@/lib/personal";
import { cn } from "@/lib/utils";
import { stale, byOrder, today, dueLabel, dayDiff, plural, addDays, nextOrder } from "@/lib/tasks";
import { VIEW } from "@/components/ViewHeader";
import TaskRow from "@/components/tasks/TaskRow";
import { useFresh, setAmbient, addTask } from "@/components/tasks/QuickAdd";
import { TagMark } from "@/components/tasks/TagMark";
import { openTask } from "@/components/tasks/TaskSheet";
import { Fan, fanMax } from "@/components/Fan";
import { useTasksTap } from "@/components/MobileNav";
import { Habits, useJournal } from "@/components/tasks/ProjectViews";
import { openTagEditor } from "@/components/tasks/TagEditor";

// The home screen: every open task of «Личное», split by when (overdue, priority, today, tomorrow, planned, no date).
// The tags are a menu (a second tap on «Задачи» on the phone, the title on the computer); one tag shows as a list.
const NONE = "\u0000none", ALL = "\u0000all", EDIT = "\u0000edit";
let lastTag = null;
const store = { get: () => { try { return localStorage.getItem("tasksTag"); } catch { return null; } }, set: v => { try { v ? localStorage.setItem("tasksTag", v) : localStorage.removeItem("tasksTag"); } catch {} } };

export default function FocusView() {
  const db = useDb();
  const tags = tagsOf(db);
  const [filter, setFilterRaw] = useState(() => lastTag ?? store.get());
  const setFilter = v => { lastTag = v; store.set(v); setFilterRaw(v); };
  const [fan, setFan] = useState(false);
  const phone = !useMedia("(min-width: 768px)");
  const [slot, setSlot] = useState(null);
  useEffect(() => setSlot(document.getElementById("topbar-slot")), []);
  const actions = <>
    <button type="button" onClick={() => openTagEditor()} title="Править теги" aria-label="Править теги" className="inline-flex h-9 transition-all shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground max-md:px-2.5"><PencilIcon className="size-3.5" /><span className="max-md:hidden">Теги</span></button>
    <ZenButton /><TodayDone />
  </>;
  // a tag picked in the menu: the page starts over at the top
  const jump = () => setTimeout(() => document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" }), 60);
  // the tags live in a menu: on the phone a second tap on «Задачи» fans them out
  useTasksTap(() => setFan(f => !f));
  const drafts = draftsOf(db);
  const now = today();

  // every open task of mine, split by when; ticked today ones stay in «Сделано» until the day is over
  const rest = useMemo(() => openList(db).sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || (a.time || "9").localeCompare(b.time || "9") || byOrder(a, b)),
    [db.tasks, db.me, db.cats, drafts?.id, tags.map(t => t.id).join()]);
  const list = useMemo(() => {
    const mine = new Set([drafts?.id, ...tags.map(t => t.id)]);
    const done = db.tasks.filter(t => t.done && t.doneOn === now && !t.hidden && !t.parent && mine.has(t.cat) && (t.doneBy || t._owner) === db.me)
      .sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    return [...rest, ...done];
  }, [rest, db.tasks, now]);
  const groups = useMemo(() => {
    const by = new Map([[NONE, []], ...tags.map(t => [t.id, []])]);
    for (const t of rest) by.get(t.cat === drafts?.id ? NONE : t.cat)?.push(t);
    return by;
  }, [rest, tags.map(t => t.id).join(), drafts?.id]);
  const shownTag = filter && (filter === NONE || tags.some(t => t.id === filter)) ? filter : null;
  // a task just added from ＋ must be seen: drop a filter that would hide it
  const freshId = useFresh(), fresh = db.tasks.find(t => t.id === freshId);
  useEffect(() => {
    if (!fresh || !shownTag) return;
    const key = fresh.cat === drafts?.id ? NONE : fresh.cat;
    if (key !== shownTag) setFilter(null);
  }, [fresh?.id]);
  // ＋ adds to what's on screen: the picked tag
  useEffect(() => { setAmbient({ tag: shownTag && shownTag !== NONE ? shownTag : null }); return () => setAmbient(null); }, [shownTag]);
  const tagName = id => id === NONE ? "Без тега" : tags.find(t => t.id === id)?.name;

  const menu = [
    { id: ALL, name: "Все", n: rest.length, on: !shownTag, glyph: <ListTodoIcon className="size-5" /> },
    groups.get(NONE)?.length && { id: NONE, name: "Без тега", n: groups.get(NONE).length, on: shownTag === NONE, glyph: <InboxIcon className="size-5" /> },
    ...tags.map(t => ({ id: t.id, name: t.name, n: groups.get(t.id)?.length || 0, on: shownTag === t.id, tag: t,
      glyph: t.emoji ? <span className="text-xl leading-none">{t.emoji}</span> : <span className="text-base font-semibold" style={t.color ? { color: t.color } : undefined}>{(t.name.trim()[0] || "#").toUpperCase()}</span> })),
  ].filter(Boolean);
  const pick = id => { if (id === EDIT) { openTagEditor(); return; } setFilter(id === ALL ? null : id); jump(); };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );
  // a task can be dragged onto the pail to put it aside
  const [dragId, setDragId] = useState(null);
  const dragged = dragId && list.find(t => t.id === dragId);
  const onDragEnd = ({ active, over }) => {
    setDragId(null);
    if (over?.id === "bucket") { const t = list.find(x => x.id === active.id); if (t) toBucket(t); }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={e => setDragId(e.active.id)} onDragCancel={() => setDragId(null)} onDragEnd={onDragEnd}>
    <div className={cn(VIEW, "max-w-3xl")}>
      {phone && slot && createPortal(<div className="flex items-center gap-1.5 [&_button]:h-8 [&_button]:text-xs">{actions}</div>, slot)}
      {!phone && <header className="flex items-center gap-2">
        <div className="flex-1"><TagMenu items={menu} title={shownTag ? tagName(shownTag) : "Задачи"} onPick={pick} /></div>
        {actions}
      </header>}

      {!shownTag && <NextUp />}

      {shownTag
        ? <TagList cat={shownTag === NONE ? drafts?.id : shownTag} tasks={groups.get(shownTag) || []} name={tagName(shownTag)} onClear={() => setFilter(null)} />
        : <section className="flex flex-col gap-1">
            {list.length === 0
              ? <p className="py-3 text-sm text-muted-foreground">Открытых задач нет. Нажми ＋, чтобы добавить.</p>
              : <WorkList list={list} />}
          </section>}

      {!shownTag && db.habits.length > 0 && <Habits habits={db.habits} />}

      <Fan open={fan} setOpen={setFan} items={menu.slice(0, fanMax(1)).concat({ id: EDIT, name: "Править теги", glyph: <PencilIcon className="size-5" /> })} anchor="navRight"
        onPick={t => pick(t.id)} />
      <Bucket />
      {/* the task you hold follows the finger as a small card; dropped on the pail it just vanishes into it */}
      <DragOverlay dropAnimation={null}>
        {dragged && <div className="max-w-72 cursor-grabbing rounded-xl border bg-card px-3 py-2 text-sm font-medium shadow-2xl" style={{ rotate: "-2deg" }}>{dragged.text}</div>}
      </DragOverlay>
    </div>
    </DndContext>
  );
}

// what is next by the clock: time left to the nearest timed task, and the two after it. One thin line;
// ✕ hides it until another task becomes the nearest one
function NextUp() {
  const db = useDb();
  const [tick, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 30e3); return () => clearInterval(i); }, []);
  const [hidden, setHiddenRaw] = useState(() => { try { return localStorage.getItem("nextUpHidden") || ""; } catch { return ""; } });
  const hide = k => { setHiddenRaw(k); try { localStorage.setItem("nextUpHidden", k); } catch {} };
  const now = Date.now(), day = today();
  const next = useMemo(() => openList(db).map(t => {
    const time = timeOf(t); if (!time) return null;
    const at = new Date((t.due || day) + "T" + time).getTime();
    return at > now - 15 * 60e3 && at < now + 2 * 864e5 ? { t, at, time } : null;
  }).filter(Boolean).sort((a, b) => a.at - b.at).slice(0, 3), [db.tasks, tick, day]);
  if (!next.length) return null;
  const first = next[0], key = first.t.id + "@" + first.at;
  if (hidden === key) return null;
  const left = ms => {
    if (ms <= 0) return "сейчас";
    const m = Math.round(ms / 60e3), h = Math.floor(m / 60);
    return "через " + (h ? h + " ч" + (m % 60 ? " " + (m % 60) + " мин" : "") : m + " мин");
  };
  return (
    <div className="flex h-9 items-center gap-2 rounded-full bg-violet-500/10 pr-1 pl-3 text-sm">
      <AlarmClockIcon className="size-4 shrink-0 text-violet-500" />
      <button type="button" onClick={() => openTask(first.t.id)} className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left">
        <span className="shrink-0 font-semibold tabular-nums">{left(first.at - now)}</span>
        <span className="min-w-0 truncate text-muted-foreground">{first.t.text}</span>
      </button>
      {next.slice(1).map(x => (
        <button key={x.t.id} type="button" onClick={() => openTask(x.t.id)} title={x.t.text}
          className="shrink-0 rounded-full bg-background/60 px-2 py-0.5 text-xs text-muted-foreground tabular-nums max-sm:last:hidden">{x.at - now > 864e5 - 0 && x.t.due !== day ? dueLabel(x.t.due) + " " : ""}{x.time}</button>
      ))}
      <button type="button" onClick={() => hide(key)} aria-label="Скрыть" title="Скрыть до следующей задачи"
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background/60"><XIcon className="size-3.5" /></button>
    </div>
  );
}

// computer: the title is the tag menu (Все, Без тега, every tag, Править теги)
function TagMenu({ items, title, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <Pop.Root open={open} onOpenChange={setOpen}>
      <Pop.Trigger asChild>
        <button type="button" className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-2xl font-bold tracking-tight hover:bg-accent md:text-3xl">
          {title}<ChevronDownIcon className="size-5 text-muted-foreground" />
        </button>
      </Pop.Trigger>
      <Pop.Portal>
        <Pop.Content align="start" sideOffset={6}
          className="z-50 w-64 max-h-[70vh] overflow-y-auto rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl data-[state=open]:animate-[menu-in_140ms_ease-out]">
          {[...items, { id: EDIT, name: "Править теги" }].map(it => (
            <button key={it.id} type="button" onClick={() => { setOpen(false); onPick(it.id); }}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-accent", it.on && "bg-accent font-medium", it.id === EDIT && "mt-1 border-t pt-2 text-muted-foreground")}>
              <span className="grid w-5 shrink-0 place-items-center">
                {it.id === EDIT ? <PencilIcon className="size-3.5" /> : it.id === ALL ? <ListTodoIcon className="size-4" /> : it.id === NONE ? <InboxIcon className="size-4" /> : <TagMark t={it.tag} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{it.name}</span>
              {it.n > 0 && <span className="text-xs text-muted-foreground tabular-nums">{it.n}</span>}
            </button>
          ))}
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}

// the tasks split by when; drag one onto the pail to put it aside; subtasks under their task
function WorkList({ list }) {
  const db = useDb();
  // two or more tasks of one tag in a group fold together under the tag, where the first of them stood
  const bunch = tasks => {
    const out = [], at = new Map();
    for (const t of tasks) {
      const tag = tagOfTask(db, t);
      if (!tag || tasks.filter(x => tagOfTask(db, x)?.id === tag.id).length < 2) { out.push({ tasks: [t] }); continue; }
      if (!at.has(tag.id)) { at.set(tag.id, out.length); out.push({ tag, tasks: [] }); }
      out[at.get(tag.id)].tasks.push(t);
    }
    return out;
  };
  const now = today(), tomorrow = addDays(1);
  const [adding, setAdding] = useState(null);
  const groups = WORK_GROUPS.map(g => ({ ...g, tasks: list.filter(t => groupOf(t, now, tomorrow) === g.k) })).filter(g => g.tasks.length || g.k === adding);
  const empty = WORK_GROUPS.filter(g => g.add && !groups.some(x => x.k === g.k));
  return (
      <div className="flex flex-col gap-2">
        {groups.map(g => (
          <Group key={g.k} id={"work:" + g.k} title={g.l} icon={g.icon} color={g.c} n={g.tasks.length}
            onAdd={g.add} withDate={g.k === "planned"} adding={adding === g.k} setAdding={v => setAdding(v ? g.k : null)}>
            <ul>{bunch(g.tasks).map(b => b.tag ? <TagBunch key={b.tag.id} id={g.k + ":" + b.tag.id} tag={b.tag} tasks={b.tasks} /> : <WorkItem key={b.tasks[0].id} t={b.tasks[0]} />)}</ul>
          </Group>
        ))}
        {/* groups with nothing in them yet: one quiet row of ＋ to start one */}
        {empty.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {empty.map(g => (
              <button key={g.k} type="button" onClick={() => setAdding(g.k)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed px-2.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:text-foreground">
                <PlusIcon className="size-3" /><g.icon className="size-3" style={{ color: g.c }} />{g.l}
              </button>
            ))}
          </div>
        )}
      </div>
  );
}

// split by when: each task lands in the first group that fits
export const WORK_GROUPS = [
  { k: "late", l: "Просрочено", c: "#ef4444", icon: AlarmClockIcon },
  { k: "urgent", l: "Приоритет", c: "#f97316", icon: FlameIcon, add: async v => { const r = await addTask(v); if (r?.id) update("tasks", r.id, { prio: "urgent" }); } },
  { k: "today", l: "Сегодня", c: "#f59e0b", icon: SunIcon, add: v => addTask(v, { due: today() }) },
  { k: "tomorrow", l: "Завтра", c: "#0ea5e9", icon: SunriseIcon, add: v => addTask(v, { due: addDays(1) }) },
  { k: "planned", l: "Запланированные", c: "#8b5cf6", icon: CalendarClockIcon, add: (v, date) => addTask(v, { due: date || addDays(2) }) },
  { k: "free", l: "Без срока", c: "#64748b", icon: InboxIcon, add: v => addTask(v) },
  { k: "done", l: "Сделано", c: "#22c55e", icon: CheckIcon },
];
export function groupOf(t, now, tomorrow) {
  if (t.done) return "done";
  if (t.due && t.due < now) return "late";
  if (t.prio === "urgent") return "urgent";
  if (t.due === now || t.prio === "today") return "today";
  if (t.due === tomorrow) return "tomorrow";
  if (t.due) return "planned";
  return "free";
}

// tasks of one tag inside a group: a row with the tag and count that folds them (remembered per group and tag)
function TagBunch({ id, tag, tasks }) {
  const [open, setOpenRaw] = useState(() => !loadFold().has("bunch:" + id));
  const setOpen = v => { setOpenRaw(v); try { const f = loadFold(); v ? f.delete("bunch:" + id) : f.add("bunch:" + id); localStorage.setItem(FOLD, JSON.stringify([...f])); } catch {} };
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-accent/50">
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        <TagMark t={tag} /><span className="font-medium text-foreground">{tag.name}</span>
        <span className="text-xs tabular-nums">{tasks.length}</span>
      </button>
      {open && <ul className="ml-3 border-l pl-1">{tasks.map(t => <WorkItem key={t.id} t={t} />)}</ul>}
    </li>
  );
}

// one foldable block, the same look everywhere: coloured edge and tint, title, count, chevron (remembered per block)
const FOLD = "folded";
const loadFold = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLD) || "[]")); } catch { return new Set(); } };
function Group({ id, title, icon: Icon, color, n, children, onAdd, withDate, adding: addingProp, setAdding: setAddingProp }) {
  const [open, setOpenRaw] = useState(() => !loadFold().has(id));
  const setOpen = v => { setOpenRaw(v); try { const f = loadFold(); v ? f.delete(id) : f.add(id); localStorage.setItem(FOLD, JSON.stringify([...f])); } catch {} };
  const [addingOwn, setAddingOwn] = useState(false);
  const adding = addingProp ?? addingOwn, setAdding = setAddingProp ?? setAddingOwn;
  const shown = open || adding;
  return (
    <section className="shrink-0 overflow-hidden rounded-xl border border-border/70 bg-card/50 max-md:rounded-none max-md:border-0 max-md:bg-transparent">
      <div className="group/h flex h-10 items-center transition-colors hover:bg-accent/40">
        <button type="button" onClick={() => setOpen(!shown)} aria-expanded={shown} className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 text-left">
          <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in oklab, transparent 84%, ${color})` }}><Icon className="size-3.5" style={{ color }} /></span>
          <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{n || ""}</span>
        </button>
        {onAdd && <button type="button" onClick={() => { setOpen(true); setAdding(true); }} aria-label={"Добавить в «" + title + "»"} title={"Добавить в «" + title + "»"}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/h:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100 max-md:opacity-70"><PlusIcon className="size-4" /></button>}
        <button type="button" onClick={() => setOpen(!shown)} aria-label={shown ? "Свернуть" : "Развернуть"} className="grid h-full w-9 shrink-0 place-items-center">
          <ChevronRightIcon className={cn("size-3.5 text-muted-foreground/70 transition-transform group-hover/h:text-foreground", shown && "rotate-90")} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {shown && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-border/50 px-1 py-1 max-md:border-0 max-md:px-0">
            {adding && <AddLine placeholder={"Новая задача в «" + title + "»"} withDate={withDate} onAdd={onAdd} onClose={() => setAdding(false)} />}
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// one line to type a task (or subtask) into; Enter adds and stays for the next, Esc or leaving it empty closes
function AddLine({ placeholder, onAdd, onClose, withDate, className }) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => addDays(2));
  const box = useRef(null);
  useEffect(() => { const t = setTimeout(() => box.current?.querySelector("input")?.focus(), 30); return () => clearTimeout(t); }, []);
  const submit = e => { e.preventDefault(); const v = text.trim(); if (!v) return onClose(); onAdd(v, date); setText(""); };
  return (
    <form ref={box} onSubmit={submit} className={cn("flex items-center gap-1.5 px-1.5 py-1", className)}
      onBlur={e => { if (!box.current?.contains(e.relatedTarget) && !text.trim()) setTimeout(onClose, 200); /* after the click that took focus lands */ }}>
      <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
      <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} enterKeyHint="done"
        onKeyDown={e => e.key === "Escape" && (setText(""), onClose())}
        className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
      {withDate && <input type="date" value={date} min={addDays(2)} onChange={e => setDate(e.target.value)} aria-label="Когда"
        className="h-7 shrink-0 rounded-md border bg-background px-1.5 text-xs text-muted-foreground outline-none" />}
    </form>
  );
}

function WorkItem({ t }) {
  const db = useDb();
  const kids = db.tasks.filter(k => k.parent === t.id && !stale(k)).sort(byOrder);
  const tag = tagOfTask(db, t), cat = db.cats.find(c => c.id === t.cat), board = db.boards.find(b => b.id === cat?.board);
  const name = tag?.name || (cat?.drafts ? "" : db.projects.find(p => p.id === board?.project)?.name);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({ id: t.id, disabled: t.done });
  const [sub, setSub] = useState(false);
  return (
    <li ref={setNodeRef}
      className={cn("relative rounded-lg", isDragging && "z-10 opacity-30")}>
      {/* a soft tint and a thin bar in the tag's colour, so work from different tags reads apart */}
      {tag && <span className="absolute inset-y-2.5 left-0.5 w-[3px] rounded-full opacity-80" style={{ background: tag.color }} />}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <div className="group/w relative">
          <TaskRow t={t} onAddSub={() => setSub(true)} sub={name && (tag?.emoji ? tag.emoji + " " : "#") + name} grip={t.done ? undefined : { ref: setActivatorNodeRef, ...attributes, ...listeners }} />
          {!t.done && <div className="absolute top-1/2 right-11 flex -translate-y-1/2 gap-0.5 rounded-md bg-background/80 opacity-0 transition-opacity group-hover/w:opacity-100 focus-within:opacity-100 max-md:hidden">
            <PrioBtn t={t} />
            <button type="button" onClick={() => setSub(true)} title="Добавить подзадачу" aria-label={"Подзадача к: " + t.text}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"><CornerDownRightIcon className="size-4" /></button>
            <button type="button" onClick={() => toBucket(t)} title="Отложить в ведёрко" aria-label={"Отложить: " + t.text}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"><ArchiveIcon className="size-4" /></button>
          </div>}
        </div>
        <SubTasks t={t} kids={kids} adding={sub} setAdding={setSub} />
      </motion.div>
    </li>
  );
}

function TagList({ cat, tasks, name, onClear }) {
  const db = useDb();
  // ticked tasks stay in sight under the list (newest first), so a checked one doesn't just vanish
  const done = useMemo(() => db.tasks.filter(t => t.cat === cat && t.done && !t.parent && (t.doneBy || t._owner) === db.me)
    .sort((a, b) => (b.doneAt || b.doneOn || "").localeCompare(a.doneAt || a.doneOn || "")), [db.tasks, cat, db.me]);
  const [more, setMore] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{tasks.length ? `${tasks.length} в «${name}»` : `В «${name}» открытых задач нет`}</span>
        <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1 hover:text-foreground"><XIcon className="size-3.5" />Все теги</button>
      </div>
      <ul className="-mx-1">{tasks.map(t => <SubRow key={t.id} t={t} />)}</ul>
      {done.length > 0 && (
        <div className="mt-2">
          <Group id={"done:" + cat} title="Сделано" icon={CheckIcon} color="#22c55e" n={done.length}>
            <ul>
              {(more ? done : done.slice(0, 30)).map(t => <li key={t.id}><TaskRow t={t} sub={t.doneOn ? "сделано " + dueLabel(t.doneOn) : ""} /></li>)}
              {done.length > 30 && !more && <li><button type="button" onClick={() => setMore(true)} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">показать все {done.length}</button></li>}
            </ul>
          </Group>
        </div>
      )}
    </div>
  );
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

function useMedia(q) {
  const [on, setOn] = useState(() => matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q), f = () => setOn(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, [q]);
  return on;
}

// a task's subtasks under it, and the line to add one
function SubTasks({ t, kids, adding, setAdding }) {
  if (!kids.length && !adding) return null;
  return (
    <ul className="mb-1 ml-9 border-l pl-2" aria-label={"Подзадачи: " + t.text}>
      {kids.map(k => <li key={k.id}><TaskRow t={k} /></li>)}
      {adding && <li><AddLine placeholder="Подзадача, Enter — ещё одна" className="px-0"
        onAdd={v => add("tasks", { text: v, cat: t.cat, parent: t.id, order: nextOrder(kids), done: false })} onClose={() => setAdding(false)} /></li>}
    </ul>
  );
}

// a task in a tag's list, with its subtasks and «Добавить подзадачу» in its menu
function SubRow({ t }) {
  const db = useDb();
  const kids = db.tasks.filter(k => k.parent === t.id && !stale(k)).sort(byOrder);
  const [sub, setSub] = useState(false);
  return <li><TaskRow t={t} onAddSub={() => setSub(true)} /><SubTasks t={t} kids={kids} adding={sub} setAdding={setSub} /></li>;
}

// flame: put a task in «Приоритет» or take it out
function PrioBtn({ t, small }) {
  const on = t.prio === "urgent";
  return (
    <button type="button" onClick={() => update("tasks", t.id, { prio: on ? "" : "urgent" })} aria-pressed={on}
      title={on ? "Убрать из приоритета" : "В приоритет"} aria-label={(on ? "Убрать из приоритета: " : "В приоритет: ") + t.text}
      className={cn("grid shrink-0 place-items-center rounded-md hover:bg-accent", small ? "size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" : "size-7",
        on ? "text-red-500" : "text-muted-foreground hover:text-red-500")}>
      <FlameIcon className={small ? "size-3.5" : "size-4"} fill={on ? "currentColor" : "none"} />
    </button>
  );
}

// the way into Фокус; glows until it's been opened today. «F» works too
function ZenButton() {
  const fresh = (() => { try { return localStorage.getItem("zenSeen") !== today(); } catch { return true; } })();
  useEffect(() => {
    const on = e => { if ((e.key === "f" || e.key === "а") && !e.ctrlKey && !e.metaKey && !e.target.closest?.("input,textarea,[contenteditable=true],[role=dialog]")) { e.preventDefault(); location.hash = "#zen"; } };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, []);
  return (
    <button type="button" onClick={() => { location.hash = "#zen"; }} title="Фокус: одна задача на весь экран (F)"
      className="relative inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-sm font-semibold text-background transition-transform hover:scale-[1.03] active:scale-95">
      {fresh && <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-ping rounded-full bg-emerald-400" />}
      {fresh && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400" />}
      <CrosshairIcon className="size-4" />Фокус
    </button>
  );
}
