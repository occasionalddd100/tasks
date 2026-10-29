import { useState, useSyncExternalStore } from "react";
import { FileTextIcon, LayoutGridIcon, ListChecksIcon, PinIcon, SearchIcon } from "lucide-react";
import { useDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ItemIcon } from "@/components/IconPicker";
import { itemName } from "@/components/notes/NotesTree";

// The left button of the phone bar: a shortcut to one note, stash or project of my choice.
// Unset, a tap asks what to put there; a long press changes it. Kept on this device ("notes:<id>").
const KEY = "navShortcut";
let cur = (() => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } })();
let picking = false; const subs = new Set();
const emit = () => subs.forEach(f => f());
const setCur = v => { cur = v; try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} emit(); };
export const pickShortcut = () => { picking = true; emit(); };
const use = () => useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => cur + "|" + picking);

const KINDS = { notes: "note", stashes: "stash", projects: "project" };
const FALLBACK = { note: FileTextIcon, stash: LayoutGridIcon, project: ListChecksIcon };

// the bar item: { label, icon, onClick, onHold, active }
export function useShortcut(view, go) {
  const db = useDb(); use();
  const [coll, id] = cur.split(":"), kind = KINDS[coll];
  const x = kind && db[coll]?.find(d => d.id === id);
  if (!x) return { k: "shortcut", label: "Своя кнопка", icon: PinIcon, onClick: pickShortcut, onHold: pickShortcut };
  const Icon = ({ className }) => <ItemIcon x={x} fallback={FALLBACK[kind]} className={cn(className, !x.color && !x.icon?.startsWith("e:") && "text-current")} />;
  return { k: "shortcut", label: itemName({ ...x, kind }), icon: Icon, onClick: () => go({ [kind]: id }), onHold: pickShortcut, active: view[kind] === id };
}

export function ShortcutPicker() {
  const db = useDb(); use();
  const [q, setQ] = useState("");
  const close = () => { picking = false; setQ(""); emit(); };
  const list = Object.entries(KINDS).flatMap(([coll, kind]) => (db[coll] || []).filter(x => !x.personal).map(x => ({ x, kind, coll, name: itemName({ ...x, kind }) })))
    .filter(it => !q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "ru")).slice(0, 80);
  return (
    <Dialog open={picking} onOpenChange={o => !o && close()}>
      <DialogContent onOpenAutoFocus={e => e.preventDefault()} aria-describedby={undefined}
        className="flex max-h-[80dvh] flex-col gap-2 p-4 sm:max-w-sm max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-2xl max-sm:pb-[calc(1rem+var(--sab))]">
        <DialogTitle className="text-base">Что открывать кнопкой слева</DialogTitle>
        <label className="flex h-9 items-center gap-2 rounded-lg border px-2.5">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Заметка, стэш или проект" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto">
          {list.map(({ x, kind, coll, name }) => (
            <li key={coll + x.id}>
              <button type="button" onClick={() => { setCur(coll + ":" + x.id); close(); }}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent", cur === coll + ":" + x.id && "bg-accent font-medium")}>
                <ItemIcon x={x} fallback={FALLBACK[kind]} /><span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="text-xs text-muted-foreground">{{ note: "заметка", stash: "стэш", project: "проект" }[kind]}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="px-2 py-3 text-sm text-muted-foreground">Ничего не нашлось</li>}
        </ul>
        {cur && <button type="button" onClick={() => { setCur(""); close(); }} className="self-start text-xs text-muted-foreground hover:text-foreground">Убрать кнопку</button>}
      </DialogContent>
    </Dialog>
  );
}
