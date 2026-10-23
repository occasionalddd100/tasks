import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CrosshairIcon, PlusIcon } from "lucide-react";
import { motion } from "motion/react";
import { useDb, updateMany } from "@/lib/db";
import { focusList, clearDone, nextFocus, placeOf, inFocus } from "@/lib/focus";
import { cn } from "@/lib/utils";
import { stale, byOrder } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VIEW } from "@/components/ViewHeader";
import TaskRow from "@/components/tasks/TaskRow";
import FocusPicker from "@/components/tasks/FocusPicker";
import { addDraft } from "@/lib/personal";


export default function FocusView({ go }) {
  const db = useDb();
  const list = focusList(db);
  const done = list.filter(t => t.done).length;
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
  // the old "Ближайшее" mark is gone: offer its open tasks to the focus once, by hand
  const legacy = db.tasks.filter(t => t.prio === "today" && !t.done && !t.hidden && !inFocus(t) && t.text?.trim());
  const takeLegacy = into => {
    let n = Math.max(0, ...db.tasks.filter(inFocus).map(x => x.focus));
    updateMany("tasks", legacy.map(t => [t.id, into ? { prio: "", focus: ++n } : { prio: "" }]));
  };

  return (
    <div className={VIEW}>
      <header className="flex items-center gap-2">
        <CrosshairIcon className="size-7 text-primary" />
        <h1 className="flex-1 text-2xl font-bold tracking-tight md:text-3xl">Фокус</h1>
        {done > 0 && <Button variant="ghost" size="sm" onClick={clearDone}>Убрать сделанные</Button>}
      </header>

      {legacy.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>Метки «Ближайшее» больше нет: теперь есть только фокус и дата. С этой меткой осталось задач: {legacy.length}. Например: {legacy.slice(0, 3).map(t => "«" + t.text + "»").join(", ")}.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => takeLegacy(true)}>Перенести в фокус</Button>
            <Button size="sm" variant="ghost" onClick={() => takeLegacy(false)}>Просто снять метку</Button>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] xl:items-start">
      <div className="flex flex-col gap-4 xl:sticky xl:top-4">
      <section className="m-flat rounded-xl border bg-card p-2 shadow-xs">
        {list.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Тут пусто. Напиши задачу ниже или возьми из предложки.
          </p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <ul>
              {list.map((t, i) => <FocusItem key={t.id} t={t} place={placeOf(db, t)} next={false} />)}
            </ul>
          </SortableContext>
        </DndContext>
        <AddRow />
      </section>
      </div>

      <div className="min-w-0 xl:rounded-2xl xl:border xl:bg-card/40 xl:p-4"><FocusPicker /></div>
      </div>
    </div>
  );
}

function FocusItem({ t, place, next }) {
  const db = useDb();
  const kids = db.tasks.filter(k => k.parent === t.id && !stale(k)).sort(byOrder);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("relative rounded-md", isDragging && "z-10 opacity-30", next && "bg-primary/8")}>
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <TaskRow t={t} noFocusMark sub={(next ? "▶ сейчас · " : "") + place} grip={{ ref: setActivatorNodeRef, ...attributes, ...listeners }} />
        {kids.length > 0 && <ul className="mb-1 ml-9 border-l pl-2" aria-label={"Подзадачи: " + t.text}>{kids.map(k => <li key={k.id}><TaskRow t={k} noFocusMark /></li>)}</ul>}
      </motion.div>
    </li>
  );
}

// a new task right into the focus; it lands in "Черновики", to be given a category later
function AddRow() {
  const [text, setText] = useState("");
  const submit = e => { e.preventDefault(); const v = text.trim(); if (!v) return; setText(""); addDraft(v, { focus: nextFocus() }); };
  return (
    <form onSubmit={submit} className="mt-1 flex items-center gap-2 border-t px-1 pt-2">
      <Input value={text} onChange={e => setText(e.target.value)} placeholder="Новая задача в фокус" enterKeyHint="done" className="h-12 flex-1 text-base" />
      <Button type="submit" size="icon" disabled={!text.trim()} aria-label="Добавить в фокус" className="size-12 shrink-0"><PlusIcon /></Button>
    </form>
  );
}
