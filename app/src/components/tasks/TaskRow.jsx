import { useEffect, useRef, useState } from "react";
import { CalendarIcon, ClockIcon, FlagIcon, FlameIcon, GripVerticalIcon, StickyNoteIcon, SunIcon, XIcon } from "lucide-react";
import { getDb, update, remove } from "@/lib/db";
import { today, dueLabel } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import InlineInput from "@/components/InlineInput";

export const PRIO = {
  urgent: { label: "Срочно", Icon: FlameIcon, cls: "text-red-500" },
  today: { label: "Сегодня", Icon: SunIcon, cls: "text-amber-500" },
  later: { label: "Позже", Icon: ClockIcon, cls: "text-blue-500" },
};

export default function TaskRow({ t, grip, overlay }) {
  const [editing, setEditing] = useState(null); // "text" | "note"
  const [armed, setArmed] = useState(false);
  const dateRef = useRef(null);
  useEffect(() => { if (armed) { const x = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(x); } }, [armed]);

  const toggle = v => update("tasks", t.id, v ? { done: true, doneOn: today(), doneBy: getDb().me } : { done: false, doneOn: "", doneBy: "" });
  const p = PRIO[t.prio];
  const late = t.due && t.due < today() && !t.done;
  const openDate = () => { const i = dateRef.current; if (!i) return; try { i.showPicker(); } catch { i.focus(); i.click(); } };

  return (
    <div className={cn("group/task relative flex items-start gap-1.5 rounded-md py-1.5 pr-1 hover:bg-accent/50", p && "before:absolute before:top-2 before:bottom-2 before:-left-0.5 before:w-0.5 before:rounded-full",
      t.prio === "urgent" && "before:bg-red-500", t.prio === "today" && "before:bg-amber-500", t.prio === "later" && "before:bg-blue-500")}>
      {grip ? (
        <button {...grip} ref={grip.ref} aria-label={"Перетащить: " + t.text}
          className="mt-0.5 grid h-5 w-4 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 active:cursor-grabbing max-md:opacity-50">
          <GripVerticalIcon className="size-3.5" />
        </button>
      ) : <span className="w-4 shrink-0" />}
      <Checkbox className="mt-0.5" checked={!!t.done} onCheckedChange={v => toggle(!!v)} aria-label={t.text} disabled={overlay} />
      <div className="min-w-0 flex-1 pl-1">
        {editing === "text"
          ? <InlineInput value={t.text} className="h-7 w-full text-[15px]" onDone={v => { setEditing(null); if (v && v !== t.text) update("tasks", t.id, { text: v }); }} />
          : <span onClick={() => !overlay && setEditing("text")} className={cn("block cursor-text text-[15px] leading-snug break-words", t.done && "text-muted-foreground line-through")}>{t.text}</span>}
        {editing === "note"
          ? <InlineInput value={t.note || ""} placeholder="Заметка к задаче" className="mt-1 h-7 w-full text-[13px]" onDone={v => { setEditing(null); if (v !== null && v !== (t.note || "")) update("tasks", t.id, { note: v }); }} />
          : t.note && <span onClick={() => setEditing("note")} className="mt-0.5 block cursor-text text-[13px] text-muted-foreground">{t.note}</span>}
      </div>
      {!overlay && (
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={openDate} title={t.due ? "Дата: " + t.due : "Поставить дату"} aria-label={t.due ? "Дата " + dueLabel(t.due) : "Поставить дату"}
            className={cn("relative grid h-6 min-w-6 place-items-center rounded px-1 text-xs text-muted-foreground hover:bg-background",
              !t.due && "opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 max-md:opacity-50", t.due && "bg-muted", late && "text-destructive")}>
            {t.due ? dueLabel(t.due) : <CalendarIcon className="size-3.5" />}
            <input ref={dateRef} type="date" tabIndex={-1} value={t.due || ""} onChange={e => update("tasks", t.id, { due: e.target.value || "" })}
              className="pointer-events-none absolute inset-0 opacity-0" aria-hidden />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={"Приоритет: " + (p?.label || "нет")} title={p?.label || "Приоритет"}
                className={cn("grid size-6 place-items-center rounded hover:bg-background", p ? p.cls : "text-muted-foreground opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-50")}>
                {p ? <p.Icon className="size-3.5" /> : <FlagIcon className="size-3.5" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(PRIO).map(([k, v]) => (
                <DropdownMenuItem key={k} onSelect={() => update("tasks", t.id, { prio: k })} className={cn(t.prio === k && "font-semibold")}>
                  <v.Icon className={v.cls} />{v.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => update("tasks", t.id, { prio: "" })}><FlagIcon />Без приоритета</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => setEditing("note"))}><StickyNoteIcon />{t.note ? "Изменить заметку" : "Добавить заметку"}</DropdownMenuItem>
              {t.due && <DropdownMenuItem onSelect={() => update("tasks", t.id, { due: "" })}><CalendarIcon />Убрать дату</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" onClick={() => armed ? remove("tasks", t.id) : setArmed(true)} aria-label="Удалить задачу"
            className={cn("grid h-6 min-w-6 place-items-center rounded px-1 text-xs text-muted-foreground hover:bg-background opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 max-md:opacity-50",
              armed && "text-destructive opacity-100")}>
            {armed ? "удалить?" : <XIcon className="size-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
