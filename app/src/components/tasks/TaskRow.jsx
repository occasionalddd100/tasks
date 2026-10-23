import { toast } from "sonner";
import { createContext, useContext, useRef, useState, useSyncExternalStore } from "react";
import {
  AlarmClockIcon, AlarmClockOffIcon, CalendarIcon, CrosshairIcon, CalendarXIcon, ChevronRightIcon, CornerDownRightIcon, EyeOffIcon, FileTextIcon, FlameIcon,
  GripVerticalIcon, FolderInputIcon, UserIcon, UserXIcon, PencilIcon, Trash2Icon, CheckIcon, CopyIcon,
} from "lucide-react";
import { getDb, update, updateMany, remove } from "@/lib/db";
import { today, dueLabel, stale } from "@/lib/tasks";
import { inFocus, toFocus, fromFocus } from "@/lib/focus";
import { renderMd } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionsContext, ActionsDropdown } from "@/components/ui/actions";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { confirmAction } from "@/components/Confirm";
import InlineInput from "@/components/InlineInput";
import TaskNoteDialog from "@/components/tasks/TaskNoteDialog";
import TaskSheet from "@/components/tasks/TaskSheet";
import Avatar from "@/components/Avatar";
import { personName } from "@/lib/people";

// people who can be assigned in the current project
export const People = createContext([]);

// on the phone a task opens one sheet (TaskSheet) instead of menus; a swipe marks it done or puts it in focus
const PHONE = "(max-width: 767px)";
const usePhone = () => useSyncExternalStore(f => { const m = matchMedia(PHONE); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, () => matchMedia(PHONE).matches);
const SWIPE = 80;

// a horizontal drag on the row: right past SWIPE = done, left = focus. Vertical moves stay page scrolls.
function useSwipe(onRight, onLeft) {
  const [dx, setDx] = useState(0);
  const g = useRef(null);
  const onTouchStart = e => { const p = e.touches[0]; g.current = { x: p.clientX, y: p.clientY, on: false, off: false }; };
  const onTouchMove = e => {
    const s = g.current; if (!s || s.off) return;
    const p = e.touches[0], x = p.clientX - s.x, y = p.clientY - s.y;
    if (!s.on) { if (Math.abs(y) > 10) { s.off = true; return; } if (Math.abs(x) < 12) return; s.on = true; }
    setDx(Math.max(-140, Math.min(140, x)));
  };
  const onTouchEnd = () => {
    const s = g.current; g.current = null;
    if (s?.on) { if (dx > SWIPE) onRight(); else if (dx < -SWIPE) onLeft(); }
    setDx(0);
  };
  return { dx, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: () => { g.current = null; setDx(0); } }, swiping: () => !!g.current?.on };
}

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

// "Перенести" → project → "Вкладка · Категория"; subtasks follow
function moveItem(t) {
  const db = getDb(), here = db.projects.find(p => p.id === db.boards.find(b => b.id === db.cats.find(c => c.id === t.cat)?.board)?.project);
  const catsOf = p => db.boards.filter(b => b.project === p.id).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .flatMap(b => db.cats.filter(c => c.board === b.id).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).map(c => ({
      label: b.name + " · " + c.name, active: c.id === t.cat,
      onSelect: () => c.id !== t.cat && updateMany("tasks", [t.id, ...descendantsOf(t.id)].map(id => [id, { cat: c.id }])),
    })));
  const sub = [here, ...db.projects.filter(p => p !== here)].filter(Boolean)
    .map(p => ({ label: p.name || "Без названия", icon: FolderInputIcon, sub: catsOf(p) })).filter(x => x.sub.length);
  return sub.length ? { label: "Перенести", icon: FolderInputIcon, sub } : null;
}

export async function deleteTask(t) {
  const kids = descendantsOf(t.id);
  if (kids.length && !await confirmAction({ title: `Удалить «${t.text}»?`, description: `Вместе с ней удалятся подзадачи (${kids.length}).` })) return;
  remove("tasks", [...kids, t.id]);
}

// rows in narrow places (kanban cards) put the date and marks under the text, as on the phone
export const Stacked = createContext(false);

export default function TaskRow({ t, grip, overlay, kids, onAddSub, sub, noFocusMark }) {
  const [editing, setEditing] = useState(null); // "text" | "note"
  const [noteOpen, setNoteOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const phone = usePhone(), stack = phone || useContext(Stacked);
  const dateRef = useRef(null), timeRef = useRef(null);

  const toggle = v => update("tasks", t.id, v ? { done: true, doneOn: today(), doneBy: getDb().me } : { done: false, doneOn: "", doneBy: "", hidden: false });
  const canHide = t.done && !stale(t) && !overlay;
  const urgent = t.prio === "urgent" && !t.done;
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

  const focused = inFocus(t);
  const items = [
    { label: "Открыть", icon: PencilIcon, hint: "двойной клик", onSelect: () => setTimeout(() => setSheet(true)) },
    !t.done && { label: focused ? "Убрать из фокуса" : "В фокус", icon: CrosshairIcon, onSelect: () => (focused ? fromFocus(t) : toFocus(t)) },
    canHide && { label: "Скрыть в выполненные", icon: EyeOffIcon, onSelect: () => hideTask(t) },
    { label: hasBody ? "Открыть заметку" : "Добавить заметку", icon: FileTextIcon, onSelect: () => setNoteOpen(true) },
    onAddSub && { label: "Добавить подзадачу", icon: CornerDownRightIcon, onSelect: onAddSub },
    { sep: true },
    !t.done && { label: t.prio === "urgent" ? "Снять «Срочно»" : "Срочно", icon: FlameIcon, iconClass: "text-red-500", onSelect: () => update("tasks", t.id, { prio: t.prio === "urgent" ? "" : "urgent" }) },
    !t.parent && moveItem(t),
    { label: "Исполнитель", icon: UserIcon, sub: assignItems },
    { label: t.due ? "Изменить дату" : "Поставить дату", icon: CalendarIcon, onSelect: () => setTimeout(openDate, 50) },
    t.due && { label: t.time ? "Изменить время" : "Поставить время", icon: AlarmClockIcon, onSelect: () => setTimeout(openTime, 50) },
    t.time && { label: "Убрать время", icon: AlarmClockOffIcon, onSelect: () => update("tasks", t.id, { time: "" }) },
    t.due && { label: "Убрать дату", icon: CalendarXIcon, onSelect: () => update("tasks", t.id, { due: "", time: "" }) },
    { sep: true },
    { label: "Переименовать", icon: PencilIcon, onSelect: () => setTimeout(() => setEditing("text")) },
    { label: "Копировать текст", icon: CopyIcon, onSelect: () => navigator.clipboard?.writeText(t.text).then(() => toast("Текст скопирован")) },
    { sep: true },
    { label: "Удалить", icon: Trash2Icon, variant: "destructive", onSelect: () => deleteTask(t) },
  ];

  // date and marks: right of the text on a wide screen, a line under it on the phone so the text keeps the width
  const meta = !overlay && (
        <div className={cn("flex shrink-0 items-center", stack && "-ml-1 mt-0.5 min-w-0 flex-wrap gap-x-1")}>
          <button type="button" onClick={phone ? () => setSheet(true) : openDate} title={t.due ? "Срок: " + t.due + (t.time ? " " + t.time : "") : "Поставить дату"} aria-label={t.due ? "Срок " + when : "Поставить дату"}
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
          {focused && !t.done && !noFocusMark && <span className="grid size-6 place-items-center text-primary" title="В фокусе" aria-label="В фокусе"><CrosshairIcon className="size-3.5" /></span>}
          {urgent && <span className="grid size-6 place-items-center text-red-500" title="Срочно" aria-label="Срочно"><FlameIcon className="size-3.5" /></span>}
          {stack && sub && <span className="min-w-0 truncate pl-1 text-xs text-muted-foreground/70">{sub}</span>}
        </div>
  );
  const swipe = useSwipe(() => toggle(!t.done), () => !t.done && (focused ? fromFocus(t) : toFocus(t)));
  const tapOpen = phone && !overlay;
  const row = (
    <div {...(tapOpen ? swipe.handlers : {})}
      onClick={tapOpen ? e => { if (!e.target.closest("button,[role=checkbox],input,label,a")) setSheet(true); } : undefined}
      style={swipe.dx ? { transform: `translateX(${swipe.dx}px)` } : undefined}
      className={cn("group/task relative flex items-start gap-1 rounded-md py-1.5 pr-1 md:py-1 transition-colors hover:bg-accent/50 data-[state=open]:bg-accent/70",
        swipe.dx ? "bg-background" : "transition-transform", tapOpen && "touch-pan-y",
        urgent && "before:absolute before:top-2 before:bottom-2 before:-left-0.5 before:w-0.5 before:rounded-full before:bg-red-500")}>
      {grip ? (
        <button {...grip} ref={grip.ref} aria-label={"Перетащить: " + t.text}
          className="mt-0.5 grid h-5 w-4 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 active:cursor-grabbing max-md:opacity-50">
          <GripVerticalIcon className="size-3.5" />
        </button>
      ) : null /* lists outside a board (journal, drafts) have no grip, so no gap for one */}
      {kids ? (
        <button type="button" onClick={kids.toggle} aria-expanded={!kids.collapsed} aria-label={kids.collapsed ? "Развернуть подзадачи" : "Свернуть подзадачи"}
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground">
          <ChevronRightIcon className={cn("size-3.5 transition-transform duration-200", !kids.collapsed && "rotate-90")} />
        </button>
      ) : kids === null && !t.parent && !stack && <span className="w-5 shrink-0" />}
      <Checkbox className="mt-0.5" checked={!!t.done} onCheckedChange={v => toggle(!!v)} aria-label={t.text} disabled={overlay} />
      <div className="min-w-0 flex-1 pl-1.5">
        {editing === "text"
          ? <InlineInput value={t.text} className="h-7 w-full text-[15px]" onDone={v => { setEditing(null); if (v && v !== t.text) update("tasks", t.id, { text: v }); }} />
          : (
            <span className="inline">
              <span onClick={() => !overlay && !phone && setEditing("text")} onDoubleClick={() => !overlay && !phone && (setEditing(null), setSheet(true))}
                className={cn(!phone && "cursor-text", "text-[15px] leading-snug break-words transition-colors", t.done && "text-muted-foreground line-through")}>{t.text}</span>
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
        {t.note && <span className="mt-0.5 block text-[13px] text-muted-foreground">{t.note}</span>}
        {stack && (t.due || canHide || who || (focused && !t.done && !noFocusMark) || urgent || sub) && meta}
        {!stack && sub && <div className="truncate text-xs text-muted-foreground/70">{sub}</div>}
      </div>
      {!stack && meta}
    </div>
  );
  if (overlay) return row;
  // what a swipe will do shows under the row as it slides
  const under = swipe.dx !== 0 && (
    <div className={cn("pointer-events-none absolute inset-0 flex items-center rounded-md px-4 text-sm font-medium text-white",
      swipe.dx > 0 ? "justify-start bg-emerald-500" : "justify-end bg-primary", Math.abs(swipe.dx) < SWIPE && "opacity-60")}>
      {swipe.dx > 0
        ? <span className="flex items-center gap-1.5"><CheckIcon className="size-4" />{t.done ? "Вернуть" : "Готово"}</span>
        : !t.done && <span className="flex items-center gap-1.5"><CrosshairIcon className="size-4" />{focused ? "Из фокуса" : "В фокус"}</span>}
    </div>
  );
  // the dialog sits outside the menu trigger so right-clicks inside the editor don't open the task menu
  return <>
    {phone ? <div className="relative">{under}{row}</div> : <ActionsContext items={items}>{row}</ActionsContext>}
    {noteOpen && <TaskNoteDialog t={t} open={noteOpen} onOpenChange={setNoteOpen} />}
    {!overlay && <TaskSheet t={t} open={sheet} onOpenChange={setSheet} people={people} onNote={() => setNoteOpen(true)} onAddSub={onAddSub} />}
  </>;
}
