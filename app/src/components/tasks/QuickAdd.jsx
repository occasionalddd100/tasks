import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as D from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";
import { AlarmClockIcon, ArrowUpIcon, CalendarIcon, CheckIcon, CrosshairIcon, HashIcon, SunIcon, XIcon } from "lucide-react";
import { add, getDb, useDb } from "@/lib/db";
import { nextFocus } from "@/lib/focus";
import { tagsOf, tagGroups, parseTag, targetCat } from "@/lib/tags";
import { ensurePersonal } from "@/lib/personal";
import { today, dueLabel } from "@/lib/tasks";
import { addDone } from "@/lib/done";
import { useBackClose } from "@/lib/back";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// One way to add a task, everywhere: type it, pick a tag (or write #тег); a tag is a category of «Личное».
// No tag: it waits in "Личное · Черновики". The ＋ in the phone bar and the N key open the same field in a sheet.
let open = false, preset = null, presetWork = false, ambient = null; const subs = new Set();
// the screen I'm on can say where ＋ should put things (the tag or «В работе» picked on the home screen)
export const setAmbient = a => { ambient = a; };
const setOpen = (v, tag) => { open = v; if (v) { preset = tag ?? ambient?.tag ?? null; presetWork = !tag && !!ambient?.work; } subs.forEach(f => f()); };
export const openQuickAdd = tag => setOpen(true, typeof tag === "string" ? tag : null);

export async function addTask(raw, { tag, work, day, due, time } = {}) {
  const tags = tagsOf(getDb()), p = parseTag(raw, tags);
  const text = p.text; if (!text) return null;
  const tagId = p.tag?.id ?? tag ?? null;
  let cat = targetCat(tagId);
  if (!cat) { await ensurePersonal(); cat = targetCat(tagId); }
  if (!cat) return null;
  const top = Math.min(1, ...getDb().tasks.filter(x => x.cat === cat).map(x => x.order ?? 1));
  const id = await add("tasks", { text, cat, order: top - 1, done: false, ...(work ? { focus: nextFocus() } : {}), ...(day ? { due: today() } : {}), ...(due ? { due } : {}), ...(time ? { time } : {}) });
  if (id) flash(id);
  return { id, text, tag: tags.find(t => t.id === tagId) || null };
}

// the task just added glows for a moment, so the home screen can show where it went
let fresh = null; const freshSubs = new Set();
function flash(id) { fresh = id; freshSubs.forEach(f => f()); setTimeout(() => { if (fresh === id) { fresh = null; freshSubs.forEach(f => f()); } }, 4000); }
export const useFresh = () => useSyncExternalStore(f => (freshSubs.add(f), () => freshSubs.delete(f)), () => fresh);

export function Composer({ autoFocus, defaultTag = null, work: workDefault = false, onAdded, className }) {
  const db = useDb(), all = tagsOf(db);
  // the tag I came from goes first, so I see where the task will land
  const tags = defaultTag ? [...all.filter(t => t.id === defaultTag), ...all.filter(t => t.id !== defaultTag)] : all;
  const [text, setText] = useState("");
  const [tag, setTag] = useState(defaultTag);
  const [work, setWork] = useState(workDefault), [due, setDue] = useState(""), [time, setTime] = useState(""), [did, setDid] = useState(false);
  const ref = useRef(null);
  useEffect(() => { setTag(defaultTag); }, [defaultTag]);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, [autoFocus]);
  // a #word in the text picks the tag as you type
  const typed = parseTag(text, tags).tag;
  const cur = typed?.id ?? tag;
  const submit = async e => {
    e?.preventDefault();
    if (!text.trim()) return;
    // "Уже сделал": no task, just a line on today's timeline
    const r = did ? (addDone(text), { text: text.trim(), did: true }) : await addTask(text, { tag: cur, work, due, time: due ? time : "" });
    if (r) { onAdded?.(r); setText(""); setDue(""); setTime(""); ref.current?.focus(); }
  };
  const chip = (on, cls = "border-foreground bg-foreground text-background") =>
    cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors", on ? cls : "text-muted-foreground");
  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-end gap-2">
        <textarea ref={ref} rows={1} value={text} onChange={e => setText(e.target.value)} enterKeyHint="send"
          placeholder={did ? "Что сделал?" : "Новая задача… #тег"} aria-label={did ? "Что сделал" : "Новая задача"}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
          className="field-sizing-content max-h-48 min-h-14 min-w-0 flex-1 resize-none rounded-2xl border bg-background px-4 py-3.5 text-lg leading-snug outline-none focus:ring-2 focus:ring-ring/40" />
        <button type="submit" disabled={!text.trim()} aria-label="Добавить"
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
          <ArrowUpIcon className="size-6" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setDid(d => !d)} aria-pressed={did} className={chip(did, "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}><CheckIcon className="size-3.5" />Уже сделал</button>
        {!did && <>
        <button type="button" onClick={() => setWork(w => !w)} aria-pressed={work} className={chip(work, "border-primary bg-primary text-primary-foreground")}><CrosshairIcon className="size-3.5" />В работу</button>
        <button type="button" onClick={() => setDue(d => (d === today() ? "" : today()))} aria-pressed={due === today()} className={chip(due === today(), "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400")}><SunIcon className="size-3.5" />Сегодня</button>
        {/* the phone's own calendar and clock sit on top of the chips */}
        <label className={cn(chip(due && due !== today(), "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"), "relative")}>
          <CalendarIcon className="size-3.5" />{due && due !== today() ? dueLabel(due) : "Дата"}
          <input type="date" value={due} onChange={e => { setDue(e.target.value); if (!e.target.value) setTime(""); }} className="absolute inset-0 opacity-0" aria-label="Дата" />
        </label>
        {due && <label className={cn(chip(!!time, "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"), "relative")}>
          <AlarmClockIcon className="size-3.5" />{time || "Время"}
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className="absolute inset-0 opacity-0" aria-label="Время" />
        </label>}
        </>}
      </div>
      {!did && tags.length > 0 && <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
        {tags.map(t => (
          <button key={t.id} type="button" onClick={() => setTag(cur === t.id ? null : t.id)} aria-pressed={cur === t.id} className={chip(cur === t.id)}>
            {t.color ? <span className="size-2 rounded-full" style={{ background: t.color }} /> : <HashIcon className="size-3" />}{t.name}
          </button>
        ))}
      </div>}
    </form>
  );
}

function Added({ list }) {
  return (
    <ul className="flex flex-col gap-1">
      <AnimatePresence initial={false}>
        {list.map((r, i) => (
          <motion.li key={list.length - i + r.text} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckIcon className="size-3.5 shrink-0 text-emerald-500" /><span className="truncate">{r.text}</span>
            <span className="shrink-0 text-xs opacity-70">{r.did ? "→ в таймлайн" : r.tag ? "→ " + r.tag.name : "→ без тега"}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

// the inline version
export function CaptureBar({ defaultTag = null }) {
  const [last, setLast] = useState([]);
  return (
    <div className="flex flex-col gap-2">
      <Composer defaultTag={defaultTag} onAdded={r => setLast(l => [r, ...l].slice(0, 3))} />
      <Added list={last} />
    </div>
  );
}

export function QuickAddHost() {
  const isOpen = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => open);
  useBackClose(isOpen, () => setOpen(false));
  return (
    <D.Root open={isOpen} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content onOpenAutoFocus={e => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-2xl border-t bg-background px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl data-[state=open]:animate-[sheet-up_220ms_cubic-bezier(.2,0,0,1)] md:inset-x-auto md:top-[14vh] md:bottom-auto md:left-1/2 md:w-[36rem] md:-translate-x-1/2 md:rounded-2xl md:border md:pb-4 md:data-[state=open]:animate-[dialog-in_180ms_ease-out]">
          <div className="mx-auto h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center gap-2">
            <D.Title className="flex-1 text-base font-semibold">Новая задача</D.Title>
            <D.Close className="grid size-8 place-items-center rounded-full text-muted-foreground active:bg-accent" aria-label="Закрыть"><XIcon className="size-5" /></D.Close>
          </div>
          <D.Description className="sr-only">Задача попадёт на доску выбранного тега, без тега — в черновики</D.Description>
          <Composer autoFocus={isOpen} defaultTag={preset} work={presetWork} onAdded={r => { setOpen(false); toast(r.did ? "Записал в таймлайн" : "Добавил" + (r.tag ? " в «" + r.tag.name + "»" : " без тега")); }} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
