import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as Pop from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, ImageIcon, LinkIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlayIcon, PlusIcon,
  SearchIcon, StickyNoteIcon, TagIcon, Trash2Icon, XIcon, LayoutGridIcon, ArrowRightLeftIcon, FileTextIcon,
  FolderPlusIcon, FolderIcon, CopyIcon, MaximizeIcon, ZoomInIcon, ZoomOutIcon, FolderOpenIcon, RefreshCwIcon, Columns3Icon, HardDriveIcon, LockIcon, UsersIcon,
} from "lucide-react";
import ShareDialog from "@/components/ShareDialog";
import { VIEW, ViewHeader, PillTab, PillTabs } from "@/components/ViewHeader";
import { ItemIcon } from "@/components/IconPicker";
import { useNavItems, scrollTop } from "@/components/MobileNav";
import { canUseFolders, addFolder, access, allow, fileUrl, useFolders } from "@/lib/localFolders";
const FolderPortal = lazy(() => import("@/components/stash/FolderPortal"));
import { isMine } from "@/lib/db";
import { toast } from "sonner";
import { useDb, update, updateMany, remove } from "@/lib/db";
import { addLink, addText, addPhoto, embedUrl, linksIn, PROVIDER, refresh } from "@/lib/stash";
import { uploadPhoto, usePhotoUrl, deletePhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ActionsDropdown, ActionsContext } from "@/components/ui/actions";
import { confirmAction } from "@/components/Confirm";
import { FileMenu, IconBtn } from "@/components/notes/NotesTree";

const Editor = lazy(() => import("@/components/notes/Editor"));
const rid = () => Math.random().toString(36).slice(2, 9);
const ALL = "*";

export default function StashView({ id, fresh, go }) {
  const db = useDb();
  const stash = db.stashes.find(s => s.id === id);
  const tabs = stash?.tabs || [];
  const [tab, setTabRaw] = useState(() => { try { return localStorage.getItem("stashTab:" + id) || ""; } catch { return ""; } });
  const cur = tab === ALL || tabs.some(t => t.id === tab) ? tab : tabs[0]?.id || "";
  const setTab = t => { setTabRaw(t); try { localStorage.setItem("stashTab:" + id, t); } catch {} };
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState([]);
  const [unseen, setUnseen] = useState(false);
  const [open, setOpen] = useState(null);
  const [dragTab, setDragTab] = useState(null);
  const dragged = useRef(null);

  const grid = GRID[useGrid()];
  const all = useMemo(() => db.clips.filter(c => c.stash === id), [db.clips, id]);
  const tagCounts = useMemo(() => {
    const m = new Map();
    for (const c of all) if (cur === ALL || c.tab === cur) for (const t of c.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  }, [all, cur]);
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const shown = all
    .filter(c => cur === ALL || c.tab === cur)
    .filter(c => !unseen || !c.watched)
    .filter(c => tags.every(t => c.tags?.includes(t)))
    .filter(c => !q || [c.title, c.text, c.desc, c.note, c.author, c.url, c.name, c.path, ...(c.tags || [])].some(s => (s || "").toLowerCase().includes(q)))
    .sort((a, b) => cur === ALL ? (b.added || "").localeCompare(a.added || "") : (a.order ?? 0) - (b.order ?? 0));
  // big boards render in pages of 60 as you scroll, not all at once
  const [limit, setLimit] = useState(60);
  useEffect(() => setLimit(60), [cur, q, unseen, tags.join()]);
  const more = useRef(null);
  useEffect(() => {
    const el = more.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit(l => l + 60), { rootMargin: "800px" });
    io.observe(el); return () => io.disconnect();
  });
  const [boards, setBoards] = useState(false);
  const [sharing, setSharing] = useState(false);
  const searchRef = useRef(null), addRef = useRef(null);
  const focus = r => { scrollTop(); setTimeout(() => r.current?.focus(), 250); };
  useNavItems([
    { k: "boards", label: tabs.find(t => t.id === cur)?.name || "Все", icon: Columns3Icon, onClick: () => setBoards(true) },
    { k: "search", label: "Поиск", icon: SearchIcon, onClick: () => focus(searchRef) },
    { k: "add", label: "Добавить", icon: PlusIcon, accent: true, onClick: () => focus(addRef) },
    { k: "unseen", label: "Очередь", icon: EyeOffIcon, active: unseen, onClick: () => setUnseen(v => !v) },
  ]);

  if (!db.ready) return <div className="p-8 text-sm text-muted-foreground">Загружаю…</div>;
  if (!stash) return <div className="p-8 text-sm text-muted-foreground">Стэш не найден. Может, его удалили.</div>;

  const saveTabs = next => update("stashes", id, { tabs: next });
  const addTab = () => { const t = { id: rid(), name: "Доска " + (tabs.length + 1) }; saveTabs([...tabs, t]); setTab(t.id); };
  const renameTab = (t, name) => saveTabs(tabs.map(x => x.id === t.id ? { ...x, name: name.trim() || x.name } : x));
  const deleteTab = async t => {
    const n = all.filter(c => c.tab === t.id).length;
    if (tabs.length < 2) return toast("Последнюю доску удалить нельзя");
    if (n && !(await confirmAction({ title: `Удалить доску «${t.name}»?`, description: `Вместе с ней удалятся карточки (${n}).` }))) return;
    if (n) remove("clips", all.filter(c => c.tab === t.id).map(c => c.id));
    saveTabs(tabs.filter(x => x.id !== t.id));
  };
  const target = cur === ALL ? tabs[0]?.id : cur;

  // drag a card onto another card = put it before that card; onto a tab = move it to that board
  const dropOnCard = over => {
    const c = dragged.current; dragged.current = null;
    if (!c || c.id === over.id || cur === ALL) return;
    const list = shown.filter(x => x.id !== c.id);
    list.splice(list.findIndex(x => x.id === over.id), 0, c);
    updateMany("clips", list.map((x, i) => [x.id, { order: i, ...(x.id === c.id ? { tab: over.tab } : {}) }]).filter(([cid, f]) => cid === c.id || all.find(x => x.id === cid)?.order !== f.order));
  };
  const moveTo = (c, tabId) => { if (c.tab !== tabId) update("clips", c.id, { tab: tabId, order: Math.min(0, ...all.filter(x => x.tab === tabId).map(x => x.order ?? 0)) - 1 }); };
  const dropOnTab = t => { const c = dragged.current; dragged.current = null; setDragTab(null); if (c) { moveTo(c, t.id); toast(`Перенёс в «${t.name}»`); } };

  return (
    <div className={VIEW}>
      <ViewHeader icon={<ItemIcon x={stash} fallback={LayoutGridIcon} className="size-6" />} value={stash.name || ""} onChange={e => update("stashes", id, { name: e.target.value })}
        autoFocus={fresh} onFocus={e => fresh && e.target.select()} aria-label="Название стэша">
        {(!isMine(stash) || db.grants.some(g => g.coll === "stashes" && g.target === id)) && <UsersIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Общий стэш" />}
        <FileMenu x={{ ...stash, kind: "stash" }} folders={db.folders} after={() => go({ journal: true })} onShare={() => setSharing(true)} />
      </ViewHeader>
      {sharing && <ShareDialog open onOpenChange={o => !o && setSharing(false)} coll="stashes" target={id} name={stash.name} isOwner={isMine(stash)} />}
      <BoardsSheet open={boards} setOpen={setBoards} tabs={tabs} cur={cur} setTab={t => { setTab(t); setBoards(false); }} counts={t => all.filter(c => c.tab === t).length} total={all.length} onAdd={addTab} />

      <Tabs tabs={tabs} cur={cur} setTab={setTab} counts={t => all.filter(c => c.tab === t).length} total={all.length}
        onAdd={addTab} onRename={renameTab} onDelete={deleteTab} dragTab={dragTab} setDragTab={setDragTab} onDrop={dropOnTab} dragging={() => !!dragged.current} />

      <AddLine stash={id} tab={target} inputRef={addRef} />
      <Sources stash={stash} tab={target} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-lg border bg-card px-3 focus-within:ring-2 focus-within:ring-ring/40 sm:max-w-xs">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по тексту и тегам" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Очистить"><XIcon className="size-3.5 text-muted-foreground" /></button>}
        </label>
        <GridZoom />
        <Chip on={unseen} onClick={() => setUnseen(v => !v)}><EyeOffIcon className="size-3.5" />Не смотрел</Chip>
        {tagCounts.map(([t, n]) => (
          <Chip key={t} on={tags.includes(t)} onClick={() => setTags(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t])}>#{t}<span className="opacity-60">{n}</span></Chip>
        ))}
        {(tags.length > 0 || unseen || q) && <button type="button" onClick={() => { setTags([]); setUnseen(false); setQuery(""); }} className="text-xs text-muted-foreground hover:text-foreground">сбросить</button>}
      </div>

      {shown.length ? (
        <div className={cn("grid grid-flow-row-dense [grid-template-columns:repeat(var(--cm),minmax(0,1fr))] md:[grid-template-columns:repeat(auto-fill,minmax(var(--cw),1fr))]", grid.gap)}
          style={{ gridAutoRows: ROW, "--cw": grid.w + "px", "--cm": grid.m }}>
          <AnimatePresence initial={false}>
            {shown.slice(0, limit).map(c => (
              <Card key={c.id} c={c} level={grid.k} board={cur === ALL ? tabs.find(t => t.id === c.tab)?.name : null} tabs={tabs} allTags={tagCounts.map(([t]) => t)} onOpen={() => setOpen(c.id)} moveTo={t => moveTo(c, t)}
                onTag={t => setTags(s => s.includes(t) ? s : [...s, t])}
                drag={{
                  draggable: true,
                  onDragStart: e => { dragged.current = c; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/clip", c.id); },
                  onDragEnd: () => { dragged.current = null; setDragTab(null); },
                  onDragOver: e => { if (dragged.current && cur !== ALL) e.preventDefault(); },
                  onDrop: e => { e.preventDefault(); dropOnCard(c); },
                }} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="grid place-items-center rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
          {all.length ? "Ничего не нашлось по этому фильтру." : <>Вставь ссылку в строку сверху: YouTube, X, TikTok, Instagram, любой сайт.<br />Или брось картинку прямо сюда.</>}
        </div>
      )}

      {shown.length > limit && <div ref={more} className="h-10" />}
      <ClipDialog id={open} setOpen={setOpen} tabs={tabs} allTags={tagCounts.map(([t]) => t)} moveTo={moveTo} />
    </div>
  );
}

const Chip = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors", on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}>
    {children}
  </button>
);

/* ───────────── boards (tabs) ───────────── */

function Tabs({ tabs, cur, setTab, counts, total, onAdd, onRename, onDelete, dragTab, setDragTab, onDrop, dragging }) {
  const [renaming, setRenaming] = useState(null);
  return (
    <PillTabs>
      <TabBtn on={cur === ALL} onClick={() => setTab(ALL)}>Все<span className="text-xs opacity-60">{total}</span></TabBtn>
      <span className="mx-1 h-5 w-px shrink-0 bg-border" />
      {tabs.map(t => renaming === t.id ? (
        <input key={t.id} autoFocus defaultValue={t.name} onFocus={e => e.target.select()}
          onBlur={e => { onRename(t, e.target.value); setRenaming(null); }}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }}
          className="h-9 w-36 shrink-0 rounded-lg border bg-background px-3 text-sm outline-none ring-2 ring-ring/40" />
      ) : (
        <ActionsContext key={t.id} items={[
          { label: "Переименовать", icon: PencilIcon, onSelect: () => setTimeout(() => setRenaming(t.id)) },
          { sep: true },
          { label: "Удалить доску", icon: Trash2Icon, variant: "destructive", onSelect: () => onDelete(t) },
        ]}>
        <div className="group relative shrink-0"
          onDragOver={e => { if (dragging()) { e.preventDefault(); setDragTab(t.id); } }} onDragLeave={() => setDragTab(null)} onDrop={e => { e.preventDefault(); onDrop(t); }}>
          <TabBtn on={cur === t.id} drop={dragTab === t.id} onClick={() => setTab(t.id)} onDoubleClick={() => setRenaming(t.id)}>
            {t.name}<span className="text-xs opacity-60">{counts(t.id)}</span>
            {cur === t.id && (
              <ActionsDropdown align="start" items={[
                { label: "Переименовать", icon: PencilIcon, onSelect: () => setTimeout(() => setRenaming(t.id)) },
                { sep: true },
                { label: "Удалить доску", icon: Trash2Icon, variant: "destructive", onSelect: () => onDelete(t) },
              ]} trigger={<span role="button" tabIndex={0} aria-label="Действия с доской" onClick={e => e.stopPropagation()} className="-mr-1 grid size-5 place-items-center rounded hover:bg-foreground/10"><MoreHorizontalIcon className="size-3.5" /></span>} />
            )}
          </TabBtn>
        </div>
        </ActionsContext>
      ))}
      <button type="button" onClick={onAdd} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Новая доска" title="Новая доска"><PlusIcon className="size-4" /></button>
    </PillTabs>
  );
}

const TabBtn = PillTab;

/* ───────────── the one line to add things ───────────── */

function AddLine({ stash, tab, inputRef }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const file = useRef(null);

  const addFiles = async files => {
    const imgs = [...files].filter(f => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setBusy(true);
    try { for (const f of imgs) await addPhoto(stash, tab, await uploadPhoto(f, "stash")); }
    catch (e) { toast.error("Картинка не загрузилась: " + (e.message || e)); }
    setBusy(false);
  };
  const submit = async text => {
    const s = (text ?? v).trim(); if (!s) return;
    setV("");
    const links = linksIn(s);
    if (!links.length) return addText(stash, tab, s);
    for (const l of links.reverse()) await addLink(stash, tab, l);
  };

  // dropping or pasting anywhere on the page works too
  useEffect(() => {
    const paste = e => {
      if (e.target.closest?.("input, textarea, [contenteditable=true], [role=dialog]") && !e.target.closest?.("[data-addline]")) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [stash, tab]);
  useEffect(() => {
    const over = e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setOver(true); } };
    const leave = e => { if (!e.relatedTarget) setOver(false); };
    const drop = e => {
      if (![...e.dataTransfer.types].includes("Files") && !e.dataTransfer.types.includes("text/uri-list")) return;
      e.preventDefault(); setOver(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      else submit(e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"));
    };
    window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [stash, tab]);

  return (
    <div data-addline className={cn("relative flex items-center gap-2 rounded-2xl border bg-card p-1.5 pl-4 shadow-sm transition-all focus-within:ring-2 focus-within:ring-ring/40", over && "scale-[1.01] ring-2 ring-primary/60")}>
      <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
      <input ref={inputRef} value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
        placeholder={over ? "Отпускай, добавлю картинку" : "Вставь ссылку или текст"} aria-label="Добавить в стэш"
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70" />
      <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" onClick={() => file.current?.click()} title="Добавить картинку с устройства" aria-label="Добавить картинку"
        className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground">
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
      </button>
      <button type="button" onClick={() => submit()} disabled={!v.trim()} aria-label="Добавить" className="grid h-10 shrink-0 place-items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-30 sm:px-4"><span className="max-sm:hidden">Добавить</span><PlusIcon className="size-5 sm:hidden" /></button>
    </div>
  );
}

/* ───────────── cards ───────────── */

// masonry on a grid: each card spans as many thin rows as it is tall, so a "big" card can take two columns
const ROW = "4px";
function useRowSpan() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { el.style.gridRowEnd = "span " + Math.max(1, Math.ceil(el.firstElementChild.getBoundingClientRect().height / parseInt(ROW))); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el.firstElementChild); return () => ro.disconnect();
  }, []);
  return ref;
}
// grid density for all cards, per device: min card width on a computer, column count on a phone
const GRID = [
  { k: "l", label: "Крупно", w: 360, m: 1, gap: "gap-x-4" },
  { k: "m", label: "Обычно", w: 270, m: 2, gap: "gap-x-2.5 sm:gap-x-4" },
  { k: "s", label: "Мельче", w: 200, m: 3, gap: "gap-x-2 sm:gap-x-3" },
  { k: "xs", label: "Мелко", w: 150, m: 4, gap: "gap-x-1.5 sm:gap-x-2" },
];
let gridLevel = (() => { try { const v = +localStorage.getItem("stashGrid"); return v >= 0 && v < GRID.length ? v : 1; } catch { return 1; } })();
const gridSubs = new Set();
const setGrid = v => { gridLevel = Math.max(0, Math.min(GRID.length - 1, v)); try { localStorage.setItem("stashGrid", gridLevel); } catch {} gridSubs.forEach(f => f()); };
const useGrid = () => useSyncExternalStore(f => (gridSubs.add(f), () => gridSubs.delete(f)), () => gridLevel);

function GridZoom() {
  const g = useGrid();
  const btn = "grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center rounded-lg border bg-card" title="Размер карточек">
      <button type="button" className={btn} disabled={g >= GRID.length - 1} onClick={() => setGrid(g + 1)} aria-label="Мельче, больше карточек на экране"><ZoomOutIcon className="size-4" /></button>
      <span className="w-14 text-center text-xs text-muted-foreground select-none">{GRID[g].label}</span>
      <button type="button" className={btn} disabled={g <= 0} onClick={() => setGrid(g - 1)} aria-label="Крупнее"><ZoomInIcon className="size-4" /></button>
    </div>
  );
}
const tagOf = raw => raw.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase();

function Card({ c, level, board, onOpen, drag, onTag, tabs, moveTo, allTags }) {
  const span = useRowSpan();
  const small = level === "s" || level === "xs", tiny = level === "xs", size = level;
  const [dragging, setDragging] = useState(false);
  const [grab, setGrab] = useState(true);
  const toggleSeen = () => update("clips", c.id, { watched: !c.watched });
  const items = [
          { label: "Открыть", icon: PencilIcon, onSelect: onOpen },
          c.url && { label: "Открыть оригинал", icon: ExternalLinkIcon, onSelect: () => window.open(c.url, "_blank", "noopener") },
          tabs.length > 1 && { label: "На доску", icon: ArrowRightLeftIcon, sub: tabs.map(t => ({ label: t.name, disabled: t.id === c.tab, onSelect: () => moveTo(t.id) })) },
          { label: "Размер карточек", icon: MaximizeIcon, sub: GRID.map((g, i) => ({ label: g.label, active: level === g.k, onSelect: () => setGrid(i) })) },
          { label: c.watched ? "Вернуть в очередь" : "Посмотрел", icon: c.watched ? EyeOffIcon : EyeIcon, onSelect: toggleSeen },
          { sep: true },
          { label: "Удалить", icon: Trash2Icon, variant: "destructive", onSelect: () => delClip(c) },
        ].filter(Boolean);
  const hasMedia = c.provider !== "note" && c.provider !== "link" || c.thumb;
  return (
    <div ref={span} className="self-start">
    <div className={cn("pb-2.5 sm:pb-4", small && "pb-2 sm:pb-3", tiny && "pb-1.5 sm:pb-2")}>
    <ActionsContext items={items}>
    <motion.article layout="position"
      initial={{ opacity: 0, y: -60, scale: 0.7, rotate: -4 }} animate={{ opacity: dragging ? 0.4 : 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }} transition={{ type: "spring", stiffness: 260, damping: 22 }}
      {...drag} draggable={grab} onDragStart={e => { setDragging(true); drag.onDragStart(e); }} onDragEnd={e => { setDragging(false); drag.onDragEnd(e); }}
      className="group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-lg sm:rounded-2xl">
      {hasMedia && <div className={cn(tiny && "max-h-56 overflow-hidden [&>*]:max-h-56")} onPointerDown={() => setGrab(false)} onPointerUp={() => setGrab(true)} onPointerLeave={() => setGrab(true)}><Preview c={c} compact /></div>}
      <div className={cn("flex flex-col gap-1.5 p-2.5 sm:p-3", small && "gap-1 p-2 sm:p-2")} onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onOpen()}>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Brand p={c.provider} />
          <span className="truncate">{c.provider === "local" ? c.path : c.author ? "@" + c.author.replace(/^@/, "") : c.host || PROVIDER[c.provider]?.name}</span>
          {board && <span className="ml-auto shrink-0 rounded bg-accent px-1.5 py-px">{board}</span>}
          {c.watched && <CheckIcon className={cn("size-3.5 shrink-0 text-emerald-500", !board && "ml-auto")} aria-label="Просмотрено" />}
        </div>
        {c.loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-3.5 animate-spin" />Достаю превью…</div>}
        {c.title && <h3 className={cn("line-clamp-3 text-[13px] leading-snug font-semibold sm:line-clamp-2 sm:text-[15px]", small && "line-clamp-1 sm:line-clamp-1 sm:text-[13px]", size === "l" && "sm:text-lg")}>{c.title}</h3>}
        {c.text && (c.provider === "note" || c.provider === "x" || !c.title) && <p className={cn("text-sm leading-snug whitespace-pre-wrap", c.provider === "note" ? "line-clamp-[12] text-[15px]" : "line-clamp-4 text-muted-foreground", small && "line-clamp-2 text-[13px]")}>{c.text}</p>}
        {c.desc && !small && <p className="line-clamp-3 text-[13px] leading-snug text-muted-foreground">{c.desc}</p>}
        {c.note && !small && <p className="flex items-center gap-1 text-xs text-muted-foreground"><FileTextIcon className="size-3" />есть заметка</p>}
        {c.tags?.length > 0 && !tiny && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {c.tags.map(t => <button key={t} type="button" onClick={e => { e.stopPropagation(); onTag(t); }} className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">#{t}</button>)}
          </div>
        )}
      </div>
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
        <button type="button" onClick={toggleSeen} title={c.watched ? "Вернуть в очередь" : "Посмотрел"} aria-label={c.watched ? "Вернуть в очередь" : "Посмотрел"}
          className="grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 max-md:hidden">{c.watched ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}</button>
        <Bubble c={c} tabs={tabs} moveTo={moveTo} allTags={allTags} onOpen={onOpen} toggleSeen={toggleSeen} />
      </div>
    </motion.article>
    </ActionsContext>
    </div>
    </div>
  );
}

// the round "⋯" bubble on a card: quick tags, size, and the usual actions in one place
function Bubble({ c, tabs, moveTo, allTags, onOpen, toggleSeen }) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState("");
  const g = useGrid();
  const tags = c.tags || [];
  const addTag = raw => { const t = tagOf(raw); if (t && !tags.includes(t)) update("clips", c.id, { tags: [...tags, t] }); setTag(""); };
  const suggest = allTags.filter(t => !tags.includes(t) && (!tag || t.includes(tag.toLowerCase()))).slice(0, 10);
  const act = f => () => { setOpen(false); f(); };
  const Row = ({ icon: Icon, children, onClick, danger }) => (
    <button type="button" onClick={onClick} className={cn("flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm hover:bg-accent", danger && "text-destructive hover:bg-destructive/10")}>
      <Icon className={cn("size-4", !danger && "text-muted-foreground")} />{children}
    </button>
  );
  return (
    <Pop.Root open={open} onOpenChange={o => { setOpen(o); if (!o) setTag(""); }}>
      <Pop.Trigger asChild>
        <button type="button" aria-label="Действия с карточкой" onClick={e => e.stopPropagation()} className="grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 max-md:size-7"><MoreHorizontalIcon className="size-4" /></button>
      </Pop.Trigger>
      <Pop.Portal>
        <Pop.Content align="end" sideOffset={6} collisionPadding={12} onClick={e => e.stopPropagation()} onOpenAutoFocus={e => { if (matchMedia("(pointer: coarse)").matches) e.preventDefault(); }}
          className="z-50 flex w-72 max-w-[calc(100vw-24px)] flex-col gap-3 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-xl origin-(--radix-popover-content-transform-origin) data-[state=open]:animate-[menu-in_120ms_ease-out]">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><TagIcon className="size-3.5" />Теги</div>
            <div className="flex flex-wrap gap-1">
              {tags.map(t => (
                <span key={t} className="inline-flex h-7 items-center gap-0.5 rounded-full bg-accent pr-1 pl-2.5 text-xs font-medium">#{t}
                  <button type="button" onClick={() => update("clips", c.id, { tags: tags.filter(x => x !== t) })} aria-label={"Убрать тег " + t} className="grid size-5 place-items-center rounded-full hover:bg-foreground/10"><XIcon className="size-3" /></button>
                </span>
              ))}
              <input value={tag} onChange={e => setTag(e.target.value)} placeholder="+ тег" aria-label="Новый тег" enterKeyHint="done"
                onKeyDown={e => { if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); addTag(tag); } if (e.key === "Backspace" && !tag && tags.length) update("clips", c.id, { tags: tags.slice(0, -1) }); }}
                className="h-7 min-w-20 flex-1 rounded-full border border-dashed bg-transparent px-2.5 text-xs outline-none focus:border-solid" />
            </div>
            {suggest.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {suggest.map(t => <button key={t} type="button" onClick={() => addTag(t)} className="h-6 rounded-full border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">+ #{t}</button>)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MaximizeIcon className="size-3.5" />Размер всех карточек</div>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {GRID.map((g, i) => (
                <button key={g.k} type="button" onClick={() => setGrid(i)}
                  className={cn("h-7 flex-1 rounded-md text-xs transition-colors", g === i ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>{g.label}</button>
              ))}
            </div>
          </div>
          {tabs.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ArrowRightLeftIcon className="size-3.5" />На доску</div>
              <div className="flex flex-wrap gap-1">
                {tabs.map(t => <button key={t.id} type="button" disabled={t.id === c.tab} onClick={act(() => moveTo(t.id))}
                  className={cn("h-7 rounded-full border px-2.5 text-xs", t.id === c.tab ? "border-transparent bg-accent font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>{t.name}</button>)}
              </div>
            </div>
          )}
          <div className="-mx-1 flex flex-col border-t pt-2">
            <Row icon={PencilIcon} onClick={act(onOpen)}>Открыть</Row>
            {c.url && <Row icon={ExternalLinkIcon} onClick={act(() => window.open(c.url, "_blank", "noopener"))}>Открыть оригинал</Row>}
            {c.url && <Row icon={CopyIcon} onClick={act(() => navigator.clipboard?.writeText(c.url).then(() => toast("Ссылка скопирована")))}>Скопировать ссылку</Row>}
            <Row icon={c.watched ? EyeOffIcon : EyeIcon} onClick={act(toggleSeen)}>{c.watched ? "Вернуть в очередь" : "Посмотрел"}</Row>
            <Row icon={Trash2Icon} danger onClick={act(() => delClip(c))}>Удалить</Row>
          </div>
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}

function delClip(c) {
  remove("clips", c.id);
  if (c.photo?.path) deletePhoto(c.photo.path);
}

// the media itself: a cover with a play button that turns into the real player, or the video/photo right away
function Preview({ c, compact, autoplay }) {
  const [play, setPlay] = useState(!!autoplay);
  const [broken, setBroken] = useState(false);
  const [xEmbed, setXEmbed] = useState(false);
  const photoUrl = usePhotoUrl(c.photo?.path);
  const ratio = c.vertical ? 9 / 16 : c.w && c.h ? Math.max(0.5, Math.min(2.2, c.w / c.h)) : 16 / 9;
  const box = "relative w-full overflow-hidden bg-muted";
  const maxH = compact ? "max-h-[70vh]" : "max-h-[75vh]";

  if (c.provider === "local") return <LocalMedia c={c} compact={compact} autoplay={autoplay} />;
  if (c.provider === "photo") return photoUrl ? <img src={photoUrl} alt="" className={cn("block w-full object-cover", maxH)} /> : <div className={box} style={{ aspectRatio: ratio }} />;
  if (c.provider === "image") return <img src={c.url} alt="" loading="lazy" className={cn("block w-full object-cover", maxH)} />;

  // X keeps the actual video file and photos: play them right in the card
  // if X refuses the file (it sometimes blocks other sites), fall back to X's own embedded post
  if (c.provider === "x" && xEmbed) {
    return (
      <div className="relative w-full bg-black" style={{ height: compact ? 460 : 600 }} onClick={e => e.stopPropagation()}>
        <iframe src={`https://platform.twitter.com/embed/Tweet.html?id=${c.vid}&theme=dark&dnt=true&hideThread=true`} title={c.title || "Пост в X"} allow="autoplay; fullscreen" allowFullScreen className="absolute inset-0 size-full border-0" />
      </div>
    );
  }
  const video = c.video && (c.provider === "x" || c.provider === "video" || c.provider === "link");
  if (video) {
    return (
      <div className={cn(box, "bg-black")} style={{ aspectRatio: ratio }} onClick={e => e.stopPropagation()}>
        <NoRefVideo src={c.video} poster={c.thumb} autoplay={autoplay} onFail={() => c.provider === "x" && c.vid && setXEmbed(true)} />
      </div>
    );
  }
  if (c.provider === "x" && c.photos?.length > 1) {
    return (
      <div className="grid grid-cols-2 gap-0.5 bg-muted">
        {c.photos.slice(0, 4).map(p => <img key={p} src={p} alt="" loading="lazy" className="aspect-square w-full object-cover" />)}
      </div>
    );
  }

  const embed = embedUrl(c, true);
  if (play && embed) {
    return (
      <div className={cn(box, "bg-black", c.provider === "instagram" && "bg-white")} style={{ aspectRatio: c.provider === "instagram" ? (c.vertical ? 9 / 16 : 4 / 5) : ratio }} onClick={e => e.stopPropagation()}>
        <iframe src={embed} title={c.title || "Видео"} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 size-full border-0" />
      </div>
    );
  }
  const thumb = !broken && (c.thumb || (c.provider === "youtube" ? `https://i.ytimg.com/vi/${c.vid}/hqdefault.jpg` : ""));
  if (!thumb && !embed) return null;
  return (
    <button type="button" onClick={e => { e.stopPropagation(); if (embed) setPlay(true); else if (c.url) window.open(c.url, "_blank", "noopener"); }}
      className={cn(box, "group/p block")} style={{ aspectRatio: thumb ? ratio : 16 / 9 }} aria-label={embed ? "Смотреть" : "Открыть"}>
      {thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover/p:scale-105"
        onError={() => { setBroken(true); if (c.url && c.provider !== "youtube") refresh(c.id, c.url); }} />
        : <div className="absolute inset-0 grid place-items-center" style={{ background: `linear-gradient(135deg, ${PROVIDER[c.provider]?.color}55, transparent)` }}><Brand p={c.provider} size={36} /></div>}
      {embed && (
        <span className="absolute inset-0 grid place-items-center bg-black/10 transition-colors group-hover/p:bg-black/25">
          <span className="grid size-11 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition-transform group-hover/p:scale-110 sm:size-14"><PlayIcon className="ml-0.5 size-5 fill-current sm:size-6" /></span>
        </span>
      )}
    </button>
  );
}

// X serves its video files only when the request doesn't name another site, and <video> can't drop the Referer itself,
// so the player sits in a tiny frame whose page asks for no referrer
function NoRefVideo({ src, poster, autoplay, onFail }) {
  const ref = useRef(null);
  useEffect(() => {
    const on = e => { if (e.source === ref.current?.contentWindow && e.data === "stash-video-error") onFail(); };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  const esc = v => String(v || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const doc = `<!doctype html><meta name="referrer" content="no-referrer"><style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain;display:block}</style>
<video src="${esc(src)}" ${poster ? `poster="${esc(poster)}"` : ""} controls playsinline preload="none" ${autoplay ? "autoplay" : ""} onerror="parent.postMessage('stash-video-error','*')"></video>`;
  return <iframe ref={ref} srcDoc={doc} title="Видео" referrerPolicy="no-referrer" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 size-full border-0" />;
}

// small platform marks (lucide has no brand icons)
function Brand({ p, size = 14 }) {
  const s = { width: size, height: size };
  if (p === "youtube") return <svg viewBox="0 0 24 24" style={s} className="shrink-0"><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#ff0033" /><path d="M10 8.7v6.6l5.6-3.3z" fill="#fff" /></svg>;
  if (p === "x") return <svg viewBox="0 0 24 24" style={s} className="shrink-0 fill-foreground"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" /></svg>;
  if (p === "tiktok") return <svg viewBox="0 0 24 24" style={s} className="shrink-0"><path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.1a6.4 6.4 0 1 0 5.4 6.3V8.6a8 8 0 0 0 4.4 1.4V6.6A4.4 4.4 0 0 1 16.6 2z" fill="#ff0050" transform="translate(.6 .4)" /><path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.1a6.4 6.4 0 1 0 5.4 6.3V8.6a8 8 0 0 0 4.4 1.4V6.6A4.4 4.4 0 0 1 16.6 2z" fill="#25f4ee" transform="translate(-.4 -.4)" /><path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.1a6.4 6.4 0 1 0 5.4 6.3V8.6a8 8 0 0 0 4.4 1.4V6.6A4.4 4.4 0 0 1 16.6 2z" className="fill-foreground" /></svg>;
  if (p === "instagram") return <svg viewBox="0 0 24 24" style={s} className="shrink-0" fill="none" stroke="#e1306c" strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="#e1306c" /></svg>;
  if (p === "local") return <HardDriveIcon style={s} className="shrink-0" />;
  const Icon = p === "photo" || p === "image" ? ImageIcon : p === "note" ? StickyNoteIcon : p === "video" || p === "vimeo" ? PlayIcon : LinkIcon;
  return <Icon style={s} className="shrink-0" />;
}

/* ───────────── card details ───────────── */

function ClipDialog({ id, setOpen, tabs, allTags, moveTo }) {
  const db = useDb();
  const c = db.clips.find(x => x.id === id);
  const [tag, setTag] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  useEffect(() => { setTag(""); setNoteOpen(!!c?.note); }, [id]);
  if (!c) return <Dialog open={false} onOpenChange={() => setOpen(null)} />;
  const save = f => update("clips", c.id, f);
  const addTag = raw => {
    const t = raw.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase();
    if (t && !c.tags?.includes(t)) save({ tags: [...(c.tags || []), t] });
    setTag("");
  };
  const suggest = allTags.filter(t => !c.tags?.includes(t) && (!tag || t.includes(tag.toLowerCase()))).slice(0, 8);

  return (
    <Dialog open={!!id} onOpenChange={o => !o && setOpen(null)}>
      <DialogContent className="max-h-[94dvh] grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto p-0 sm:max-w-3xl max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-2xl max-sm:pb-[env(safe-area-inset-bottom)]">
        <DialogTitle className="sr-only">{c.title || "Карточка"}</DialogTitle>
        {(c.provider !== "note" && c.provider !== "link") || c.thumb ? <div className="overflow-hidden rounded-t-lg max-sm:rounded-t-2xl"><Preview key={c.id} c={c} autoplay={c.provider !== "x"} /></div> : null}
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Brand p={c.provider} /><span className="truncate">{c.author ? "@" + c.author.replace(/^@/, "") : c.host || PROVIDER[c.provider]?.name}</span>
            {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 hover:text-foreground">оригинал<ExternalLinkIcon className="size-3.5" /></a>}
          </div>
          <input value={c.title || ""} onChange={e => save({ title: e.target.value })} placeholder="Название" aria-label="Название"
            className="-mt-2 w-full bg-transparent text-xl leading-snug font-semibold outline-none placeholder:text-muted-foreground/50" />
          {c.text && c.provider !== "note" && <p className="-mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{c.text}</p>}
          {c.provider === "note" && (
            <textarea value={c.text || ""} onChange={e => save({ text: e.target.value })} rows={4} aria-label="Текст"
              className="w-full resize-y rounded-lg border bg-background p-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-ring/40" />
          )}
          <textarea value={c.desc || ""} onChange={e => save({ desc: e.target.value })} rows={2} placeholder="Короткое описание: зачем сохранил, что посмотреть"
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50" aria-label="Описание" />

          <div className="flex flex-wrap items-center gap-1.5">
            <TagIcon className="size-4 text-muted-foreground" />
            {c.tags?.map(t => (
              <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-accent pr-1 pl-2.5 text-xs font-medium">#{t}
                <button type="button" onClick={() => save({ tags: c.tags.filter(x => x !== t) })} aria-label={"Убрать тег " + t} className="grid size-5 place-items-center rounded-full hover:bg-foreground/10"><XIcon className="size-3" /></button>
              </span>
            ))}
            <input value={tag} onChange={e => setTag(e.target.value)} placeholder="+ тег" aria-label="Новый тег"
              onKeyDown={e => { if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); addTag(tag); } if (e.key === "Backspace" && !tag && c.tags?.length) save({ tags: c.tags.slice(0, -1) }); }}
              className="h-7 w-24 rounded-full border border-dashed bg-transparent px-2.5 text-xs outline-none focus:w-32 focus:border-solid" />
            {suggest.map(t => <button key={t} type="button" onClick={() => addTag(t)} className="h-7 rounded-full px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">#{t}</button>)}
          </div>

          <div className="rounded-xl border">
            <button type="button" onClick={() => setNoteOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium">
              <FileTextIcon className="size-4 text-muted-foreground" />Заметка<span className="ml-auto text-xs text-muted-foreground">{noteOpen ? "свернуть" : c.note ? "показать" : "добавить"}</span>
            </button>
            {noteOpen && (
              <div className="border-t px-1 pb-2">
                <Suspense fallback={<p className="p-3 text-sm text-muted-foreground">Открываю редактор…</p>}>
                  <Editor key={c.id} foldKey={"fold:clip:" + c.id} value={c.note || ""} onChange={note => save({ note })} />
                </Suspense>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => save({ watched: !c.watched })}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium", c.watched ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "hover:bg-accent")}>
              {c.watched ? <><CheckIcon className="size-4" />Просмотрено</> : <><EyeIcon className="size-4" />Отметить просмотренным</>}
            </button>
            {tabs.length > 1 && (
              <select value={c.tab} onChange={e => moveTo(c, e.target.value)} aria-label="Доска" className="h-9 rounded-lg border bg-background px-2 text-sm">
                {tabs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button type="button" onClick={async () => { if (await confirmAction({ title: "Удалить карточку?" })) { setOpen(null); delClip(c); } }}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-destructive hover:bg-destructive/10"><Trash2Icon className="size-4" />Удалить</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── folders on this computer ───────────── */

function Sources({ stash, tab }) {
  useFolders();
  const [busy, setBusy] = useState(false);
  const [states, setStates] = useState({});
  const list = stash.sources || [];
  useEffect(() => { let on = true; Promise.all(list.map(async s => [s.id, await access(s.id)])).then(r => on && setStates(Object.fromEntries(r))); return () => { on = false; }; }, [list.length, busy]);
  const pick = useRef(null);
  const [open, setOpen] = useState(null);
  // browsers that can't keep a folder (Firefox, Safari, Brave without the flag): browse the picked files for this visit only
  const browseOnce = files => {
    const list = [...files].filter(f => /^(image|video)\//.test(f.type));
    if (!list.length) return toast("В папке нет картинок и видео");
    const root = (list[0].webkitRelativePath || "").split("/")[0] || "Папка";
    setOpen({ id: "mem:" + root, name: root, mem: list });
  };
  const connect = async () => {
    if (!canUseFolders) return pick.current?.click();
    try { setBusy(true); const r = await addFolder(stash.id, tab); setOpen({ id: r.id, name: r.name }); }
    catch (e) { if (e?.name !== "AbortError") toast.error("Не получилось: " + (e.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {list.map(s => {
        const st = states[s.id];
        return (
          <button key={s.id} type="button" onClick={() => setOpen(s)} className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            title={st === "missing" ? "Папка подключена на другом устройстве" : "Открыть папку: смотреть файлы и отправлять выбранные в стэш"}>
            <FolderOpenIcon className="size-3.5" />{s.name}
            {st === "prompt" && <LockIcon className="size-3" />}
            {st === "missing" && <span className="opacity-70">на другом устройстве</span>}
          </button>
        );
      })}
      <input ref={pick} type="file" webkitdirectory="" multiple className="hidden" onChange={e => browseOnce(e.target.files)} onClick={e => { e.currentTarget.value = ""; }} />
      {open && <Suspense fallback={null}><FolderPortal stash={stash} source={open} mem={open.mem} tab={tab} onClose={() => setOpen(null)} /></Suspense>}
      <button type="button" onClick={connect} disabled={busy} title={canUseFolders ? "Папка читается прямо с диска; в облако попадает только то, что выберешь" : "Этот браузер не запоминает папки: её придётся выбирать каждый раз. В облако попадает только то, что выберешь"}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2.5 text-muted-foreground hover:text-foreground">
        {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <FolderPlusIcon className="size-3.5" />}{canUseFolders ? "Подключить папку с компьютера" : "Открыть папку с компьютера"}
      </button>
    </div>
  );
}

// a file from a connected folder; asks for access again after the browser restarts
function LocalMedia({ c, compact, autoplay }) {
  useFolders();
  const [r, setR] = useState(null);
  useEffect(() => { let on = true; fileUrl(c).then(x => on && setR(x)); return () => { on = false; }; });
  const maxH = compact ? "max-h-[70vh]" : "max-h-[75vh]";
  if (r?.url) return c.video
    ? <div onClick={e => e.stopPropagation()}><video src={r.url} controls playsInline autoPlay={!!autoplay} preload="metadata" className={cn("block w-full bg-black", maxH)} /></div>
    : <img src={r.url} alt={c.name} className={cn("block w-full object-cover", maxH)} />;
  return (
    <div className="grid aspect-[4/3] place-items-center gap-2 bg-muted p-4 text-center text-xs text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <HardDriveIcon className="size-6" />
        <span className="line-clamp-2 break-all">{c.name}</span>
        {r?.state === "prompt" && <button type="button" onClick={e => { e.stopPropagation(); allow(c.source); }} className="rounded-full bg-foreground px-3 py-1 font-medium text-background">Разрешить доступ к папке</button>}
        {r?.state === "missing" && <span>Файл лежит на другом устройстве</span>}
        {r?.state === "gone" && <span>Файл удалён или перемещён</span>}
      </div>
    </div>
  );
}

// phone: pick a board from the bottom bar
function BoardsSheet({ open, setOpen, tabs, cur, setTab, counts, total, onAdd }) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-2 p-4 sm:max-w-sm max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-2xl max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DialogTitle className="px-1 pb-1 text-base">Доски</DialogTitle>
        {[{ id: ALL, name: "Все", n: total }, ...tabs.map(t => ({ ...t, n: counts(t.id) }))].map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px]", cur === t.id ? "bg-foreground font-medium text-background" : "hover:bg-accent")}>
            <Columns3Icon className="size-4 opacity-60" /><span className="flex-1 truncate">{t.name}</span><span className="text-sm opacity-60">{t.n}</span>
          </button>
        ))}
        <button type="button" onClick={() => { onAdd(); setOpen(false); }} className="flex h-11 items-center gap-3 rounded-xl border border-dashed px-3 text-[15px] text-muted-foreground"><PlusIcon className="size-4" />Новая доска</button>
      </DialogContent>
    </Dialog>
  );
}
