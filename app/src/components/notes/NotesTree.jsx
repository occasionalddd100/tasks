import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, MoreHorizontalIcon,
  PencilIcon, PlusIcon, Trash2Icon, UsersIcon, FolderInputIcon,
} from "lucide-react";
import { useDb, update, remove, isMine } from "@/lib/db";
import { tree, newNote, newFolder, deleteFolder, descendants } from "@/lib/notes";
import { cn } from "@/lib/utils";
import { confirmAction } from "@/components/Confirm";
import ShareDialog from "@/components/ShareDialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

const OPEN_KEY = "openFolders";
const loadOpen = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch { return new Set(); } };

export const noteTitle = n => n.title?.trim() || "Без названия";

export default function NotesTree({ view, go, query }) {
  const db = useDb();
  const [open, setOpen] = useState(loadOpen);
  const [renaming, setRenaming] = useState(null);
  const [sharing, setSharing] = useState(null);
  const t = useMemo(() => tree(db.folders, db.notes), [db.folders, db.notes]);

  useEffect(() => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch {} }, [open]);
  const toggle = (id, v) => setOpen(s => { const n = new Set(s); (v ?? !n.has(id)) ? n.add(id) : n.delete(id); return n; });

  const createNote = async folder => {
    if (folder) toggle(folder, true);
    const id = await newNote(folder); if (id) go({ note: id, fresh: true });
  };
  const createFolder = async parent => {
    if (parent) toggle(parent, true);
    const id = await newFolder(parent); if (id) setRenaming(id);
  };

  if (query) {
    const q = query.toLowerCase();
    const hits = db.notes.filter(n => noteTitle(n).toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q))
      .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    return (
      <ul className="flex flex-col gap-px px-2">
        {!hits.length && <li className="px-2 py-1.5 text-sm text-muted-foreground">Ничего не нашлось</li>}
        {hits.map(n => <NoteRow key={n.id} n={n} depth={0} active={view.note === n.id} go={go} folders={db.folders} />)}
      </ul>
    );
  }

  const shared = id => db.grants.some(g => g.coll === "folders" && g.target === id);
  const renderFolder = (f, depth) => {
    const isOpen = open.has(f.id), mine = isMine(f), sharedWithMe = !mine && depth === 0;
    return (
      <li key={f.id}>
        <Row depth={depth} onClick={() => toggle(f.id)} className="group/row">
          <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
          {isOpen ? <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" /> : <FolderIcon className="size-4 shrink-0 text-muted-foreground" />}
          {renaming === f.id
            ? <RenameInput value={f.name} onDone={name => { setRenaming(null); if (name && name !== f.name) update("folders", f.id, { name }); }} />
            : <span className="truncate">{f.name || "Без названия"}</span>}
          {(shared(f.id) || sharedWithMe) && <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Общая папка" />}
          <span className="ml-auto flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 max-md:opacity-100">
            <IconBtn label="Новая заметка" onClick={() => createNote(f.id)}><PlusIcon /></IconBtn>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><IconBtn label="Действия с папкой"><MoreHorizontalIcon /></IconBtn></DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => createNote(f.id)}><FileTextIcon />Новая заметка</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => createFolder(f.id)}><FolderPlusIcon />Новая папка</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(f.id))}><PencilIcon />Переименовать</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSharing(f)}><UsersIcon />{mine ? "Поделиться" : "Участники"}</DropdownMenuItem>
                {!sharedWithMe && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={async () => {
                    const n = descendants(db.folders, f.id).length - 1, k = db.notes.filter(x => descendants(db.folders, f.id).includes(x.folder)).length;
                    if (await confirmAction({ title: `Удалить папку «${f.name}»?`, description: k || n ? `Вместе с ней удалятся заметки (${k}) и вложенные папки (${n}).` : "Папка пустая." }))
                      deleteFolder(f.id);
                  }}><Trash2Icon />Удалить</DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </Row>
        {isOpen && (
          <ul className="flex flex-col gap-px">
            {t.folders(f.id).map(c => renderFolder(c, depth + 1))}
            {t.notes(f.id).map(n => <NoteRow key={n.id} n={n} depth={depth + 1} active={view.note === n.id} go={go} folders={db.folders} />)}
            {!t.folders(f.id).length && !t.notes(f.id).length && <li className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: 36 + (depth + 1) * 12 }}>Пусто</li>}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <ul className="flex flex-col gap-px px-2">
        {t.folders("").map(f => renderFolder(f, 0))}
        {t.notes("").map(n => <NoteRow key={n.id} n={n} depth={0} active={view.note === n.id} go={go} folders={db.folders} />)}
        {!db.folders.length && !db.notes.length && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">Заметок пока нет. Создай первую кнопкой «+».</li>
        )}
      </ul>
      {sharing && (
        <ShareDialog open onOpenChange={o => !o && setSharing(null)} coll="folders" target={sharing.id} name={sharing.name} isOwner={isMine(sharing)} />
      )}
    </>
  );
}

function NoteRow({ n, depth, active, go, folders }) {
  return (
    <li>
      <Row depth={depth} active={active} onClick={() => go({ note: n.id })} className="group/row">
        <span className="size-3.5 shrink-0" />
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !n.title?.trim() && "text-muted-foreground")}>{noteTitle(n)}</span>
        <span className="ml-auto flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <NoteMenu n={n} folders={folders} after={id => active && id === n.id && go({ tasks: true })} />
        </span>
      </Row>
    </li>
  );
}

export function NoteMenu({ n, folders, after, trigger }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger || <IconBtn label="Действия с заметкой"><MoreHorizontalIcon /></IconBtn>}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><FolderInputIcon />Переместить в</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem disabled={!n.folder} onSelect={() => update("notes", n.id, { folder: "" })}>Без папки</DropdownMenuItem>
            {[...folders].sort((a, b) => a.name.localeCompare(b.name, "ru")).map(f => (
              <DropdownMenuItem key={f.id} disabled={n.folder === f.id} onSelect={() => update("notes", n.id, { folder: f.id })}>
                <FolderIcon />{f.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={async () => {
          if (await confirmAction({ title: `Удалить «${noteTitle(n)}»?`, description: "Заметку нельзя будет вернуть." })) { after?.(n.id); remove("notes", n.id); }
        }}><Trash2Icon />Удалить</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({ depth, active, className, children, onClick }) {
  return (
    <div
      role="button" tabIndex={0} onClick={onClick}
      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onClick(); } }}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm outline-none select-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
        active && "bg-accent font-medium", className
      )}
      style={{ paddingLeft: 6 + depth * 12 }}
    >
      {children}
    </div>
  );
}

export const IconBtn = forwardRef(function IconBtn({ label, children, className, onClick, ...props }, ref) {
  return (
    <button ref={ref} type="button" aria-label={label} title={label} {...props}
      onClick={e => { e.stopPropagation(); onClick?.(e); }}
      className={cn("grid size-6 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground [&_svg]:size-3.5", className)}>
      {children}
    </button>
  );
});

function RenameInput({ value, onDone }) {
  const ref = useRef(null), done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = v => { if (done.current) return; done.current = true; onDone(v); };
  return (
    <input ref={ref} defaultValue={value} onClick={e => e.stopPropagation()}
      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") finish(e.currentTarget.value.trim()); if (e.key === "Escape") finish(null); }}
      onBlur={e => finish(e.currentTarget.value.trim())}
      className="h-6 min-w-0 flex-1 rounded border border-input bg-background px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50" />
  );
}
