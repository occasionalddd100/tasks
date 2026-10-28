import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, MoreHorizontalIcon,
  PencilIcon, PlusIcon, Trash2Icon, UploadIcon, FolderUpIcon, UsersIcon, FolderInputIcon, ListChecksIcon, LayoutGridIcon, PinIcon, PinOffIcon, ArrowUpIcon, ArrowDownIcon,
} from "lucide-react";
import { useDb, getDb, update, updateMany, remove, isMine, put } from "@/lib/db";
import { tree, newNote, newFolder, newProject, newStash, deleteStash, deleteFolder, deleteProject, folderStats, descendants } from "@/lib/notes";
import { cn } from "@/lib/utils";
import { confirmAction } from "@/components/Confirm";
import ShareDialog from "@/components/ShareDialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { importFiles, fromInput } from "@/lib/importMd";
import { ActionsContext, ActionsDropdown } from "@/components/ui/actions";
import { AnimatePresence, motion } from "motion/react";
import { ItemIcon, pickIcon } from "@/components/IconPicker";
import { PaletteIcon } from "lucide-react";

const OPEN_KEY = "openFolders";
const loadOpen = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch { return new Set(); } };

export const noteTitle = n => n.title?.trim() || "Без названия";
export const itemName = x => x.kind === "note" ? noteTitle(x) : x.name?.trim() || "Без названия";
const COLL = { note: "notes", project: "projects", stash: "stashes" };
const KIND = { notes: "note", projects: "project", stashes: "stash" };
const ICON = { note: FileTextIcon, project: ListChecksIcon, stash: LayoutGridIcon };
const NOUN = { note: "заметкой", project: "проектом", stash: "стэшем" };

// pins are personal: one prefs doc per user, "<coll>:<id>" keys
const prefsId = () => getDb().me + ":prefs";
export const usePins = db => db.prefs.find(p => p.id === db.me + ":prefs")?.pinned || [];
export function togglePin(key) {
  const cur = getDb().prefs.find(p => p.id === prefsId())?.pinned || [];
  put("prefs", prefsId(), { pinned: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] });
}
const pinItem = (pins, key) => ({ label: pins.includes(key) ? "Открепить" : "Закрепить", icon: pins.includes(key) ? PinOffIcon : PinIcon, onSelect: () => togglePin(key) });

export default function NotesTree({ view, go, query }) {
  const db = useDb();
  const [open, setOpen] = useState(loadOpen);
  const [renaming, setRenaming] = useState(null);
  const [sharing, setSharing] = useState(null);
  const t = useMemo(() => tree(db.folders, db.notes, db.projects, db.stashes), [db.folders, db.notes, db.projects, db.stashes]);
  const pins = usePins(db);

  // drag & drop: onto a folder = put inside, onto its top/bottom edge = place before/after it
  const dragged = useRef(null);
  const [over, setOver] = useState(null); // { key, zone }
  const [dragging, setDragging] = useState(false);
  const moveFolder = (id, parent, before) => {
    if (descendants(db.folders, id).includes(parent)) return;
    const sibs = t.folders(parent).filter(f => f.id !== id);
    let at = before ? sibs.findIndex(f => f.id === before.id) + (before.after ? 1 : 0) : sibs.length;
    if (at < 0) at = sibs.length;
    const me = db.folders.find(f => f.id === id); if (!me) return;
    sibs.splice(at, 0, me);
    updateMany("folders", sibs.map((f, i) => [f.id, f.id === id ? { order: i + 1, parent } : { order: i + 1 }]).filter(([fid, ch]) => fid === id || db.folders.find(f => f.id === fid)?.order !== ch.order));
  };
  // a file dropped above/below another one: the whole folder's files get a fresh manual order
  const placeFile = (d, into, target, after) => {
    const sibs = t.files(into).filter(x => !(COLL[x.kind] === d.coll && x.id === d.id));
    let at = sibs.findIndex(x => x.kind === target.kind && x.id === target.id);
    at = at < 0 ? sibs.length : at + (after ? 1 : 0);
    sibs.splice(at, 0, { kind: KIND[d.coll], id: d.id, me: true });
    const by = {};
    sibs.forEach((x, i) => {
      const coll = COLL[x.kind], cur = db[coll]?.find(y => y.id === x.id);
      if (x.me) (by[coll] ||= []).push([x.id, { folder: into, order: i + 1 }]);
      else if (cur?.order !== i + 1) (by[coll] ||= []).push([x.id, { order: i + 1 }]);
    });
    Object.entries(by).forEach(([coll, list]) => updateMany(coll, list));
  };
  const dropOn = (target, zone) => {
    const d = dragged.current; setOver(null); setDragging(false); dragged.current = null;
    if (!d || (d.coll === "folders" && d.id === target?.id)) return;
    const into = !target ? "" : target.kind === "folder" ? (zone === "inside" ? target.id : target.parent || "") : (target.folder || "");
    if (d.coll === "folders") moveFolder(d.id, into, target?.kind === "folder" && zone !== "inside" ? { id: target.id, after: zone === "after" } : null);
    else if (target && target.kind !== "folder" && zone !== "inside") placeFile(d, into, target, zone === "after");
    else update(d.coll, d.id, { folder: into });
    if (into) toggle(into, true);
  };
  const dnd = (x, coll) => {
    const key = coll + ":" + x.id, folder = coll === "folders";
    return {
      draggable: isMine(x),
      onDragStart: e => { dragged.current = { coll, id: x.id }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); setTimeout(() => setDragging(true)); },
      onDragEnd: () => { dragged.current = null; setOver(null); setDragging(false); },
      onDragOver: e => {
        if (!dragged.current) return;
        e.preventDefault(); e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
        const zone = !folder ? (dragged.current.coll === "folders" ? "inside" : y < 0.5 ? "before" : "after")
          : dragged.current.coll !== "folders" ? "inside" : y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
        if (over?.key !== key || over?.zone !== zone) setOver({ key, zone });
      },
      onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget) && over?.key === key) setOver(null); },
      onDrop: e => { e.preventDefault(); e.stopPropagation(); dropOn({ ...x, kind: folder ? "folder" : x.kind }, over?.zone || "inside"); },
      dropZone: over?.key === key ? over.zone : null,
    };
  };

  useEffect(() => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch {} }, [open]);
  const toggle = (id, v) => setOpen(s => { const n = new Set(s); (v ?? !n.has(id)) ? n.add(id) : n.delete(id); return n; });

  const create = async (kind, folder) => {
    if (folder) toggle(folder, true);
    if (kind === "folder") { const id = await newFolder(folder); if (id) setRenaming(id); return; }
    const id = kind === "note" ? await newNote(folder) : kind === "stash" ? await newStash(folder) : await newProject(folder);
    if (id) go({ [kind]: id, fresh: true });
  };
  const grantOn = (coll, id) => db.grants.some(g => g.coll === coll && g.target === id);
  const isActive = x => view[x.kind] === x.id;
  // a pinned item shows only in the pinned block on top, not a second time in the tree
  const fileRow = (x, depth) => pins.includes(COLL[x.kind] + ":" + x.id) || (x.kind === "project" && x.personal && isMine(x)) ? null : (
    <FileRow key={x.kind + x.id} x={x} depth={depth} active={isActive(x)} go={go} folders={db.folders} dnd={dnd(x, COLL[x.kind])} pins={pins}
      shared={x.kind !== "note" && (grantOn(COLL[x.kind], x.id) || !isMine(x))}
      onShare={() => setSharing({ coll: COLL[x.kind], id: x.id, name: itemName(x), owner: isMine(x) })} />
  );

  if (query) {
    const q = query.toLowerCase();
    const hits = [
      ...db.projects.map(b => ({ ...b, kind: "project" })).filter(b => itemName(b).toLowerCase().includes(q)),
      ...db.stashes.map(b => ({ ...b, kind: "stash" })).filter(b => itemName(b).toLowerCase().includes(q)),
      ...db.notes.map(n => ({ ...n, kind: "note" })).filter(n => noteTitle(n).toLowerCase().includes(q) || (n.body || "").replace(/\\#/g, "#").toLowerCase().includes(q))
        .sort((a, b) => (b.updated || "").localeCompare(a.updated || "")),
    ];
    return (
      <ul className="flex flex-col gap-px px-2">
        {!hits.length && <li className="px-2 py-1.5 text-sm text-muted-foreground">Ничего не нашлось</li>}
        {hits.map(x => fileRow(x, 0))}
      </ul>
    );
  }

  const folderItems = (f, sharedWithMe) => {
    const mine = isMine(f);
    return [
      { label: "Новая доска", icon: ListChecksIcon, onSelect: () => create("project", f.id) },
      { label: "Новая заметка", icon: FileTextIcon, onSelect: () => create("note", f.id) },
      { label: "Новый стэш", icon: LayoutGridIcon, onSelect: () => create("stash", f.id) },
      { label: "Новая папка", icon: FolderPlusIcon, onSelect: () => create("folder", f.id) },
      { sep: true },
      { label: "Переименовать", icon: PencilIcon, onSelect: () => setTimeout(() => setRenaming(f.id)) },
      { label: "Иконка и цвет", icon: PaletteIcon, onSelect: () => setTimeout(() => pickIcon("folders", f)) },
      pinItem(pins, "folders:" + f.id),
      !sharedWithMe && { label: "Выше", icon: ArrowUpIcon, onSelect: () => { const sib = t.folders(f.parent || ""), i = sib.findIndex(x => x.id === f.id); if (i > 0) moveFolder(f.id, f.parent || "", { id: sib[i - 1].id, after: false }); } },
      !sharedWithMe && { label: "Ниже", icon: ArrowDownIcon, onSelect: () => { const sib = t.folders(f.parent || ""), i = sib.findIndex(x => x.id === f.id); if (i < sib.length - 1) moveFolder(f.id, f.parent || "", { id: sib[i + 1].id, after: true }); } },
      { label: mine ? "Поделиться" : "Участники", icon: UsersIcon, onSelect: () => setSharing({ coll: "folders", id: f.id, name: f.name, owner: mine }) },
      !sharedWithMe && moveItem(db.folders.filter(x => !descendants(db.folders, f.id).includes(x.id)), f.parent, parent => update("folders", f.id, { parent })),
      !sharedWithMe && { sep: true },
      !sharedWithMe && { label: "Удалить", icon: Trash2Icon, variant: "destructive", onSelect: async () => {
        const s = folderStats(f.id), parts = [];
        if (s.projects) parts.push(`проекты (${s.projects})`);
        if (s.notes) parts.push(`заметки (${s.notes})`);
        if (s.folders) parts.push(`вложенные папки (${s.folders})`);
        if (await confirmAction({ title: `Удалить папку «${f.name}»?`, description: parts.length ? `Вместе с ней удалятся ${parts.join(", ")}.` : "Папка пустая." }))
          deleteFolder(f.id);
      } },
    ];
  };

  const renderFolder = (f, depth, pinned) => {
    if (!pinned && pins.includes("folders:" + f.id)) return null;
    const isOpen = open.has(f.id), sharedWithMe = !isMine(f) && depth === 0 && !pinned;
    const { dropZone, ...drag } = dnd(f, "folders");
    const kids = t.folders(f.id), files = t.files(f.id);
    const items = folderItems(f, sharedWithMe);
    return (
      <li key={(pinned ? "pin" : "") + f.id}>
        <ActionsContext items={items}>
          <Row depth={depth} onClick={() => toggle(f.id)} {...drag} drop={dropZone}>
            <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-90")} />
            <ItemIcon x={f} fallback={isOpen ? FolderOpenIcon : FolderIcon} />
            {renaming === f.id
              ? <RenameInput value={f.name} onDone={name => { setRenaming(null); if (name && name !== f.name) update("folders", f.id, { name }); }} />
              : <span className="truncate">{f.name || "Без названия"}</span>}
            {pinned && <PinIcon className="size-3 shrink-0 text-muted-foreground" />}
            {(grantOn("folders", f.id) || sharedWithMe) && <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Общая папка" />}
            <Actions>
              <CreateMenu folder={f.id} onCreate={k => create(k, f.id)} trigger={<IconBtn label="Создать в папке"><PlusIcon /></IconBtn>} />
              <ActionsDropdown items={items} trigger={<IconBtn label="Действия с папкой" className="md:hidden"><MoreHorizontalIcon /></IconBtn>} />
            </Actions>
          </Row>
        </ActionsContext>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.ul className="flex flex-col gap-px overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
              {kids.map(c => renderFolder(c, depth + 1))}
              {files.map(x => fileRow(x, depth + 1))}
              {!kids.length && !files.length && <li className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: 36 + (depth + 1) * 12 }}>Пусто</li>}
            </motion.ul>
          )}
        </AnimatePresence>
      </li>
    );
  };

  const roots = t.folders(""), files = t.files("");
  const pinned = pins.map(k => {
    const [coll, id] = k.split(":");
    const x = db[coll]?.find(d => d.id === id);
    return x && { coll, x };
  }).filter(Boolean);
  return (
    <>
      {pinned.length > 0 && (
        <ul className="mb-2 flex flex-col gap-px border-b px-2 pb-2">
          {pinned.map(({ coll, x }) => coll === "folders" ? renderFolder(x, 0, true) : <FileRow key={"pin" + x.id} x={{ ...x, kind: KIND[coll] }} depth={0} pinned
            active={isActive({ ...x, kind: KIND[coll] })} go={go} folders={db.folders} dnd={dnd(x, coll)} pins={pins} />)}
        </ul>
      )}
      <ul className="flex flex-col gap-px px-2">
        {roots.map(f => renderFolder(f, 0))}
        {files.map(x => fileRow(x, 0))}
        {!roots.length && !files.length && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">Пока пусто. Создай проект или заметку кнопкой «+».</li>
        )}
        {dragging && (
          <li onDragOver={e => { e.preventDefault(); setOver({ key: "root", zone: "inside" }); }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); dropOn(null); }}
            className={cn("mt-1 rounded-md border border-dashed px-2 py-2 text-center text-xs text-muted-foreground transition-colors", over?.key === "root" && "border-foreground/40 bg-accent text-foreground")}>
            Сюда, чтобы вынести из папки
          </li>
        )}
      </ul>
      {sharing && (
        <ShareDialog open onOpenChange={o => !o && setSharing(null)} coll={sharing.coll} target={sharing.id} name={sharing.name} isOwner={sharing.owner} />
      )}
    </>
  );
}

export function CreateMenu({ onCreate, trigger, folder = "" }) {
  const files = useRef(null), dir = useRef(null);
  const pick = async e => { const input = e.target, list = fromInput(input.files); if (list.length) await importFiles(list, folder); input.value = ""; };
  return (
    <>
    <input ref={files} type="file" multiple accept=".md,.markdown,.txt,text/markdown" className="hidden" onClick={e => e.stopPropagation()} onChange={pick} />
    <input ref={dir} type="file" webkitdirectory="" className="hidden" onClick={e => e.stopPropagation()} onChange={pick} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onCreate("project")}><ListChecksIcon />Проект с задачами</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("note")}><FileTextIcon />Заметка</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("stash")}><LayoutGridIcon />Стэш (доска медиа)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("folder")}><FolderPlusIcon />Папка</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => files.current?.click()}><UploadIcon />Загрузить .md файлы</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => dir.current?.click()}><FolderUpIcon />Загрузить папку</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}

function FileRow({ x, depth, active, go, folders, shared, onShare, dnd = {}, pins = [], pinned }) {
  const Icon = ICON[x.kind];
  const { dropZone, ...drag } = dnd;
  const items = [pinItem(pins, COLL[x.kind] + ":" + x.id), ...fileItems({ x, folders, onShare, after: () => active && go({ journal: true }) })];
  return (
    <li>
      <ActionsContext items={items}>
        <Row depth={depth} active={active} onClick={() => go({ [x.kind]: x.id })} {...drag} drop={dropZone === "inside" ? "file" : dropZone}>
          <span className="size-3.5 shrink-0" />
          <ItemIcon x={x} fallback={Icon} />
          <span className={cn("truncate", !(x.name || x.title)?.trim() && "text-muted-foreground")}>{itemName(x)}</span>
          {pinned && <PinIcon className="size-3 shrink-0 text-muted-foreground" />}
          {shared && <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Общий проект" />}
          <Actions>
            <ActionsDropdown items={items} trigger={<IconBtn label={"Действия с " + NOUN[x.kind]} className="md:hidden"><MoreHorizontalIcon /></IconBtn>} />
          </Actions>
        </Row>
      </ActionsContext>
    </li>
  );
}

// move / share / delete for a note or a project
export function fileItems({ x, folders, after, onShare }) {
  const coll = COLL[x.kind], project = x.kind === "project";
  const sharedRoot = (project || x.kind === "stash") && !isMine(x);
  return [
    (project || x.kind === "stash") && onShare && { label: isMine(x) ? "Поделиться" : "Участники", icon: UsersIcon, onSelect: onShare },
    { label: "Иконка и цвет", icon: PaletteIcon, onSelect: () => setTimeout(() => pickIcon(coll, x)) },
    moveItem(folders, x.folder, folder => update(coll, x.id, { folder })),
    !sharedRoot && { sep: true },
    !sharedRoot && { label: "Удалить", icon: Trash2Icon, variant: "destructive", onSelect: async () => {
      const ok = await confirmAction(project
        ? { title: `Удалить проект «${itemName(x)}»?`, description: "Удалятся его категории и открытые задачи. Выполненные останутся в журнале." }
        : x.kind === "stash" ? { title: `Удалить стэш «${itemName(x)}»?`, description: "Удалятся все его доски и карточки." }
        : { title: `Удалить «${itemName(x)}»?`, description: "Заметку нельзя будет вернуть." });
      if (!ok) return;
      after?.();
      project ? deleteProject(x.id) : x.kind === "stash" ? deleteStash(x.id) : remove("notes", x.id);
    } },
  ];
}

export function FileMenu({ trigger, ...props }) {
  return <ActionsDropdown items={fileItems(props)} trigger={trigger || <IconBtn label={"Действия с " + NOUN[props.x.kind]}><MoreHorizontalIcon /></IconBtn>} />;
}

const moveItem = (folders, current, onMove) => ({
  label: "Переместить в", icon: FolderInputIcon, sub: [
    { label: "Без папки", disabled: !current, onSelect: () => onMove("") },
    ...[...folders].sort((a, b) => a.name.localeCompare(b.name, "ru")).map(f => ({ label: f.name, icon: FolderIcon, disabled: current === f.id, onSelect: () => onMove(f.id) })),
  ],
});

const Actions = ({ children }) => (
  <span className="ml-auto flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 max-md:opacity-100">{children}</span>
);

// forwards ref and props so it can be a right-click menu trigger
const Row = forwardRef(function Row({ depth, active, drop, children, onClick, className, style, ...props }, ref) {
  return (
    <div
      ref={ref} role="button" tabIndex={0} {...props} onClick={onClick}
      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onClick(); } }}
      className={cn(
        "group/row flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm outline-none select-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-accent",
        active && "bg-accent font-medium",
        drop === "inside" && "bg-primary/10 ring-1 ring-primary/40", drop === "file" && "bg-accent/60",
        drop === "before" && "shadow-[inset_0_2px_0_var(--ring)]", drop === "after" && "shadow-[inset_0_-2px_0_var(--ring)]", className
      )}
      style={{ paddingLeft: 6 + depth * 12, ...style }}
    >
      {children}
    </div>
  );
});

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
