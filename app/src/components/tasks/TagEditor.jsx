import { useState, useSyncExternalStore } from "react";
import * as D from "@radix-ui/react-dialog";
import { FolderInputIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useDb, remove } from "@/lib/db";
import { PASTELS } from "@/lib/colors";
import { ensurePersonal } from "@/lib/personal";
import { tagGroups, renameTag, colorTag, moveTag, addTag, deleteTag, addGroup, renameGroup } from "@/lib/tags";
import { useBackClose } from "@/lib/back";
import { confirmAction } from "@/components/Confirm";
import { cn } from "@/lib/utils";

// Tags = the categories of «Личное», grouped by its tabs. Here they are named, coloured, moved and removed in one place.
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
          <D.Description className="px-4 text-sm text-muted-foreground">Это категории «Личного». У удалённого тега задачи уходят в «Без тега».</D.Description>
          {isOpen && <Editor />}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Editor() {
  const db = useDb();
  const groups = tagGroups(db);
  const count = id => db.tasks.filter(t => t.cat === id && !t.done && !t.parent).length;
  const [newGroup, setNewGroup] = useState("");
  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-4 pt-4 pb-5">
      {groups.map(g => (
        <section key={g.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Name value={g.name} onSave={v => renameGroup(g.id, v)} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase" label="Название группы" />
            {!g.tags.length && !db.cats.some(c => c.board === g.id) && groups.length > 1 &&
              <button type="button" onClick={() => remove("boards", g.id)} aria-label={"Удалить группу " + g.name} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"><Trash2Icon className="size-4" /></button>}
          </div>
          <ul className="flex flex-col">
            {g.tags.map(x => <TagLine key={x.id} x={x} n={count(x.id)} groups={groups} />)}
          </ul>
          <AddLine placeholder="Новый тег" onAdd={v => addTag(g.id, v)} />
        </section>
      ))}
      <form className="flex gap-2 border-t pt-4" onSubmit={async e => { e.preventDefault(); if (!newGroup.trim()) return; if (!groups.length) await ensurePersonal(); addGroup(newGroup); setNewGroup(""); }}>
        <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="Новая группа тегов" aria-label="Новая группа тегов"
          className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-[15px] outline-none focus:ring-2 focus:ring-ring/40" />
        <button type="submit" disabled={!newGroup.trim()} className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-30">Добавить</button>
      </form>
    </div>
  );
}

function TagLine({ x, n, groups }) {
  const [palette, setPalette] = useState(false);
  const del = async () => {
    if (n && !await confirmAction({ title: `Удалить тег «${x.name}»?`, description: `${n} задач${n === 1 ? "а" : n < 5 ? "и" : ""} останутся, просто без тега.` })) return;
    deleteTag(x.id);
  };
  return (
    <li className="flex flex-col">
      <div className="flex h-12 items-center gap-2">
        <button type="button" onClick={() => setPalette(p => !p)} aria-label="Цвет" aria-expanded={palette}
          className="grid size-9 shrink-0 place-items-center rounded-full active:bg-accent">
          <span className={cn("size-4 rounded-full", !x.color && "border-2 border-dashed border-muted-foreground/50")} style={x.color ? { background: x.color } : undefined} />
        </button>
        <Name value={x.name} onSave={v => renameTag(x.id, v)} className="text-[15px]" label="Название тега" />
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{n || ""}</span>
        {groups.length > 1 && (
          <label className="relative grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent" aria-label="Перенести в группу">
            <FolderInputIcon className="size-4" />
            <select value={x.groupId} onChange={e => moveTag(x.id, e.target.value)} className="absolute inset-0 opacity-0" aria-label="Перенести в группу">
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={del} aria-label={"Удалить тег " + x.name} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive active:bg-accent"><Trash2Icon className="size-4" /></button>
      </div>
      {palette && (
        <div className="mb-2 ml-11 flex flex-wrap gap-2">
          <button type="button" onClick={() => { colorTag(x.id, ""); setPalette(false); }} aria-label="Без цвета"
            className={cn("size-8 rounded-full border-2 border-dashed", !x.key && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} />
          {PASTELS.map(p => (
            <button key={p.k} type="button" onClick={() => { colorTag(x.id, p.k); setPalette(false); }} aria-label={p.name}
              className={cn("size-8 rounded-full", x.key === p.k && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: p.c }} />
          ))}
        </div>
      )}
    </li>
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
