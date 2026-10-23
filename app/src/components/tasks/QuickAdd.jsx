import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as D from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUpIcon, CheckIcon, CrosshairIcon, FlameIcon, InboxIcon, SunIcon, XIcon } from "lucide-react";
import { addDraft } from "@/lib/personal";
import { addDone } from "@/lib/done";
import { nextFocus } from "@/lib/focus";
import { today } from "@/lib/tasks";
import { useBackClose } from "@/lib/back";
import { cn } from "@/lib/utils";

// Throw a task into "Черновики" from anywhere: the ＋ in the phone bar opens this sheet,
// the journal has the same field inline. Enter adds and keeps the field open for the next one.
// two modes: "draft" (a task for later) and "done" (a line into today's "Что сделал")
let open = false, mode = "draft"; const subs = new Set();
const setOpen = (v, m) => { open = v; if (m) mode = m; subs.forEach(f => f()); };
export const openQuickAdd = (m = "draft") => setOpen(true, typeof m === "string" ? m : "draft");

const extraOf = ({ day, focus, urgent }) => ({
  ...(day ? { due: today() } : {}), ...(focus ? { focus: nextFocus() } : {}), ...(urgent ? { prio: "urgent" } : {}),
});

function Field({ autoFocus, onAdded, big, done }) {
  const [text, setText] = useState("");
  const [opts, setOpts] = useState({ day: false, focus: false, urgent: false });
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, [autoFocus]);
  const submit = e => {
    e?.preventDefault();
    const t = text.trim(); if (!t) return;
    if (done) addDone(t); else addDraft(t, extraOf(opts));
    onAdded?.(t); setText(""); ref.current?.focus();
  };
  const tog = (k, label, Icon, on) => (
    <button type="button" onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))} aria-pressed={opts[k]}
      className={cn("inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors", opts[k] ? on : "text-muted-foreground")}>
      <Icon className="size-3.5" />{label}
    </button>
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <textarea ref={ref} rows={1} value={text} onChange={e => setText(e.target.value)} placeholder={done ? "Что сделал? Например: сходил в зал" : "Кинуть в черновики…"} enterKeyHint="send" aria-label={done ? "Что сделал" : "Новая задача в черновики"}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
          className={cn("field-sizing-content max-h-40 min-w-0 flex-1 resize-none rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-ring/40", big ? "min-h-14 py-3.5 text-lg" : "min-h-10 py-2 text-[15px]")} />
        <button type="submit" disabled={!text.trim()} aria-label="Добавить"
          className={cn("grid shrink-0 place-items-center self-end rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-30", big ? "size-14" : "size-10")}>
          <ArrowUpIcon className="size-5" />
        </button>
      </div>
      {!done && <div className="flex flex-wrap gap-1.5">
        {tog("day", "Сегодня", SunIcon, "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400")}
        {tog("focus", "В фокус", CrosshairIcon, "border-primary bg-primary text-primary-foreground")}
        {tog("urgent", "Срочно", FlameIcon, "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400")}
      </div>}
    </form>
  );
}

// the inline version, for the journal
export function CaptureBar() {
  const [last, setLast] = useState([]);
  return (
    <div className="flex flex-col gap-2">
      <Field onAdded={t => setLast(l => [t, ...l].slice(0, 3))} />
      <Added list={last} />
    </div>
  );
}

function Added({ list }) {
  return (
    <ul className="flex flex-col gap-1">
      <AnimatePresence initial={false}>
        {list.map((t, i) => (
          <motion.li key={list.length - i + t} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckIcon className="size-3.5 shrink-0 text-emerald-500" /><span className="truncate">{t}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

export function QuickAddHost({ onOpenDrafts }) {
  const isOpen = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => open);
  const m = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => mode);
  const [last, setLast] = useState([]);
  useEffect(() => { setLast([]); }, [isOpen, m]);
  useBackClose(isOpen, () => setOpen(false));
  return (
    <D.Root open={isOpen} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content onOpenAutoFocus={e => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-2xl border-t bg-background px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl data-[state=open]:animate-[sheet-up_220ms_cubic-bezier(.2,0,0,1)] md:inset-x-auto md:top-[14vh] md:bottom-auto md:left-1/2 md:w-[34rem] md:-translate-x-1/2 md:rounded-2xl md:border md:pb-4 md:data-[state=open]:animate-[dialog-in_180ms_ease-out]">
          <div className="mx-auto h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center gap-2">
            <D.Title className="sr-only">{m === "done" ? "Что сделал" : "В черновики"}</D.Title>
            <div role="tablist" className="flex flex-1 gap-1 rounded-xl bg-muted p-1">
              {[["done", "Сделал", CheckIcon], ["draft", "Черновик", InboxIcon]].map(([k, label, Icon]) => (
                <button key={k} type="button" role="tab" aria-selected={m === k} onClick={() => setOpen(true, k)}
                  className={cn("relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors", m === k ? "text-foreground" : "text-muted-foreground")}>
                  {m === k && <motion.span layoutId="qa-mode" className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ type: "spring", bounce: 0.2, duration: 0.3 }} />}
                  <Icon className={cn("relative size-4", k === "done" && m === k && "text-good")} /><span className="relative">{label}</span>
                </button>
              ))}
            </div>
            {onOpenDrafts && m === "draft" && <button type="button" onClick={() => { setOpen(false); onOpenDrafts(); }} className="text-sm text-muted-foreground underline-offset-2 hover:underline">Разобрать</button>}
            <D.Close className="grid size-8 place-items-center rounded-full text-muted-foreground active:bg-accent" aria-label="Закрыть"><XIcon className="size-5" /></D.Close>
          </div>
          <D.Description className="sr-only">Задача попадёт в черновики проекта «Личное»</D.Description>
          <Field key={m} big done={m === "done"} autoFocus={isOpen} onAdded={t => setLast(l => [t, ...l].slice(0, 4))} />
          <Added list={last} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
