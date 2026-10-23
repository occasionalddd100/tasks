import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as D from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUpIcon, CheckIcon, CrosshairIcon, HashIcon, SunIcon, XIcon } from "lucide-react";
import { add, getDb, useDb } from "@/lib/db";
import { nextFocus } from "@/lib/focus";
import { tagsOf, tagGroups, parseTag, targetCat } from "@/lib/tags";
import { ensurePersonal } from "@/lib/personal";
import { today } from "@/lib/tasks";
import { useBackClose } from "@/lib/back";
import { cn } from "@/lib/utils";

// One way to add a task, everywhere: type it, pick a tag (or write #тег); a tag is a category of «Личное».
// No tag: it waits in "Личное · Черновики". The ＋ in the phone bar and the N key open the same field in a sheet.
let open = false, preset = null; const subs = new Set();
const setOpen = (v, tag) => { open = v; if (v) preset = tag ?? null; subs.forEach(f => f()); };
export const openQuickAdd = tag => setOpen(true, typeof tag === "string" ? tag : null);

export async function addTask(raw, { tag, work, day } = {}) {
  const tags = tagsOf(getDb()), p = parseTag(raw, tags);
  const text = p.text; if (!text) return null;
  const tagId = p.tag?.id ?? tag ?? null;
  let cat = targetCat(tagId);
  if (!cat) { await ensurePersonal(); cat = targetCat(tagId); }
  if (!cat) return null;
  const top = Math.min(1, ...getDb().tasks.filter(x => x.cat === cat).map(x => x.order ?? 1));
  add("tasks", { text, cat, order: top - 1, done: false, ...(work ? { focus: nextFocus() } : {}), ...(day ? { due: today() } : {}) });
  return { text, tag: tags.find(t => t.id === tagId) || null };
}

export function Composer({ autoFocus, defaultTag = null, work: workDefault = false, onAdded, className }) {
  const db = useDb(), groups = tagGroups(db), tags = groups.flatMap(g => g.tags);
  const [text, setText] = useState("");
  const [tag, setTag] = useState(defaultTag);
  const [work, setWork] = useState(workDefault), [day, setDay] = useState(false);
  const ref = useRef(null);
  useEffect(() => { setTag(defaultTag); }, [defaultTag]);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, [autoFocus]);
  // a #word in the text picks the tag as you type
  const typed = parseTag(text, tags).tag;
  const cur = typed?.id ?? tag;
  const submit = async e => {
    e?.preventDefault();
    if (!text.trim()) return;
    const r = await addTask(text, { tag: cur, work, day });
    if (r) { onAdded?.(r); setText(""); ref.current?.focus(); }
  };
  const chip = (on, cls = "border-foreground bg-foreground text-background") =>
    cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors", on ? cls : "text-muted-foreground");
  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-end gap-2">
        <textarea ref={ref} rows={1} value={text} onChange={e => setText(e.target.value)} enterKeyHint="send"
          placeholder="Новая задача… #тег" aria-label="Новая задача"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
          className="field-sizing-content max-h-48 min-h-14 min-w-0 flex-1 resize-none rounded-2xl border bg-background px-4 py-3.5 text-lg leading-snug outline-none focus:ring-2 focus:ring-ring/40" />
        <button type="submit" disabled={!text.trim()} aria-label="Добавить"
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
          <ArrowUpIcon className="size-6" />
        </button>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
        <button type="button" onClick={() => setWork(w => !w)} aria-pressed={work} className={chip(work, "border-primary bg-primary text-primary-foreground")}><CrosshairIcon className="size-3.5" />В работу</button>
        <button type="button" onClick={() => setDay(d => !d)} aria-pressed={day} className={chip(day, "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400")}><SunIcon className="size-3.5" />Сегодня</button>
        <span className="mx-0.5 w-px shrink-0 bg-border" />
        {tags.map((t, i) => (
          <span key={t.id} className="contents">
          {groups.length > 1 && t.groupId !== tags[i - 1]?.groupId && <span className="flex shrink-0 items-center pl-1 text-[11px] text-muted-foreground/80">{t.group}</span>}
          <button type="button" onClick={() => setTag(cur === t.id ? null : t.id)} aria-pressed={cur === t.id} className={chip(cur === t.id)}>
            {t.color ? <span className="size-2 rounded-full" style={{ background: t.color }} /> : <HashIcon className="size-3" />}{t.name}
          </button>
          </span>
        ))}
      </div>
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
            <span className="shrink-0 text-xs opacity-70">{r.tag ? "→ " + r.tag.name : "→ черновики"}</span>
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
  const [last, setLast] = useState([]);
  useEffect(() => { setLast([]); }, [isOpen]);
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
          <Composer autoFocus={isOpen} defaultTag={preset} onAdded={r => setLast(l => [r, ...l].slice(0, 4))} />
          <Added list={last} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
