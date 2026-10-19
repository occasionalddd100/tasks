import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
  closestCenter, closestCorners, pointerWithin,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarIcon, CheckCheckIcon, ChevronDownIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, GripVerticalIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDb, getDb, add, update, updateMany, remove } from "@/lib/db";
import { byOrder, nextOrder, stale, inWeek, fmtDate } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/Confirm";
import TaskRow, { descendantsOf, People } from "@/components/tasks/TaskRow";
import { usePeople } from "@/lib/people";
import { ActionsContext, ActionsDropdown } from "@/components/ui/actions";
import InlineInput from "@/components/InlineInput";

const T = "t:", C = "c:", D = "d:";
// subtasks by parent id, and ids that should fade in (created after the board opened)
const Kids = createContext(new Map());
const Fresh = createContext(new Set());
const fold = { initial: { height: 0, opacity: 0 }, animate: { height: "auto", opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { duration: 0.2, ease: [0.2, 0, 0, 1] } };
const raw = id => id.slice(2);

// only categories collide with a dragged category; tasks land on tasks or on a category's list
function collision(args) {
  const isCat = String(args.active.id).startsWith(C);
  const droppableContainers = args.droppableContainers.filter(c => String(c.id).startsWith(C) === isCat);
  const a = { ...args, droppableContainers };
  if (isCat) return closestCenter(a);
  const hits = pointerWithin(a).sort((x, y) => String(x.id).startsWith(T) ? -1 : String(y.id).startsWith(T) ? 1 : 0);
  return hits.length ? hits : closestCorners(a);
}

export default function Board({ board }) {
  const db = useDb();
  const cats = useMemo(() => db.cats.filter(c => c.board === board.id).sort(byOrder), [db.cats, board.id]);
  const catSet = useMemo(() => new Set(cats.map(c => c.id)), [cats]);
  const all = useMemo(() => db.tasks.filter(t => catSet.has(t.cat) && !stale(t)), [db.tasks, catSet]);
  const archive = useMemo(() => db.tasks.filter(t => catSet.has(t.cat) && stale(t)).sort((a, b) => (b.doneOn || "").localeCompare(a.doneOn || "") || byOrder(a, b)), [db.tasks, catSet]);
  // a subtask lives under its parent; if the parent is hidden (old and done) it shows as a normal task
  const { visible, kids } = useMemo(() => {
    const ids = new Set(all.map(t => t.id)), kids = new Map(), visible = [];
    for (const t of [...all].sort(byOrder)) {
      if (t.parent && ids.has(t.parent)) { if (!kids.has(t.parent)) kids.set(t.parent, []); kids.get(t.parent).push(t); }
      else visible.push(t);
    }
    return { visible, kids };
  }, [all]);
  const week = useMemo(() => visible.filter(inWeek).sort((a, b) => a.due.localeCompare(b.due) || (a.time || "99").localeCompare(b.time || "99") || byOrder(a, b)), [visible]);
  const items = useMemo(() => {
    const m = Object.fromEntries(cats.map(c => [c.id, []]));
    for (const t of visible) m[t.cat].push(t.id);
    return m;
  }, [cats, visible]);
  const people = usePeople(board.project);
  const seen = useRef(null);
  if (!seen.current && db.ready) seen.current = new Set(db.tasks.map(t => t.id));
  const fresh = useMemo(() => new Set(all.filter(t => seen.current && !seen.current.has(t.id)).map(t => t.id)), [all]);
  const taskById = useMemo(() => new Map(db.tasks.map(t => [t.id, t])), [db.tasks]);

  // while dragging, the board shows this local copy so tasks can hop between categories
  const [drag, setDrag] = useState(null);
  const [catOrder, setCatOrder] = useState(null);
  const [active, setActive] = useState(null);
  const shown = drag || items;
  const catList = catOrder ? catOrder.map(id => cats.find(c => c.id === id)).filter(Boolean) : cats;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const containerOf = (id, m) => {
    if (id.startsWith(D) || id.startsWith(C)) return raw(id);
    const tid = raw(id);
    return Object.keys(m).find(k => m[k].includes(tid));
  };

  const onDragStart = ({ active }) => {
    setActive(active.id);
    if (active.id.startsWith(T)) setDrag(structuredClone(items));
    else setCatOrder(cats.map(c => c.id));
  };
  const onDragOver = ({ active, over }) => {
    if (!over || !active.id.startsWith(T) || !drag) return;
    const from = containerOf(active.id, drag), to = containerOf(String(over.id), drag);
    if (!from || !to || from === to) return;
    setDrag(m => {
      const tid = raw(active.id), dest = [...m[to]];
      const at = String(over.id).startsWith(T) ? dest.indexOf(raw(over.id)) : dest.length;
      dest.splice(at < 0 ? dest.length : at, 0, tid);
      return { ...m, [from]: m[from].filter(x => x !== tid), [to]: dest };
    });
  };
  const onDragEnd = ({ active, over }) => {
    setActive(null);
    if (active.id.startsWith(C)) {
      const order = catOrder; setCatOrder(null);
      if (!over || !order) return;
      const next = arrayMove(order, order.indexOf(raw(active.id)), order.indexOf(raw(String(over.id))));
      const changes = next.map((id, i) => [id, i + 1]).filter(([id, o]) => cats.find(c => c.id === id)?.order !== o);
      updateMany("cats", changes.map(([id, order]) => [id, { order }]));
      return;
    }
    let m = drag; setDrag(null);
    if (!m) return;
    if (over) {
      const c = containerOf(active.id, m), oid = String(over.id);
      if (c && oid.startsWith(T) && m[c].includes(raw(oid))) {
        m = { ...m, [c]: arrayMove(m[c], m[c].indexOf(raw(active.id)), m[c].indexOf(raw(oid))) };
      }
    } else m = items;
    const changes = [];
    for (const [cat, ids] of Object.entries(m)) ids.forEach((id, i) => {
      const t = taskById.get(id);
      if (t && (t.cat !== cat || t.order !== i + 1)) changes.push([id, { cat, order: i + 1 }]);
      // subtasks follow their parent into another category
      if (t && t.cat !== cat) for (const k of descendantsOf(id)) changes.push([k, { cat }]);
    });
    updateMany("tasks", changes);
  };
  const onDragCancel = () => { setDrag(null); setCatOrder(null); setActive(null); };

  const activeTask = active?.startsWith(T) ? taskById.get(raw(active)) : null;
  const activeCat = active?.startsWith(C) ? cats.find(c => c.id === raw(active)) : null;

  return (
    <People.Provider value={people}><Kids.Provider value={kids}><Fresh.Provider value={fresh}>
    <div className="flex flex-col gap-4">
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
        <SortableContext items={catList.map(c => C + c.id)} strategy={rectSortingStrategy}>
          <Masonry>
            {week.length > 0 && <WeekCard tasks={week} />}
            {catList.map(c => <CatCard key={c.id} cat={c} ids={shown[c.id] || []} taskById={taskById} />)}
          </Masonry>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeTask && <div className="rounded-md border bg-card shadow-lg"><TaskRow t={activeTask} overlay /></div>}
          {activeCat && <div className="rounded-xl border bg-card px-4 py-3 font-semibold shadow-lg">{activeCat.name}</div>}
        </DragOverlay>
      </DndContext>
      {archive.length > 0 && <DoneCard tasks={archive} cats={cats} />}
      {!cats.length && <p className="text-sm text-muted-foreground">Во вкладке пока нет категорий. Создай первую кнопкой ниже.</p>}
      <NewCat board={board} cats={cats} />
      <p className="text-xs text-muted-foreground">Тяни за ⋮⋮, чтобы переставить задачу или категорию. Нажми на текст, чтобы изменить. <span className="max-md:hidden">Правая кнопка мыши открывает меню: заметка, подзадача, приоритет, дата.</span><span className="md:hidden">Долгое нажатие или ⋯ открывает меню.</span></p>
    </div>
    </Fresh.Provider></Kids.Provider></People.Provider>
  );
}

// two-column masonry: each card spans as many 4px rows as its height needs
function Masonry({ children }) {
  return <div className="grid grid-cols-1 items-start gap-x-4 [grid-auto-rows:4px] md:grid-cols-2">{children}</div>;
}
function useSpan() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => { el.style.gridRowEnd = "span " + Math.ceil((el.firstElementChild.getBoundingClientRect().height + 16) / 4); };
    set();
    const ro = new ResizeObserver(set); ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return ref;
}

function WeekCard({ tasks }) {
  const span = useSpan();
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem("weekFold") === "1"; } catch { return false; } });
  const toggle = () => { setFolded(f => { try { localStorage.setItem("weekFold", f ? "0" : "1"); } catch {} return !f; }); };
  return (
    <div ref={span} className="md:col-span-2">
      <section className="rounded-xl border bg-card shadow-xs">
        <header className="flex items-center gap-1.5 px-3 pt-3 pb-1">
          <FoldBtn folded={folded} onClick={toggle} />
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><CalendarIcon className="size-4" />На неделе</h2>
          <span className="text-[13px] text-muted-foreground tabular-nums">{tasks.filter(t => t.done).length} / {tasks.length}</span>
        </header>
        <AnimatePresence initial={false}>
          {!folded && <motion.div {...fold} className="overflow-hidden"><ul className="px-2 pb-2">{tasks.map(t => <li key={t.id}><TaskNode t={t} /></li>)}</ul></motion.div>}
        </AnimatePresence>
        {folded && <div className="h-2" />}
      </section>
    </div>
  );
}

// done tasks hidden by hand or done before today, newest first; unchecking one returns it to its category
function DoneCard({ tasks, cats }) {
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem("doneFold") !== "0"; } catch { return true; } });
  const [limit, setLimit] = useState(30);
  const toggle = () => { setFolded(f => { try { localStorage.setItem("doneFold", f ? "0" : "1"); } catch {} return !f; }); };
  const catName = useMemo(() => new Map(cats.map(c => [c.id, c.name])), [cats]);
  return (
    <section className="rounded-xl border bg-card/60 shadow-xs">
      <header className="flex items-center gap-1.5 px-3 py-2.5">
        <FoldBtn folded={folded} onClick={toggle} />
        <h2 className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold text-muted-foreground" onClick={toggle}><CheckCheckIcon className="size-4" />Выполненные</h2>
        <span className="text-[13px] text-muted-foreground tabular-nums">{tasks.length}</span>
      </header>
      <AnimatePresence initial={false}>
        {!folded && (
          <motion.div {...fold} className="overflow-hidden">
            <ul className="px-2 pb-2">
              {tasks.slice(0, limit).map((t, i, arr) => (
                <li key={t.id} title={catName.get(t.cat)}>
                  {(i === 0 || arr[i - 1].doneOn !== t.doneOn) && (
                    <div className="flex items-center gap-3 px-2 pt-3 pb-1 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      <span className="shrink-0">{t.doneOn ? fmtDate(t.doneOn) : "Без даты"}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <TaskRow t={t} />
                </li>
              ))}
            </ul>
            {tasks.length > limit && <Button variant="ghost" size="sm" className="mx-3 mb-3 text-muted-foreground" onClick={() => setLimit(l => l + 30)}>Показать ещё ({tasks.length - limit})</Button>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function CatCard({ cat, ids, taskById }) {
  const span = useSpan();
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: C + cat.id });
  const { setNodeRef: dropRef } = useDroppable({ id: D + cat.id });
  const [renaming, setRenaming] = useState(false);
  const [text, setText] = useState("");
  const input = useRef(null);
  const kids = useContext(Kids);
  const tasks = ids.map(id => taskById.get(id)).filter(Boolean);
  const parents = tasks.filter(t => kids.has(t.id));

  const addTask = e => {
    e.preventDefault(); const t = text.trim(); if (!t) return; setText("");
    add("tasks", { text: t, cat: cat.id, order: nextOrder(tasks), done: false });
  };
  const del = async () => {
    const open = getDb().tasks.filter(t => t.cat === cat.id && !t.done);
    if (open.length && !await confirmAction({ title: `Удалить категорию «${cat.name}»?`, description: `Удалятся открытые задачи (${open.length}). Выполненные останутся в журнале.` })) return;
    if (open.length) await remove("tasks", open.map(t => t.id));
    remove("cats", cat.id);
  };
  const toggle = () => update("cats", cat.id, { collapsed: !cat.collapsed });
  const allFolded = parents.length && parents.every(t => t.collapsed);
  const items = [
    { label: "Добавить задачу", icon: PlusIcon, onSelect: () => { if (cat.collapsed) toggle(); setTimeout(() => input.current?.focus(), 250); } },
    { label: "Переименовать", icon: PencilIcon, onSelect: () => setTimeout(() => setRenaming(true)) },
    { label: cat.collapsed ? "Развернуть" : "Свернуть", icon: ChevronDownIcon, onSelect: toggle },
    parents.length > 0 && { label: allFolded ? "Раскрыть все подзадачи" : "Свернуть все подзадачи", icon: allFolded ? ChevronsUpDownIcon : ChevronsDownUpIcon,
      onSelect: () => updateMany("tasks", parents.map(t => [t.id, { collapsed: !allFolded }])) },
    { sep: true },
    { label: "Удалить категорию", icon: Trash2Icon, variant: "destructive", onSelect: del },
  ];

  return (
    <div ref={el => { span.current = el; setNodeRef(el); }} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "z-10 opacity-40")}>
      <section className="group/cat rounded-xl border bg-card shadow-xs">
        <ActionsContext items={items}>
          <header className="flex items-center gap-1 rounded-t-xl px-2 pt-2.5 pb-1">
            <button ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={"Перетащить категорию " + cat.name}
              className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing">
              <GripVerticalIcon className="size-4" />
            </button>
            <FoldBtn folded={cat.collapsed} onClick={toggle} />
            {renaming
              ? <InlineInput value={cat.name} onDone={name => { setRenaming(false); if (name && name !== cat.name) update("cats", cat.id, { name }); }} className="h-7 text-[15px] font-semibold" />
              : <h2 className="min-w-0 cursor-text truncate text-[15px] font-semibold" onClick={() => setRenaming(true)} title="Переименовать">{cat.name}</h2>}
            <span className="text-[13px] text-muted-foreground tabular-nums">{tasks.length ? `${tasks.filter(t => t.done).length} / ${tasks.length}` : ""}</span>
            <ActionsDropdown align="end" items={items} trigger={
              <Button variant="ghost" size="iconSm" className="ml-auto text-muted-foreground opacity-60 md:hidden" aria-label="Действия с категорией"><MoreHorizontalIcon className="size-3.5" /></Button>
            } />
          </header>
        </ActionsContext>
        <AnimatePresence initial={false}>
          {!cat.collapsed && (
            <motion.div {...fold} className="overflow-hidden">
              <SortableContext items={ids.map(id => T + id)} strategy={verticalListSortingStrategy}>
                <ul ref={dropRef} className="min-h-2 px-2">
                  {tasks.map(t => <SortableTask key={t.id} t={t} />)}
                </ul>
              </SortableContext>
              <form onSubmit={addTask} className="px-3 pt-1 pb-3">
                <Input ref={input} value={text} onChange={e => setText(e.target.value)} placeholder="+ задача" className="h-8 border-dashed bg-transparent shadow-none" aria-label={"Новая задача в " + cat.name} />
              </form>
            </motion.div>
          )}
        </AnimatePresence>
        {cat.collapsed && <div className="h-1.5" />}
      </section>
    </div>
  );
}

function SortableTask({ t }) {
  const hasKids = useContext(Kids).has(t.id);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: T + t.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} data-kids={hasKids || undefined} className={cn("relative", isDragging && "z-10 opacity-30")}>
      <TaskNode t={t} grip={{ ref: setActivatorNodeRef, ...attributes, ...listeners }} />
    </li>
  );
}

// a task with its subtasks below, indented, joined to it by a rail with an arrow pointing up at the parent
function TaskNode({ t, grip }) {
  const kids = useContext(Kids).get(t.id) || [];
  const isNew = useContext(Fresh).has(t.id);
  const [adding, setAdding] = useState(false);
  const toggle = () => update("tasks", t.id, { collapsed: !t.collapsed });
  const open = (kids.length > 0 && !t.collapsed) || adding;
  const body = (
    <>
      <TaskRow t={t} grip={grip}
        kids={kids.length ? { collapsed: !!t.collapsed, toggle, done: kids.filter(k => k.done).length, total: kids.length } : null}
        onAddSub={() => { if (t.collapsed) update("tasks", t.id, { collapsed: false }); setTimeout(() => setAdding(true), 30); }} />
      <AnimatePresence initial={false}>
        {open && <motion.div {...fold} className="overflow-hidden"><SubList parent={t} kids={t.collapsed ? [] : kids} adding={adding} setAdding={setAdding} /></motion.div>}
      </AnimatePresence>
    </>
  );
  return isNew ? <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>{body}</motion.div> : body;
}

function SubList({ parent, kids, adding, setAdding }) {
  const [text, setText] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = kids.map(k => k.id);
    const next = arrayMove(ids, ids.indexOf(raw(active.id)), ids.indexOf(raw(over.id)));
    updateMany("tasks", next.map((id, i) => [id, i + 1]).filter(([id, o]) => kids.find(k => k.id === id)?.order !== o).map(([id, order]) => [id, { order }]));
  };
  const submit = e => {
    e.preventDefault(); const v = text.trim(); if (!v) return setAdding(false);
    setText("");
    add("tasks", { text: v, cat: parent.cat, parent: parent.id, order: nextOrder(kids), done: false });
  };
  return (
    <ul className="subtree" aria-label={"Подзадачи: " + parent.text}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={kids.map(k => T + k.id)} strategy={verticalListSortingStrategy}>
          {kids.map(k => <SortableTask key={k.id} t={k} />)}
        </SortableContext>
      </DndContext>
      {adding && (
        <li>
          <form onSubmit={submit} className="py-1 pl-11">
            <Input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Подзадача, Enter — ещё одна"
              onKeyDown={e => e.key === "Escape" && (setText(""), setAdding(false))} onBlur={() => !text.trim() && setAdding(false)}
              className="h-7 border-dashed bg-transparent text-sm shadow-none" aria-label={"Новая подзадача к " + parent.text} />
          </form>
        </li>
      )}
    </ul>
  );
}

function FoldBtn({ folded, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={!folded} aria-label={folded ? "Развернуть" : "Свернуть"}
      className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent">
      <ChevronDownIcon className={cn("size-4 transition-transform", folded && "-rotate-90")} />
    </button>
  );
}

function NewCat({ board, cats }) {
  const [open, setOpen] = useState(false), [name, setName] = useState("");
  if (!open) return <Button variant="outline" className="self-start border-dashed" onClick={() => setOpen(true)}><PlusIcon />Новая категория</Button>;
  const submit = e => {
    e.preventDefault(); const n = name.trim(); if (!n) return;
    setName(""); setOpen(false);
    add("cats", { name: n, board: board.id, order: nextOrder(cats) });
  };
  return (
    <form onSubmit={submit} className="flex max-w-md gap-2">
      <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Название категории" onKeyDown={e => e.key === "Escape" && setOpen(false)} />
      <Button>Создать</Button>
    </form>
  );
}
