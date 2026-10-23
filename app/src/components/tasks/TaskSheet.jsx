import { useEffect, useState, useSyncExternalStore } from "react";
import * as D from "@radix-ui/react-dialog";
import {
  AlarmClockIcon, CalendarIcon, CopyIcon, CornerDownRightIcon, CrosshairIcon, EyeOffIcon, FileTextIcon, FlameIcon, ColumnsIcon, PencilIcon, Trash2Icon, UserIcon, XIcon,
} from "lucide-react";
import { getDb, update, updateMany, useDb } from "@/lib/db";
import { today, addDays, dueLabel, byOrder } from "@/lib/tasks";
import { inFocus, toFocus, fromFocus } from "@/lib/focus";
import { useBackClose } from "@/lib/back";
import { renderMd } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { personName } from "@/lib/people";
import { descendantsOf, hideTask, deleteTask } from "@/components/tasks/TaskRow";
import TaskNoteDialog from "@/components/tasks/TaskNoteDialog";
import { toast } from "sonner";
import { tagGroups, isPersonal, setTag } from "@/lib/tags";
import { openTagEditor } from "@/components/tasks/TagEditor";
import { TagMark } from "@/components/tasks/TagMark";

// Everything about one task on the phone, in one place: tap a task, this slides up.
// Top: the two things that decide when it gets done ("Фокус" now, "Когда" by date), then the 🔥 flag; below, the rest.
export default function TaskSheet({ t, open, onOpenChange, people = [], onNote, onAddSub }) {
  useBackClose(open, () => onOpenChange(false));
  const db = useDb();
  const [text, setText] = useState(t.text);
  useEffect(() => { if (open) setText(t.text); }, [open, t.text]);
  if (!open) return null; // one per task row: nothing to work out until it opens
  const saveText = () => { const v = text.trim(); if (v && v !== t.text) update("tasks", t.id, { text: v }); else setText(t.text); };

  const set = f => update("tasks", t.id, f);
  const focused = inFocus(t), urgent = t.prio === "urgent";
  const done = v => set(v ? { done: true, doneOn: today(), doneBy: getDb().me } : { done: false, doneOn: "", doneBy: "", hidden: false });
  const day = d => set(t.due === d ? { due: "", time: "" } : { due: d });

  // a task of «Личное» gets a tag (one of its categories); a task on a shared board can only change its column
  const personal = isPersonal(db, t), groups = personal ? tagGroups(db).filter(g => g.tags.length) : [];
  const board = db.boards.find(b => b.id === db.cats.find(c => c.id === t.cat)?.board);
  const cols = personal || !board ? [] : db.boards.filter(b => b.project === board.project).sort(byOrder)
    .flatMap(b => db.cats.filter(c => c.board === b.id && !c.drafts).sort(byOrder).map(c => ({ id: c.id, board: b.name, name: c.name })));
  const multiBoard = new Set(cols.map(c => c.board)).size > 1;
  const move = cat => { if (cat && cat !== t.cat) updateMany("tasks", [t.id, ...descendantsOf(t.id)].map(id => [id, { cat }])); };
  const close = then => () => { onOpenChange(false); then && setTimeout(then, 220); };

  const chip = (on, cls) => cn("inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors active:scale-[.97]",
    on ? cls : "text-muted-foreground");
  const row = "flex h-12 w-full items-center gap-3 rounded-lg px-2 text-[15px] active:bg-accent [&_svg]:size-5 [&_svg]:text-muted-foreground";

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content onOpenAutoFocus={e => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl data-[state=open]:animate-[sheet-up_220ms_cubic-bezier(.2,0,0,1)] md:inset-x-auto md:top-[10vh] md:bottom-auto md:left-1/2 md:w-[30rem] md:-translate-x-1/2 md:rounded-2xl md:border md:pb-0 md:data-[state=open]:animate-[dialog-in_180ms_ease-out]">
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
          <D.Title className="sr-only">Задача</D.Title>
          <D.Description className="sr-only">Фокус, срок и действия с задачей</D.Description>
          <div className="overflow-y-auto px-4 pt-2 pb-4">
            <div className="flex items-start gap-3">
              <Checkbox className="mt-2.5 size-5" checked={!!t.done} onCheckedChange={v => done(!!v)} aria-label="Выполнено" />
              <textarea value={text} rows={1} onChange={e => setText(e.target.value)} onBlur={saveText} aria-label="Название задачи"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
                className={cn("field-sizing-content min-h-10 flex-1 resize-none bg-transparent py-1.5 text-lg leading-snug font-medium outline-none", t.done && "text-muted-foreground line-through")} />
              <D.Close className="mt-1.5 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent" aria-label="Закрыть"><XIcon className="size-5" /></D.Close>
            </div>

            {!t.done && <>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => (focused ? fromFocus(t) : toFocus(t))} className={chip(focused, "border-primary bg-primary text-primary-foreground")}>
                  <CrosshairIcon className="size-4" />{focused ? "В работе" : "В работу"}
                </button>
                {(urgent || !personal) && <button type="button" onClick={() => set({ prio: urgent ? "" : "urgent" })} aria-pressed={urgent} className={chip(urgent, "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400")}>
                  <FlameIcon className="size-4" />Срочно
                </button>}
              </div>

              <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Когда</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => day(today())} className={chip(t.due === today(), "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400")}>Сегодня</button>
                <button type="button" onClick={() => day(addDays(1))} className={chip(t.due === addDays(1), "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400")}>Завтра</button>
                {/* the native pickers sit on top of the chips, so one tap opens the phone's own calendar or clock */}
                <label className={cn(chip(t.due && t.due !== today() && t.due !== addDays(1), "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"), "relative")}>
                  <CalendarIcon className="size-4" />{t.due && t.due !== today() && t.due !== addDays(1) ? dueLabel(t.due) : "Дата"}
                  <input type="date" value={t.due || ""} onChange={e => set(e.target.value ? { due: e.target.value } : { due: "", time: "" })} className="absolute inset-0 opacity-0" aria-label="Дата" />
                </label>
                <label className={cn(chip(!!t.time, "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"), "relative")}>
                  <AlarmClockIcon className="size-4" />{t.time || "Время"}
                  <input type="time" value={t.time || ""} onChange={e => set(e.target.value ? { time: e.target.value, due: t.due || today() } : { time: "" })} className="absolute inset-0 opacity-0" aria-label="Время" />
                </label>
                {t.due && <button type="button" onClick={() => set({ due: "", time: "" })} className={chip(false)} aria-label="Убрать срок"><XIcon className="size-4" /></button>}
              </div>
            </>}

            {personal && !t.parent && <>
              <div className="mt-5 mb-2 flex items-center">
                <p className="flex-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Тег</p>
                <button type="button" onClick={close(openTagEditor)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><PencilIcon className="size-3.5" />Править</button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {groups.map(g => (
                  <div key={g.id} className="contents">
                    {g.tags.map(x => (
                      <button key={x.id} type="button" onClick={() => setTag(t, x.id === t.cat ? null : x.id)} aria-pressed={x.id === t.cat}
                        className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors active:scale-[.97]",
                          x.id === t.cat ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}>
                        <TagMark t={x} />{x.name}
                      </button>
                    ))}
                  </div>
                ))}
                {!groups.length && <button type="button" onClick={close(openTagEditor)} className="self-start text-sm text-primary">Создать первый тег</button>}
              </div>
            </>}

            <button type="button" onClick={close(onNote)} className="mt-5 block w-full rounded-lg border bg-muted/40 p-3 text-left active:bg-accent">
              {t.body?.trim()
                ? <div className="md line-clamp-4 text-sm" dangerouslySetInnerHTML={{ __html: renderMd(t.body) }} />
                : <span className="flex items-center gap-2 text-sm text-muted-foreground"><FileTextIcon className="size-4" />Добавить заметку</span>}
            </button>

            <div className="mt-3 flex flex-col">
              <button type="button" className={row} onClick={() => navigator.clipboard?.writeText(t.text + (t.body?.trim() ? "\n\n" + t.body.trim() : "")).then(() => toast("Текст скопирован"), () => toast("Не получилось скопировать"))}>
                <CopyIcon />Копировать текст
              </button>
              {onAddSub && !t.done && <button type="button" onClick={close(onAddSub)} className={row}><CornerDownRightIcon />Добавить подзадачу</button>}
              {!t.parent && cols.length > 1 && (
                <label className={cn(row, "relative")}><ColumnsIcon />Колонка
                  <span className="ml-auto max-w-[55%] truncate text-sm text-muted-foreground">{cols.find(c => c.id === t.cat)?.name}</span>
                  <select value={t.cat} onChange={e => move(e.target.value)} className="absolute inset-0 opacity-0" aria-label="Колонка">
                    {multiBoard
                      ? [...new Set(cols.map(c => c.board))].map(n => <optgroup key={n} label={n}>{cols.filter(c => c.board === n).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)
                      : cols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
              {people.length > 1 && (
                <label className={cn(row, "relative")}><UserIcon />Исполнитель
                  <span className="ml-auto truncate text-sm text-muted-foreground">{t.assignee ? personName(people.find(p => p.user_id === t.assignee) || {}) || "участник" : "нет"}</span>
                  <select value={t.assignee || ""} onChange={e => set({ assignee: e.target.value })} className="absolute inset-0 opacity-0" aria-label="Исполнитель">
                    <option value="">Без исполнителя</option>
                    {people.map(p => <option key={p.user_id} value={p.user_id}>{personName(p)}{p.user_id === db.me ? " (я)" : ""}</option>)}
                  </select>
                </label>
              )}
              {t.done && !t.hidden && <button type="button" onClick={close(() => hideTask(t))} className={row}><EyeOffIcon />Скрыть в выполненные</button>}
              <button type="button" onClick={close(() => deleteTask(t))} className={cn(row, "text-destructive [&_svg]:text-destructive")}><Trash2Icon />Удалить</button>
            </div>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// any task anywhere opens here by id: lists that aren't task rows (the day, the timeline, cards) use this
let openId = null; const subs = new Set();
export const openTask = id => { openId = id; subs.forEach(f => f()); };
export function TaskSheetHost() {
  const id = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => openId);
  const db = useDb(), t = id && db.tasks.find(x => x.id === id);
  const [note, setNote] = useState(false), [shut, setShut] = useState(false);
  useEffect(() => { setShut(false); }, [id]);
  if (!t) return null;
  // the sheet closes first and asks for the note a moment later, so wait before forgetting the task
  const closed = () => { setShut(true); setTimeout(() => setNote(n => { if (!n) openTask(null); return n; }), 260); };
  return <>
    <TaskSheet t={t} open={!note && !shut} onOpenChange={o => !o && closed()} onNote={() => setNote(true)} />
    {note && <TaskNoteDialog t={t} open onOpenChange={o => { if (!o) { setNote(false); openTask(null); } }} />}
  </>;
}
