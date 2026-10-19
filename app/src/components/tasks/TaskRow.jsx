import { createContext, useContext, useRef, useState } from "react";
import {
  AlarmClockIcon, AlarmClockOffIcon, CalendarIcon, CalendarXIcon, ChevronRightIcon, ClockIcon, CornerDownRightIcon, EyeOffIcon, FileTextIcon, FlagIcon, FlameIcon,
  GripVerticalIcon, MoreHorizontalIcon, UserIcon, UserXIcon, PencilIcon, StickyNoteIcon, SunIcon, Trash2Icon,
} from "lucide-react";
import { getDb, update, updateMany, remove } from "@/lib/db";
import { today, dueLabel, stale } from "@/lib/tasks";
import { renderMd } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionsContext, ActionsDropdown } from "@/components/ui/actions";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { confirmAction } from "@/components/Confirm";
import InlineInput from "@/components/InlineInput";
import TaskNoteDialog from "@/components/tasks/TaskNoteDialog";
import Avatar from "@/components/Avatar";
import { personName } from "@/lib/people";

// people who can be assigned in the current project
export const People = createContext([]);

export const PRIO = {
  urgent: { label: "Срочно", icon: FlameIcon, cls: "text-red-500" },
  today: { label: "Сегодня", icon: SunIcon, cls: "text-amber-500" },
  later: { label: "Позже", icon: ClockIcon, cls: "text-blue-500" },
};

// all subtasks below a task, any depth
export function descendantsOf(id) {
  const { tasks } = getDb(), out = [id];
  for (let i = 0; i < out.length; i++) for (const t of tasks) if (t.parent === out[i] && !out.includes(t.id)) out.push(t.id);
  return out.slice(1);
}

// a done task (and its done subtasks) goes down into the "Выполненные" block right away
export function hideTask(t) {
  const { tasks } = getDb(), done = new Set(tasks.filter(x => x.done).map(x => x.id));
  updateMany("tasks", [t.id, ...descendantsOf(t.id).filter(id => done.has(id))].map(id => [id, { hidden: true }]));
}

export async function deleteTask(t) {
  const kids = descendantsOf(t.id);
  if (kids.length && !await confirmAction({ title: `Удалить «${t.text}»?`, description: `Вместе с ней удалятся подзадачи (${kids.length}).` })) return;
  remove("tasks", [...kids, t.id]);
}

export default function TaskRow({ t, grip, overlay, kids, onAddSub }) {
  const [editing, setEditing] = useState(null); // "text" | "note"
  const [noteOpen, setNoteOpen] = useState(false);
  const dateRef = useRef(null), timeRef = useRef(null);

  const toggle = v => update("tasks", t.id, v ? { done: true, doneOn: today(), doneBy: getDb().me } : { done: false, doneOn: "", doneBy: "", hidden: false });
  const canHide = t.done && !stale(t) && !overlay;
  const p = PRIO[t.prio];
  const late = t.due && !t.done && (t.due < today() || (t.due === today() && t.time && t.time < new Date().toTimeString().slice(0, 5)));
  const hasBody = !!t.body?.trim();
  const people = useContext(People);
  const who = t.assignee ? people.find(x => x.user_id === t.assignee) || { user_id: t.assignee, name: "", email: "участник" } : null;
  const assign = id => update("tasks", t.id, { assignee: id });
  const assignItems = [
    ...people.map(x => ({ label: personName(x) + (x.user_id === getDb().me ? " (я)" : ""), icon: ({ className }) => <Avatar person={x} className={cn("size-5 text-[10px]", className)} />,
      active: t.assignee === x.user_id, onSelect: () => assign(x.user_id) })),
    people.length > 0 && { sep: true },
    { label: "Без исполнителя", icon: UserXIcon, disabled: !t.assignee, onSelect: () => assign("") },
  ];
  const openPicker = ref => { const i = ref.current; if (!i) return; try { i.showPicker(); } catch { i.focus(); i.click(); } };
  const openDate = () => openPicker(dateRef), openTime = () => openPicker(timeRef);
  const when = t.due ? dueLabel(t.due) + (t.time ? " " + t.time : "") : "";

  const items = [
    canHide && { label: "Скрыть в выполненные", icon: EyeOffIcon, onSelect: () => hideTask(t) },
    { label: hasBody ? "Открыть заметку" : "Добавить заметку", icon: FileTextIcon, onSelect: () => setNoteOpen(true) },
    onAddSub && { label: "Добавить подзадачу", icon: CornerDownRightIcon, onSelect: onAddSub },
    { sep: true },
    { label: "Приоритет", icon: FlagIcon, sub: [
      ...Object.entries(PRIO).map(([k, v]) => ({ label: v.label, icon: v.icon, iconClass: v.cls, active: t.prio === k, onSelect: () => update("tasks", t.id, { prio: k }) })),
      { label: "Без приоритета", icon: FlagIcon, active: !t.prio, onSelect: () => update("tasks", t.id, { prio: "" }) },
    ] },
    { label: "Исполнитель", icon: UserIcon, sub: assignItems },
    { label: t.due ? "Изменить дату" : "Поставить дату", icon: CalendarIcon, onSelect: () => setTimeout(openDate, 50) },
    t.due && { label: t.time ? "Изменить время" : "Поставить время", icon: AlarmClockIcon, onSelect: () => setTimeout(openTime, 50) },
    t.time && { label: "Убрать время", icon: AlarmClockOffIcon, onSelect: () => update("tasks", t.id, { time: "" }) },
    t.due && { label: "Убрать дату", icon: CalendarXIcon, onSelect: () => update("tasks", t.id, { due: "", time: "" }) },
    { sep: true },
    { label: "Переименовать", icon: PencilIcon, onSelect: () => setTimeout(() => setEditing("text")) },
    { label: t.note ? "Изменить подпись" : "Добавить подпись", icon: StickyNoteIcon, onSelect: () => setTimeout(() => setEditing("note")) },
    { sep: true },
    { label: "Удалить", icon: Trash2Icon, variant: "destructive", onSelect: () => deleteTask(t) },
  ];

  const row = (
    <div className={cn("group/task relative flex items-start gap-1 rounded-md py-1.5 pr-1 transition-colors hover:bg-accent/50 data-[state=open]:bg-accent/70",
      p && "before:absolute before:top-2 before:bottom-2 before:-left-0.5 before:w-0.5 before:rounded-full",
      t.prio === "urgent" && "before:bg-red-500", t.prio === "today" && "before:bg-amber-500", t.prio === "later" && "before:bg-blue-500")}>
      {grip ? (
        <button {...grip} ref={grip.ref} aria-label={"Перетащить: " + t.text}
          className="mt-0.5 grid h-5 w-4 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 active:cursor-grabbing max-md:opacity-50">
          <GripVerticalIcon className="size-3.5" />
        </button>
      ) : <span className="w-4 shrink-0" />}
      {kids ? (
        <button type="button" onClick={kids.toggle} aria-expanded={!kids.collapsed} aria-label={kids.collapsed ? "Развернуть подзадачи" : "Свернуть подзадачи"}
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground">
          <ChevronRightIcon className={cn("size-3.5 transition-transform duration-200", !kids.collapsed && "rotate-90")} />
        </button>
      ) : <span className="w-5 shrink-0" />}
      <Checkbox className="mt-0.5" checked={!!t.done} onCheckedChange={v => toggle(!!v)} aria-label={t.text} disabled={overlay} />
      <div className="min-w-0 flex-1 pl-1.5">
        {editing === "text"
          ? <InlineInput value={t.text} className="h-7 w-full text-[15px]" onDone={v => { setEditing(null); if (v && v !== t.text) update("tasks", t.id, { text: v }); }} />
          : (
            <span className="inline">
              <span onClick={() => !overlay && setEditing("text")}
                className={cn("cursor-text text-[15px] leading-snug break-words transition-colors", t.done && "text-muted-foreground line-through")}>{t.text}</span>
              {hasBody && !overlay && (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <button type="button" onClick={() => setNoteOpen(true)} aria-label="Открыть заметку к задаче"
                      className="ml-1.5 inline-flex h-5 translate-y-[3px] items-center gap-1 rounded bg-primary/8 px-1.5 text-xs font-medium text-foreground/70 hover:bg-primary/15">
                      <FileTextIcon className="size-3" />заметка
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent className="max-h-80 overflow-y-auto">
                    <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(t.body) }} />
                  </HoverCardContent>
                </HoverCard>
              )}
              {kids?.collapsed && (
                <button type="button" onClick={kids.toggle}
                  className="ml-1.5 inline-flex h-5 translate-y-[3px] items-center rounded-full border px-1.5 text-xs text-muted-foreground tabular-nums hover:text-foreground">
                  {kids.done}/{kids.total}
                </button>
              )}
            </span>
          )}
        {editing === "note"
          ? <InlineInput value={t.note || ""} placeholder="Короткая подпись" className="mt-1 h-7 w-full text-[13px]" onDone={v => { setEditing(null); if (v !== null && v !== (t.note || "")) update("tasks", t.id, { note: v }); }} />
          : t.note && <span onClick={() => setEditing("note")} className="mt-0.5 block cursor-text text-[13px] text-muted-foreground">{t.note}</span>}
      </div>
      {!overlay && (
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={openDate} title={t.due ? "Срок: " + t.due + (t.time ? " " + t.time : "") : "Поставить дату"} aria-label={t.due ? "Срок " + when : "Поставить дату"}
            className={cn("relative grid h-6 min-w-6 place-items-center rounded px-1 text-xs text-muted-foreground hover:bg-background",
              !t.due && "opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 max-md:hidden", t.due && "bg-muted", late && "text-destructive")}>
            {t.due ? when : <CalendarIcon className="size-3.5" />}
            <input ref={dateRef} type="date" tabIndex={-1} value={t.due || ""} onChange={e => update("tasks", t.id, e.target.value ? { due: e.target.value } : { due: "", time: "" })}
              className="pointer-events-none absolute inset-0 opacity-0" aria-hidden />
            <input ref={timeRef} type="time" tabIndex={-1} value={t.time || ""} onChange={e => update("tasks", t.id, { time: e.target.value || "" })}
              className="pointer-events-none absolute inset-0 opacity-0" aria-hidden />
          </button>
          {canHide && (
            <button type="button" onClick={() => hideTask(t)} title="Скрыть в выполненные" aria-label={"Скрыть в выполненные: " + t.text}
              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground md:opacity-0 md:group-hover/task:opacity-100 md:focus-visible:opacity-100">
              <EyeOffIcon className="size-3.5" />
            </button>
          )}
          {who && (
            <ActionsDropdown align="end" items={assignItems} trigger={
              <button type="button" className="grid size-6 place-items-center rounded-full" aria-label={"Исполнитель: " + personName(who)}>
                <Avatar person={who} className="size-5 text-[10px]" />
              </button>
            } />
          )}
          {p && <span className={cn("grid size-6 place-items-center", p.cls)} title={p.label} aria-label={"Приоритет: " + p.label}><p.icon className="size-3.5" /></span>}
          <ActionsDropdown align="end" items={items} trigger={
            <button type="button" aria-label="Действия с задачей"
              className="grid size-6 place-items-center rounded text-muted-foreground opacity-60 hover:bg-background md:hidden">
              <MoreHorizontalIcon className="size-3.5" />
            </button>
          } />
        </div>
      )}
    </div>
  );
  if (overlay) return row;
  // the dialog sits outside the menu trigger so right-clicks inside the editor don't open the task menu
  return <>
    <ActionsContext items={items}>{row}</ActionsContext>
    {noteOpen && <TaskNoteDialog t={t} open={noteOpen} onOpenChange={setNoteOpen} />}
  </>;
}
