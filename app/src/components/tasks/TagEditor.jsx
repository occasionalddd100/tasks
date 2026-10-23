import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as D from "@radix-ui/react-dialog";
import { PlusIcon, SmileIcon, Trash2Icon, XIcon } from "lucide-react";
import { useDb, getDb } from "@/lib/db";
import { PASTELS } from "@/lib/colors";
import { ensurePersonal } from "@/lib/personal";
import { tagsOf, tagGroups, renameTag, colorTag, emojiTag, addTag, deleteTag } from "@/lib/tags";
import { TagMark } from "@/components/tasks/TagMark";
import { useBackClose } from "@/lib/back";
import { confirmAction } from "@/components/Confirm";
import { cn } from "@/lib/utils";

// Tags = the categories of «Личное» (its tabs stay in the data but are not shown). Named, coloured and removed in one place.
let open = false; const subs = new Set();
const set = v => { open = v; subs.forEach(f => f()); };
export const openTagEditor = () => set(true);

export function TagEditorHost() {
  const isOpen = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => open);
  useBackClose(isOpen, () => set(false));
  return (
    <D.Root open={isOpen} onOpenChange={set}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content onOpenAutoFocus={e => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl data-[state=open]:animate-[sheet-up_220ms_cubic-bezier(.2,0,0,1)] md:inset-x-auto md:top-[8vh] md:bottom-auto md:left-1/2 md:max-h-[84vh] md:w-[32rem] md:-translate-x-1/2 md:rounded-2xl md:border md:pb-0 md:data-[state=open]:animate-[dialog-in_180ms_ease-out]">
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
          <div className="flex items-center gap-2 px-4 pt-2">
            <D.Title className="flex-1 text-lg font-semibold">Теги</D.Title>
            <D.Close className="grid size-8 place-items-center rounded-full text-muted-foreground active:bg-accent" aria-label="Закрыть"><XIcon className="size-5" /></D.Close>
          </div>
          <D.Description className="px-4 text-sm text-muted-foreground">Нажми на название, чтобы переименовать, на значок слева, чтобы выбрать эмодзи и цвет. У удалённого тега задачи уходят в «Без тега».</D.Description>
          {isOpen && <Editor />}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Editor() {
  const db = useDb();
  const tags = tagsOf(db);
  const count = id => db.tasks.filter(t => t.cat === id && !t.done && !t.parent).length;
  return (
    <div className="flex flex-col overflow-y-auto px-4 pt-3 pb-5">
      <ul className="flex flex-col">
        {tags.map(x => <TagLine key={x.id} x={x} n={count(x.id)} />)}
      </ul>
      <AddLine placeholder="Новый тег" onAdd={async v => { if (!tagGroups(getDb()).length) await ensurePersonal(); addTag(v); }} />
    </div>
  );
}

function TagLine({ x, n }) {
  const [palette, setPalette] = useState(false), [emoji, setEmoji] = useState(false);
  const del = async () => {
    if (n && !await confirmAction({ title: `Удалить тег «${x.name}»?`, description: `${n} задач${n === 1 ? "а" : n < 5 ? "и" : ""} останутся, просто без тега.` })) return;
    deleteTag(x.id);
  };
  return (
    <li className="flex flex-col">
      <div className="flex h-12 items-center gap-2">
        <button type="button" onClick={() => setPalette(p => !p)} aria-label="Эмодзи и цвет" aria-expanded={palette}
          className={cn("grid size-9 shrink-0 place-items-center rounded-full active:bg-accent", palette && "bg-accent")}>
          <TagMark t={x} size="lg" />
        </button>
        {/* an emoji typed at the start of the name moves into the tag's own emoji when the name is saved */}
        <Name value={x.name} onSave={v => { renameTag(x.id, v); if (x.emoji && !x.ownEmoji) emojiTag(x.id, x.emoji); }} className="text-[15px]" label="Название тега" />
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{n || ""}</span>
        <button type="button" onClick={del} aria-label={"Удалить тег " + x.name} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive active:bg-accent"><Trash2Icon className="size-4" /></button>
      </div>
      {palette && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 pl-11">
            {PASTELS.map(p => (
              <button key={p.k} type="button" onClick={() => colorTag(x.id, p.k)} aria-label={p.name}
                className={cn("size-7 rounded-full", x.key === p.k && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: p.c }} />
            ))}
            {x.emoji && <button type="button" onClick={() => { emojiTag(x.id, ""); if (x.raw !== x.name) renameTag(x.id, x.name); }} className="ml-auto h-7 rounded-full border px-2.5 text-xs text-muted-foreground">Без эмодзи</button>}
          </div>
          <button type="button" onClick={() => setEmoji(true)} className="ml-11 flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium active:bg-accent">
            <SmileIcon className="size-4" />{x.emoji ? "Сменить эмодзи" : "Выбрать эмодзи"}
          </button>
        </div>
      )}
      <EmojiSheet open={emoji} setOpen={setEmoji} name={x.name}
        onPick={e => { emojiTag(x.id, e); if (x.raw !== x.name) renameTag(x.id, x.name); setEmoji(false); setPalette(false); }} />
    </li>
  );
}

// the picker gets a sheet of its own: full width, search on top, room for the keyboard
function EmojiSheet({ open, setOpen, name, onPick }) {
  useBackClose(open, () => setOpen(false));
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <D.Content onOpenAutoFocus={e => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[min(75dvh,34rem)] flex-col rounded-t-2xl border-t bg-popover pb-[env(safe-area-inset-bottom)] shadow-2xl data-[state=open]:animate-[sheet-up_220ms_cubic-bezier(.2,0,0,1)] md:inset-x-auto md:top-[12vh] md:bottom-auto md:left-1/2 md:w-[26rem] md:-translate-x-1/2 md:rounded-2xl md:border">
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <D.Title className="flex-1 truncate text-base font-semibold">Эмодзи для «{name}»</D.Title>
            <D.Close className="grid size-8 place-items-center rounded-full text-muted-foreground active:bg-accent" aria-label="Закрыть"><XIcon className="size-5" /></D.Close>
          </div>
          <D.Description className="sr-only">Найди эмодзи поиском или выбери в категориях</D.Description>
          {open && <EmojiPick onPick={onPick} />}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// text that saves when you leave it or press Enter
function Name({ value, onSave, className, label }) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  if (was !== value) { setWas(value); setV(value); }
  const save = () => { if (v.trim() && v.trim() !== value) onSave(v); else setV(value); };
  return (
    <input value={v} onChange={e => setV(e.target.value)} onBlur={save} aria-label={label}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value); e.currentTarget.blur(); } }}
      className={cn("h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 outline-none focus:bg-muted/60", className)} />
  );
}

function AddLine({ placeholder, onAdd }) {
  const [v, setV] = useState("");
  return (
    <form className="flex h-11 items-center gap-2" onSubmit={e => { e.preventDefault(); if (v.trim()) { onAdd(v); setV(""); } }}>
      <span className="grid size-9 shrink-0 place-items-center text-muted-foreground"><PlusIcon className="size-4" /></span>
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} enterKeyHint="done"
        className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[15px] outline-none placeholder:text-muted-foreground/70 focus:bg-muted/60" />
    </form>
  );
}

// every emoji there is, with search and categories (loaded only when opened; the Russian names come with the app)
function EmojiPick({ onPick }) {
  const box = useRef(null), pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    let el = null, gone = false;
    Promise.all([import("emoji-picker-element"), import("emoji-picker-element/i18n/ru_RU.js"), import("emoji-picker-element-data/ru/cldr/data.json?url")]).then(([m, i18n, url]) => {
      if (gone || !box.current) return;
      el = new m.Picker({ locale: "ru", dataSource: url.default, i18n: i18n.default });
      el.classList.add(document.documentElement.classList.contains("dark") ? "dark" : "light");
      el.addEventListener("emoji-click", e => pick.current(e.detail.unicode));
      box.current.append(el);
    });
    return () => { gone = true; el?.remove(); };
  }, []);
  return <div ref={box} className="emoji-box min-h-0 flex-1" />;
}
