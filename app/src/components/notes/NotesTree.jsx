import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, MoreHorizontalIcon,
  PencilIcon, PlusIcon, Trash2Icon, UsersIcon, FolderInputIcon, ListChecksIcon,
} from "lucide-react";
import { useDb, update, remove, isMine } from "@/lib/db";
import { tree, newNote, newFolder, newProject, deleteFolder, deleteProject, folderStats, descendants } from "@/lib/notes";
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
export const itemName = x => x.kind === "project" ? x.name?.trim() || "Без названия" : noteTitle(x);
const COLL = { note: "notes", project: "boards" };

export default function NotesTree({ view, go, query }) {
  const db = useDb();
  const [open, setOpen] = useState(loadOpen);
  const [renaming, setRenaming] = useState(null);
  const [sharing, setSharing] = useState(null);
  const t = useMemo(() => tree(db.folders, db.notes, db.boards), [db.folders, db.notes, db.boards]);

  useEffect(() => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch {} }, [open]);
  const toggle = (id, v) => setOpen(s => { const n = new Set(s); (v ?? !n.has(id)) ? n.add(id) : n.delete(id); return n; });

  const create = async (kind, folder) => {
    if (folder) toggle(folder, true);
    if (kind === "folder") { const id = await newFolder(folder); if (id) setRenaming(id); return; }
    const id = kind === "note" ? await newNote(folder) : await newProject(folder);
    if (id) go({ [kind]: id, fresh: true });
  };
  const grantOn = (coll, id) => db.grants.some(g => g.coll === coll && g.target === id);
  const isActive = x => view[x.kind] === x.id;
  const fileRow = (x, depth) => (
    <FileRow key={x.kind + x.id} x={x} depth={depth} active={isActive(x)} go={go} folders={db.folders}
      shared={x.kind === "project" && (grantOn("boards", x.id) || !isMine(x))}
      onShare={() => setSharing({ coll: "boards", id: x.id, name: itemName(x), owner: isMine(x) })} />
  );

  if (query) {
    const q = query.toLowerCase();
    const hits = [
      ...db.boards.map(b => ({ ...b, kind: "project" })).filter(b => itemName(b).toLowerCase().includes(q)),
      ...db.notes.map(n => ({ ...n, kind: "note" })).filter(n => noteTitle(n).toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q))
        .sort((a, b) => (b.updated || "").localeCompare(a.updated || "")),
    ];
    return (
      <ul className="flex flex-col gap-px px-2">
        {!hits.length && <li className="px-2 py-1.5 text-sm text-muted-foreground">Ничего не нашлось</li>}
        {hits.map(x => fileRow(x, 0))}
      </ul>
    );
  }

  const renderFolder = (f, depth) => {
    const isOpen = open.has(f.id), mine = isMine(f), sharedWithMe = !mine && depth === 0;
    const kids = t.folders(f.id), files = t.files(f.id);
    return (
      <li key={f.id}>
        <Row depth={depth} onClick={() => toggle(f.id)}>
          <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
          {isOpen ? <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" /> : <FolderIcon className="size-4 shrink-0 text-muted-foreground" />}
          {renaming === f.id
            ? <RenameInput value={f.name} onDone={name => { setRenaming(null); if (name && name !== f.name) update("folders", f.id, { name }); }} />
            : <span className="truncate">{f.name || "Без названия"}</span>}
          {(grantOn("folders", f.id) || sharedWithMe) && <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Общая папка" />}
          <Actions>
            <CreateMenu onCreate={k => create(k, f.id)} trigger={<IconBtn label="Создать в папке"><PlusIcon /></IconBtn>} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><IconBtn label="Действия с папкой"><MoreHorizontalIcon /></IconBtn></DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(f.id))}><PencilIcon />Переименовать</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSharing({ coll: "folders", id: f.id, name: f.name, owner: mine })}><UsersIcon />{mine ? "Поделиться" : "Участники"}</DropdownMenuItem>
                {!sharedWithMe && <MoveTo folders={db.folders.filter(x => !descendants(db.folders, f.id).includes(x.id))} current={f.parent}
                  onMove={parent => update("folders", f.id, { parent })} />}
                {!sharedWithMe && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={async () => {
                    const s = folderStats(f.id), parts = [];
                    if (s.projects) parts.push(`проекты (${s.projects})`);
                    if (s.notes) parts.push(`заметки (${s.notes})`);
                    if (s.folders) parts.push(`вложенные папки (${s.folders})`);
                    if (await confirmAction({ title: `Удалить папку «${f.name}»?`, description: parts.length ? `Вместе с ней удалятся ${parts.join(", ")}.` : "Папка пустая." }))
                      deleteFolder(f.id);
                  }}><Trash2Icon />Удалить</DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu>
          </Actions>
        </Row>
        {isOpen && (
          <ul className="flex flex-col gap-px">
            {kids.map(c => renderFolder(c, depth + 1))}
            {files.map(x => fileRow(x, depth + 1))}
            {!kids.length && !files.length && <li className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: 36 + (depth + 1) * 12 }}>Пусто</li>}
          </ul>
        )}
      </li>
    );
  };

  const roots = t.folders(""), files = t.files("");
  return (
    <>
      <ul className="flex flex-col gap-px px-2">
        {roots.map(f => renderFolder(f, 0))}
        {files.map(x => fileRow(x, 0))}
        {!roots.length && !files.length && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">Пока пусто. Создай проект или заметку кнопкой «+».</li>
        )}
      </ul>
      {sharing && (
        <ShareDialog open onOpenChange={o => !o && setSharing(null)} coll={sharing.coll} target={sharing.id} name={sharing.name} isOwner={sharing.owner} />
      )}
    </>
  );
}

export function CreateMenu({ onCreate, trigger }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onCreate("project")}><ListChecksIcon />Проект с задачами</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("note")}><FileTextIcon />Заметка</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("folder")}><FolderPlusIcon />Папка</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FileRow({ x, depth, active, go, folders, shared, onShare }) {
  const Icon = x.kind === "project" ? ListChecksIcon : FileTextIcon;
  return (
    <li>
      <Row depth={depth} active={active} onClick={() => go({ [x.kind]: x.id })}>
        <span className="size-3.5 shrink-0" />
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !(x.name || x.title)?.trim() && "text-muted-foreground")}>{itemName(x)}</span>
        {shared && <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Общий проект" />}
        <Actions>
          <FileMenu x={x} folders={folders} onShare={onShare} after={() => active && go({ journal: true })} />
        </Actions>
      </Row>
    </li>
  );
}

// move / share / delete for a note or a project
export function FileMenu({ x, folders, after, trigger, onShare }) {
  const coll = COLL[x.kind], project = x.kind === "project";
  const sharedRoot = project && !isMine(x);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger || <IconBtn label={project ? "Действия с проектом" : "Действия с заметкой"}><MoreHorizontalIcon /></IconBtn>}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
        {project && onShare && <DropdownMenuItem onSelect={onShare}><UsersIcon />{isMine(x) ? "Поделиться" : "Участники"}</DropdownMenuItem>}
        <MoveTo folders={folders} current={x.folder} onMove={folder => update(coll, x.id, { folder })} />
        {!sharedRoot && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={async () => {
            const ok = await confirmAction(project
              ? { title: `Удалить проект «${itemName(x)}»?`, description: "Удалятся его категории и открытые задачи. Выполненные останутся в журнале." }
              : { title: `Удалить «${itemName(x)}»?`, description: "Заметку нельзя будет вернуть." });
            if (!ok) return;
            after?.();
            project ? deleteProject(x.id) : remove("notes", x.id);
          }}><Trash2Icon />Удалить</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MoveTo({ folders, current, onMove }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger><FolderInputIcon />Переместить в</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem disabled={!current} onSelect={() => onMove("")}>Без папки</DropdownMenuItem>
        {[...folders].sort((a, b) => a.name.localeCompare(b.name, "ru")).map(f => (
          <DropdownMenuItem key={f.id} disabled={current === f.id} onSelect={() => onMove(f.id)}><FolderIcon />{f.name}</DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

const Actions = ({ children }) => (
  <span className="ml-auto flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 max-md:opacity-100">{children}</span>
);

function Row({ depth, active, children, onClick }) {
  return (
    <div
      role="button" tabIndex={0} onClick={onClick}
      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onClick(); } }}
      className={cn(
        "group/row flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm outline-none select-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
        active && "bg-accent font-medium"
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
