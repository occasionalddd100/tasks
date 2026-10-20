import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CrosshairIcon, FlagIcon, PlayIcon, PlusIcon, SquareCheckBigIcon } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useDb, add, updateMany } from "@/lib/db";
import { byOrder, nextOrder, today } from "@/lib/tasks";
import { focusList, getSprint, startSprint, finishSprint, clearDone, toFocus, nextFocus, placeOf, inFocus } from "@/lib/focus";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VIEW } from "@/components/ViewHeader";
import TaskRow from "@/components/tasks/TaskRow";

const DEST = "focus.dest";

export default function FocusView({ go }) {
  const db = useDb();
  const list = focusList(db), sprint = getSprint(db);
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
  const finish = () => {
    const r = finishSprint();
    toast.success(`Спринт закрыт: ${r.done} из ${r.total}` + (r.total - r.done ? `. Остальное ждёт следующего.` : ". Всё сделано!"));
  };
  // burning tasks outside the focus, to throw in with one tap when the list is short
  const burning = useMemo(() => db.tasks.filter(t => !t.done && !t.hidden && !inFocus(t) && t.text?.trim() &&
    ((t.due && t.due <= today()) || t.prio === "urgent")).slice(0, 6), [db.tasks]);

  return (
    <div className={VIEW}>
      <header className="flex items-center gap-2">
        <CrosshairIcon className="size-7 text-primary" />
        <h1 className="flex-1 text-2xl font-bold tracking-tight md:text-3xl">Фокус</h1>
        {done > 0 && !sprint && <Button variant="ghost" size="sm" onClick={clearDone}>Убрать сделанные</Button>}
      </header>

      <SprintBar sprint={sprint} done={done} total={list.length} onStart={startSprint} onFinish={finish} />

      <section className="rounded-xl border bg-card p-2 shadow-xs md:max-w-3xl">
        {list.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Тут пусто. Кидай задачи из проектов через ПКМ → «В фокус» или пиши новые ниже.
          </p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <ul>
              {list.map((t, i) => <FocusItem key={t.id} t={t} place={placeOf(db, t)} next={!t.done && list.findIndex(x => !x.done) === i && !!sprint} />)}
            </ul>
          </SortableContext>
        </DndContext>
        <AddRow db={db} />
      </section>

      {burning.length > 0 && list.filter(t => !t.done).length < 5 && (
        <section className="md:max-w-3xl">
          <h2 className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground"><FlagIcon className="size-3.5 text-red-500" />Горит, но не в фокусе</h2>
          <div className="flex flex-wrap gap-1.5">
            {burning.map(t => (
              <button key={t.id} type="button" onClick={() => toFocus(t)}
                className="flex max-w-full items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent">
                <PlusIcon className="size-3.5 shrink-0" /><span className="truncate">{t.text}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SprintBar({ sprint, done, total, onStart, onFinish }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const since = sprint && new Date(sprint.start);
  return (
    <section className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-xs md:max-w-3xl", sprint ? "border-primary/40 bg-primary/5" : "bg-card")}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {sprint ? `Спринт идёт · ${done} из ${total}` : total ? `${total - done} в фокусе. Готов?` : "Набросай задачи и жми старт"}
        </div>
        {sprint && (
          <>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: pct + "%" }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">с {since.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
          </>
        )}
      </div>
      {sprint
        ? <Button variant="outline" size="sm" onClick={onFinish}><SquareCheckBigIcon />Завершить</Button>
        : <Button size="sm" disabled={!total || done === total} onClick={onStart}><PlayIcon />Старт</Button>}
    </section>
  );
}

function FocusItem({ t, place, next }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("relative rounded-md", isDragging && "z-10 opacity-30", next && "bg-primary/8")}>
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <TaskRow t={t} grip={{ ref: setActivatorNodeRef, ...attributes, ...listeners }} />
        <div className="-mt-1 truncate pb-1 pl-[3.25rem] text-xs text-muted-foreground/70">{next ? "▶ сейчас · " : ""}{place}</div>
      </motion.div>
    </li>
  );
}

// new task right into the focus; it also needs a home category, remembered between visits
function AddRow({ db }) {
  const [text, setText] = useState("");
  const options = useMemo(() => {
    const out = [];
    for (const p of [...db.projects].sort(byOrder)) for (const b of db.boards.filter(x => x.project === p.id).sort(byOrder))
      for (const c of db.cats.filter(x => x.board === b.id).sort(byOrder)) out.push({ id: c.id, label: [p.name || "Без названия", b.name, c.name].filter(Boolean).join(" · ") });
    return out;
  }, [db.projects, db.boards, db.cats]);
  const [dest, setDest] = useState(() => { try { return localStorage.getItem(DEST) || ""; } catch { return ""; } });
  const cat = options.find(o => o.id === dest)?.id || options[0]?.id;
  const pick = v => { setDest(v); try { localStorage.setItem(DEST, v); } catch {} };
  const submit = e => {
    e.preventDefault(); const v = text.trim(); if (!v || !cat) return; setText("");
    add("tasks", { text: v, cat, order: nextOrder(db.tasks.filter(t => t.cat === cat && !t.parent)), done: false, focus: nextFocus() });
  };
  if (!options.length) return null;
  return (
    <form onSubmit={submit} className="mt-1 flex flex-col gap-1.5 border-t px-1 pt-2 sm:flex-row">
      <Input value={text} onChange={e => setText(e.target.value)} placeholder="+ задача в фокус" className="flex-1" />
      <select value={cat} onChange={e => pick(e.target.value)} title="Куда положить задачу"
        className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm text-muted-foreground sm:max-w-64">
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </form>
  );
}
