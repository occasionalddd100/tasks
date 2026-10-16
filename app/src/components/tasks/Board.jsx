import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
  closestCenter, closestCorners, pointerWithin,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarIcon, ChevronDownIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useDb, add, update, updateMany, remove } from "@/lib/db";
import { byOrder, nextOrder, stale, inWeek } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/Confirm";
import TaskRow from "@/components/tasks/TaskRow";
import InlineInput from "@/components/InlineInput";

const T = "t:", C = "c:", D = "d:";
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
  const visible = useMemo(() => db.tasks.filter(t => catSet.has(t.cat) && !stale(t)), [db.tasks, catSet]);
  const week = useMemo(() => visible.filter(inWeek).sort((a, b) => a.due.localeCompare(b.due) || byOrder(a, b)), [visible]);
  const items = useMemo(() => {
    const m = Object.fromEntries(cats.map(c => [c.id, []]));
    for (const t of [...visible].sort(byOrder)) if (!inWeek(t)) m[t.cat].push(t.id);
    return m;
  }, [cats, visible]);
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
    });
    updateMany("tasks", changes);
  };
  const onDragCancel = () => { setDrag(null); setCatOrder(null); setActive(null); };

  const activeTask = active?.startsWith(T) ? taskById.get(raw(active)) : null;
  const activeCat = active?.startsWith(C) ? cats.find(c => c.id === raw(active)) : null;

  return (
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
      {!cats.length && <p className="text-sm text-muted-foreground">В этой вкладке пока нет категорий. Создай первую кнопкой ниже.</p>}
      <NewCat board={board} cats={cats} />
      <p className="text-xs text-muted-foreground">Тяни за ⋮⋮, чтобы переставить задачу или категорию. Нажми на текст задачи или название категории, чтобы изменить.</p>
    </div>
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
        {!folded && <ul className="px-2 pb-2">{tasks.map(t => <li key={t.id}><TaskRow t={t} /></li>)}</ul>}
        {folded && <div className="h-2" />}
      </section>
    </div>
  );
}

function CatCard({ cat, ids, taskById }) {
  const span = useSpan();
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: C + cat.id });
  const { setNodeRef: dropRef } = useDroppable({ id: D + cat.id });
  const [renaming, setRenaming] = useState(false);
  const [text, setText] = useState("");
  const tasks = ids.map(id => taskById.get(id)).filter(Boolean);

  const addTask = e => {
    e.preventDefault(); const t = text.trim(); if (!t) return; setText("");
    add("tasks", { text: t, cat: cat.id, order: nextOrder(tasks), done: false });
  };
  const del = async () => {
    const open = tasks.filter(t => !t.done);
    if (open.length && !await confirmAction({ title: `Удалить категорию «${cat.name}»?`, description: `Удалятся открытые задачи (${open.length}). Выполненные останутся в журнале.` })) return;
    if (open.length) await remove("tasks", open.map(t => t.id));
    remove("cats", cat.id);
  };

  return (
    <div ref={el => { span.current = el; setNodeRef(el); }} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "z-10 opacity-40")}>
      <section className="group/cat rounded-xl border bg-card shadow-xs">
        <header className="flex items-center gap-1 px-2 pt-2.5 pb-1">
          <button ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={"Перетащить категорию " + cat.name}
            className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing">
            <GripVerticalIcon className="size-4" />
          </button>
          <FoldBtn folded={cat.collapsed} onClick={() => update("cats", cat.id, { collapsed: !cat.collapsed })} />
          {renaming
            ? <InlineInput value={cat.name} onDone={name => { setRenaming(false); if (name && name !== cat.name) update("cats", cat.id, { name }); }} className="h-7 text-[15px] font-semibold" />
            : <h2 className="min-w-0 cursor-text truncate text-[15px] font-semibold" onClick={() => setRenaming(true)} title="Переименовать">{cat.name}</h2>}
          <span className="text-[13px] text-muted-foreground tabular-nums">{tasks.length ? `${tasks.filter(t => t.done).length} / ${tasks.length}` : ""}</span>
          <Button variant="ghost" size="iconSm" className="ml-auto text-muted-foreground opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 max-md:opacity-60"
            aria-label="Удалить категорию" title="Удалить категорию" onClick={del}><Trash2Icon className="size-3.5" /></Button>
        </header>
        {!cat.collapsed && (
          <>
            <SortableContext items={ids.map(id => T + id)} strategy={verticalListSortingStrategy}>
              <ul ref={dropRef} className="min-h-2 px-2">
                {tasks.map(t => <SortableTask key={t.id} t={t} />)}
              </ul>
            </SortableContext>
            <form onSubmit={addTask} className="px-3 pt-1 pb-3">
              <Input value={text} onChange={e => setText(e.target.value)} placeholder="+ задача" className="h-8 border-dashed bg-transparent shadow-none" aria-label={"Новая задача в " + cat.name} />
            </form>
          </>
        )}
        {cat.collapsed && <div className="h-1.5" />}
      </section>
    </div>
  );
}

function SortableTask({ t }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: T + t.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "opacity-30")}>
      <TaskRow t={t} grip={{ ref: setActivatorNodeRef, ...attributes, ...listeners }} />
    </li>
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
