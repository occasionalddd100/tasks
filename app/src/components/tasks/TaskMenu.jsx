import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { WhenBody } from "@/components/ui/when-picker";
import { focus } from "@/lib/focusSession";
import { CalendarIcon, CheckIcon, CornerDownRightIcon, CrosshairIcon, ChevronRightIcon, FlameIcon, InboxIcon, PencilIcon, SquareCheckIcon, SunIcon, SunriseIcon, TagIcon, Trash2Icon, UndoIcon } from "lucide-react";
import { useDb, update } from "@/lib/db";
import { getSel, isSelected, toggleSel, clearSel, moveTasks } from "@/lib/select";
import { today, addDays } from "@/lib/tasks";
import { tagsOf, tagOfTask, setTag } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { openTask } from "@/components/tasks/TaskSheet";
import { deleteTask } from "@/components/tasks/TaskRow";

// Right click on a task (computer): a plain menu at the pointer. When the task is among the picked ones,
// the date, priority, tag and pail items act on all of them.
let st = null; const subs = new Set();
const emit = () => subs.forEach(f => f());
export const openTaskMenu = (t, x, y) => { st = { id: t.id, x, y }; emit(); };
const close = () => { st = null; emit(); };

export function TaskMenuHost() {
  const s = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => st);
  const db = useDb();
  const box = useRef(null);
  const [pos, setPos] = useState(null);
  const [sub, setSub] = useState(null);
  const t = s && db.tasks.find(x => x.id === s.id);
  useEffect(() => {
    if (!s) return;
    setSub(null);
    const key = e => e.key === "Escape" && close();
    addEventListener("keydown", key); addEventListener("resize", close); addEventListener("blur", close);
    return () => { removeEventListener("keydown", key); removeEventListener("resize", close); removeEventListener("blur", close); };
  }, [s]);
  // keep the menu on screen
  useLayoutEffect(() => {
    if (!s || !box.current) return setPos(null);
    const r = box.current.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(s.x, innerWidth - r.width - 8)), y: Math.max(8, Math.min(s.y, innerHeight - r.height - 8)) });
  }, [s]);
  if (!s || !t) return null;

  const ids = isSelected(t.id) && getSel().size > 1 ? [...getSel()] : [t.id];
  const many = ids.length > 1, tasks = db.tasks.filter(x => ids.includes(x.id));
  const now = today(), tmr = addDays(1), urgent = t.prio === "urgent";
  const cur = tagOfTask(db, t)?.id;
  const run = f => () => { f(); close(); if (many) clearSel(); };
  const items = [
    !many && { l: "Открыть", i: PencilIcon, k: "Enter", run: () => { close(); openTask(t.id); } },
    t.done ? { l: "Вернуть в работу", i: UndoIcon, run: run(() => tasks.forEach(x => update("tasks", x.id, { done: false, doneOn: "", doneAt: "", doneBy: "", hidden: false }))) }
      : { l: many ? `Готово (${ids.length})` : "Готово", i: CheckIcon, run: run(() => moveTasks(ids, "done")) },
    !t.done && { l: many ? `Фокус (${ids.length})` : "Фокус", i: CrosshairIcon, k: "F", run: run(() => focus.start(ids)) },
    !many && !t.done && !t.parent && { l: "Добавить подзадачу", i: CornerDownRightIcon, run: () => { close(); dispatchEvent(new CustomEvent("tui-addsub", { detail: t.id })); } },
    "-",
    !t.done && { l: "На сегодня", i: SunIcon, on: t.due === now, run: run(() => moveTasks(ids, "today")) },
    !t.done && { l: "На завтра", i: SunriseIcon, on: t.due === tmr, run: run(() => moveTasks(ids, "tomorrow")) },
    !t.done && { l: "Дата…", i: CalendarIcon, date: true },
    !t.done && { l: "Без срока", i: InboxIcon, on: !t.due, run: run(() => moveTasks(ids, "free")) },
    !t.done && { l: urgent ? "Убрать приоритет" : "Приоритет", i: FlameIcon, on: urgent, run: run(() => tasks.forEach(x => update("tasks", x.id, { prio: urgent ? "" : "urgent" }))) },
    { l: "Тег", i: TagIcon, tags: true },
    "-",
    { l: isSelected(t.id) ? "Снять выбор" : "Выбрать", i: SquareCheckIcon, k: "Shift+клик", run: () => { toggleSel(t.id); close(); } },
    !many && { l: "Удалить", i: Trash2Icon, bad: true, run: () => { close(); deleteTask(t); } },
  ].filter(Boolean);
  const side = pos && pos.x + 240 + 220 > innerWidth ? "right-full mr-1" : "left-full ml-1";
  const row = "flex h-8 w-full items-center gap-2.5 rounded px-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent";

  return (
    <div className="fixed inset-0 z-[70]" onPointerDown={e => e.target === e.currentTarget && close()} onContextMenu={e => { e.preventDefault(); close(); }}>
      <div ref={box} role="menu" className="absolute w-64 lg:w-72 rounded-md border bg-popover p-1 text-popover-foreground shadow-xl animate-[menu-in_100ms_ease-out]"
        style={{ left: pos?.x ?? s.x, top: pos?.y ?? s.y, visibility: pos ? "visible" : "hidden" }}>
        <p className="truncate px-2 pt-1 pb-1.5 font-mono text-xs text-muted-foreground">{many ? `Выбрано: ${ids.length}` : t.text}</p>
        {items.map((it, n) => it === "-" ? <div key={n} className="-mx-1 my-1 h-px bg-border" /> : (
          <div key={it.l} className="relative" onMouseEnter={() => setSub(it.tags ? "tags" : it.date ? "date" : null)}>
            <button type="button" role="menuitem" onClick={it.run || (() => setSub(it.tags ? "tags" : "date"))}
              className={cn(row, it.bad && "text-destructive hover:bg-destructive/10", sub && (sub === "tags" ? it.tags : it.date) && "bg-accent")}>
              <it.i className="size-4 shrink-0 opacity-70" />
              <span className="flex-1">{it.l}</span>
              {it.on && <CheckIcon className="size-3.5 opacity-70" />}
              {it.k && <span className="font-mono text-[11px] text-muted-foreground">{it.k}</span>}
              {(it.tags || it.date) && <ChevronRightIcon className="size-3.5 opacity-60" />}
            </button>
            {it.tags && sub === "tags" && (
              <SubBox className={cn("max-h-80 w-52 overflow-y-auto p-1", side)}>
                {tagsOf(db).map(g => (
                  <button key={g.id} type="button" onClick={run(() => tasks.forEach(x => setTag(x, g.id)))} className={row}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: g.color || "currentColor" }} />
                    <span className="min-w-0 flex-1 truncate">{g.emoji ? g.emoji + " " : ""}{g.name}</span>
                    {g.id === cur && <CheckIcon className="size-3.5 opacity-70" />}
                  </button>
                ))}
              </SubBox>
            )}
            {it.date && sub === "date" && (
              <SubBox className={cn("p-3", side)}>
                <WhenBody due={t.due || ""} time={t.time || ""} onChange={w => { tasks.forEach(x => update("tasks", x.id, { due: w.due, time: w.time })); if (!w.time) { close(); if (many) clearSel(); } }} />
              </SubBox>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// a submenu that slides up when it would run off the bottom (or top) of the window
function SubBox({ className, children }) {
  const ref = useRef(null);
  const [dy, setDy] = useState(0);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const top = r.top - dy, over = top + r.height - (innerHeight - 8);
    setDy(over > 0 ? -Math.min(over, top - 8) : 0);
  }, []);
  return <div ref={ref} style={{ top: dy }} className={cn("absolute rounded-md border bg-popover text-popover-foreground shadow-xl", className)}>{children}</div>;
}
