import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloudIcon, CloudUploadIcon, FilmIcon, FolderOpenIcon, Loader2Icon, LockIcon, RefreshCwIcon,
  SearchIcon, TagIcon, XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { update } from "@/lib/db";
import { addPhoto } from "@/lib/stash";
import { uploadPhoto } from "@/lib/photos";
import { access, allow, listFiles, loadTags, saveTags, thumbOf } from "@/lib/localFolders";
import { cn } from "@/lib/utils";
import { useBackClose } from "@/lib/back";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const UP = "\u0000uploaded"; // paths already sent to the stash, kept with the local tags
const norm = t => t.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");

// a folder on this computer, browsed in place: only the visible tiles exist in the page,
// thumbnails are made on the device, and nothing leaves the computer until "В стэш" is pressed
export default function FolderPortal({ stash, source, mem, tab, onClose }) {
  const [state, setState] = useState("loading");
  const [files, setFiles] = useState([]);
  const [tags, setTagsRaw] = useState({});
  const [sel, setSel] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [dir, setDir] = useState("");
  const [tagF, setTagF] = useState("");
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(0);
  useBackClose(view != null, () => setView(null));
  const last = useRef(null);

  const load = async force => {
    setState("loading");
    if (mem) {
      // files picked for this visit only (no folder access in this browser)
      const list = mem.map(f => { const path = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name;
        return { path, h: { getFile: async () => f }, name: f.name, dir: path.split("/").slice(0, -1).join("/"), video: f.type.startsWith("video/"), size: f.size, mtime: f.lastModified }; })
        .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      setFiles(list); setTagsRaw(await loadTags(source.id)); return setState("ready");
    }
    const a = await access(source.id);
    if (a !== "granted") return setState(a);
    const [list, t] = await Promise.all([listFiles(source.id, force), loadTags(source.id)]);
    setFiles(list || []); setTagsRaw(t); setState("ready");
  };
  useEffect(() => { load(); }, [source.id]);
  const setTags = map => { setTagsRaw(map); saveTags(source.id, map); };

  const dirs = useMemo(() => {
    const m = new Map();
    for (const f of files) { const top = f.dir.split("/")[0]; if (top) m.set(top, (m.get(top) || 0) + 1); }
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [files]);
  const allTags = useMemo(() => {
    const m = new Map();
    for (const [k, v] of Object.entries(tags)) if (k !== UP) for (const t of v) m.set(t, (m.get(t) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [tags]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => files.filter(f =>
    (!dir || f.dir === dir || f.dir.startsWith(dir + "/")) &&
    (!tagF || tags[f.path]?.includes(tagF)) &&
    (!q || f.path.toLowerCase().includes(q) || tags[f.path]?.some(t => t.includes(q)))), [files, dir, tagF, q, tags]);
  const uploaded = useMemo(() => new Set(tags[UP] || []), [tags]);

  const toggle = (f, e) => {
    const n = new Set(sel);
    if (e?.shiftKey && last.current != null) {
      const a = shown.findIndex(x => x.path === last.current), b = shown.findIndex(x => x.path === f.path);
      for (const x of shown.slice(Math.min(a, b), Math.max(a, b) + 1)) n.add(x.path);
    } else n.has(f.path) ? n.delete(f.path) : n.add(f.path);
    last.current = f.path; setSel(n);
  };
  const tagPaths = (paths, t, on) => {
    const map = { ...tags };
    for (const p of paths) { const cur = map[p] || []; map[p] = on ? [...new Set([...cur, t])] : cur.filter(x => x !== t); if (!map[p].length) delete map[p]; }
    setTags(map);
  };

  // the one way out of the folder: chosen pictures become stash cards (shrunk to webp, ~200–400 KB each)
  const send = async paths => {
    const list = files.filter(f => paths.includes(f.path));
    const imgs = list.filter(f => !f.video), vids = list.length - imgs.length;
    if (!imgs.length) return toast("Видео в облако не загружаются: в хранилище только картинки до 5 МБ");
    setBusy(imgs.length);
    const done = [];
    for (const f of imgs) {
      try {
        const id = await addPhoto(stash.id, tab, await uploadPhoto(await f.h.getFile(), "stash"));
        if (id) await update("clips", id, { title: f.name.replace(/\.[^.]+$/, ""), tags: [...new Set([...f.dir.split("/").filter(Boolean).map(norm), ...(tags[f.path] || [])])] });
        done.push(f.path);
      } catch (e) { toast.error(`${f.name}: ${e.message || e}`); }
      setBusy(b => b - 1);
    }
    setTags({ ...tags, [UP]: [...new Set([...(tags[UP] || []), ...done])] });
    setSel(new Set());
    toast(`В стэш добавлено: ${done.length}` + (vids ? `. Видео пропущены: ${vids}` : ""));
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none" style={{ top: 0, left: 0 }}>
        <DialogTitle className="sr-only">Папка {source.name}</DialogTitle>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 pr-12">
          <FolderOpenIcon className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-semibold">{source.name}</div>
            <div className="text-xs text-muted-foreground">{mem ? "Открыта на этот раз" : "Папка на этом компьютере"} · {state === "ready" ? `${shown.length} из ${files.length}` : "…"} · в облако только то, что отправишь</div>
          </div>
          <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-3 focus-within:ring-2 focus-within:ring-ring/40 sm:w-64">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Имя файла или тег" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <button type="button" onClick={() => load(true)} title="Перечитать папку" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent"><RefreshCwIcon className={cn("size-4", state === "loading" && "animate-spin")} /></button>
        </div>
        {(dirs.length > 0 || allTags.length > 0) && (
          <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2 [scrollbar-width:none]">
            <Chip on={!dir && !tagF} onClick={() => { setDir(""); setTagF(""); }}>Все</Chip>
            {dirs.map(([d, n]) => <Chip key={d} on={dir === d} onClick={() => setDir(dir === d ? "" : d)}><FolderOpenIcon className="size-3" />{d}<span className="opacity-60">{n}</span></Chip>)}
            {allTags.map(([t, n]) => <Chip key={t} on={tagF === t} onClick={() => setTagF(tagF === t ? "" : t)}>#{t}<span className="opacity-60">{n}</span></Chip>)}
          </div>
        )}

        {state === "loading" && <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />Читаю папку…</div>}
        {state === "prompt" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <LockIcon className="size-6" />Браузер просит заново разрешить доступ к папке.
            <button type="button" onClick={async () => { if (await allow(source.id)) load(); }} className="h-9 rounded-lg bg-primary px-4 font-medium text-primary-foreground">Разрешить</button>
          </div>
        )}
        {state === "missing" && <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">Эта папка подключена на другом компьютере или в другом браузере.</div>}
        {state === "ready" && (
          <VirtualGrid items={shown} render={f => (
            <Tile f={f} selected={sel.has(f.path)} selecting={sel.size > 0} cloud={uploaded.has(f.path)} tags={tags[f.path]}
              onToggle={e => toggle(f, e)} onOpen={() => setView(shown.indexOf(f))} />
          )} />
        )}

        {sel.size > 0 && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
            <span className="text-sm font-medium">Выбрано: {sel.size}</span>
            <button type="button" onClick={() => setSel(new Set(shown.map(f => f.path)))} className="text-sm text-muted-foreground hover:text-foreground">все {shown.length}</button>
            <button type="button" onClick={() => setSel(new Set())} className="text-sm text-muted-foreground hover:text-foreground">снять</button>
            <TagAdder onAdd={t => tagPaths([...sel], t, true)} suggest={allTags.map(([t]) => t)} />
            <button type="button" disabled={!!busy} onClick={() => send([...sel])}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {busy ? <><Loader2Icon className="size-4 animate-spin" />Осталось {busy}</> : <><CloudUploadIcon className="size-4" />В стэш</>}
            </button>
          </div>
        )}

        {view != null && shown[view] && (
          <Viewer f={shown[view]} tags={tags[shown[view].path] || []} cloud={uploaded.has(shown[view].path)} suggest={allTags.map(([t]) => t)}
            onTag={(t, on) => tagPaths([shown[view].path], t, on)} onSend={() => send([shown[view].path])} busy={!!busy}
            prev={view > 0 ? () => setView(view - 1) : null} next={view < shown.length - 1 ? () => setView(view + 1) : null} onClose={() => setView(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const Chip = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap", on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}>
    {children}
  </button>
);

// only the rows in view (plus a margin) are in the page, so thousands of files scroll smoothly
function VirtualGrid({ items, render }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { box.current?.scrollTo({ top: 0 }); }, [items]);
  const gap = 6, pad = 12, inner = Math.max(0, size.w - pad * 2);
  const cols = Math.max(3, Math.floor((inner + gap) / ((size.w < 640 ? 110 : 170) + gap)));
  const cell = (inner - gap * (cols - 1)) / cols, row = cell + gap;
  const rows = Math.ceil(items.length / cols);
  const from = Math.max(0, Math.floor(top / row) - 3), to = Math.min(rows, Math.ceil((top + size.h) / row) + 3);
  const vis = [];
  for (let r = from; r < to; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (i < items.length) vis.push([i, r, c]); }
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-y-auto" onScroll={e => setTop(e.currentTarget.scrollTop)}>
      {!items.length && <p className="p-8 text-center text-sm text-muted-foreground">Ничего не нашлось</p>}
      <div style={{ height: rows * row + pad * 2 + 80, position: "relative" }}>
        {size.w > 0 && vis.map(([i, r, c]) => (
          <div key={items[i].path} style={{ position: "absolute", width: cell, height: cell, top: pad + r * row, left: pad + c * (cell + gap) }}>{render(items[i])}</div>
        ))}
      </div>
    </div>
  );
}

function useThumb(f) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let on = true; thumbOf(f).then(u => on && setUrl(u)); return () => { on = false; }; }, [f.path]);
  return url;
}

function Tile({ f, selected, selecting, cloud, tags, onToggle, onOpen }) {
  const url = useThumb(f);
  return (
    <div className={cn("group relative size-full overflow-hidden rounded-lg bg-muted", selected && "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-background")}>
      <button type="button" className="size-full" onClick={e => (selecting || e.shiftKey || e.ctrlKey || e.metaKey) ? onToggle(e) : onOpen()} title={f.path}>
        {url ? <img src={url} alt="" draggable={false} className={cn("size-full object-cover transition-transform duration-300", selected ? "scale-90 rounded-md" : "group-hover:scale-105")} />
          : url === "" ? <span className="grid size-full place-items-center p-2 text-[10px] break-all text-muted-foreground">{f.video ? <FilmIcon className="size-6" /> : f.name}</span>
          : <span className="block size-full animate-pulse" />}
      </button>
      <button type="button" onClick={onToggle} aria-label={selected ? "Убрать из выбранных" : "Выбрать"}
        className={cn("absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full border-2 transition-opacity", selected ? "border-transparent bg-[var(--ink)] text-white" : "border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100", selecting && "opacity-100")}>
        <CheckIcon className="size-3.5" />
      </button>
      <div className="pointer-events-none absolute right-1.5 bottom-1.5 flex gap-1">
        {f.video && <span className="grid size-5 place-items-center rounded bg-black/60 text-white"><FilmIcon className="size-3" /></span>}
        {tags?.length > 0 && <span className="grid size-5 place-items-center rounded bg-black/60 text-white"><TagIcon className="size-3" /></span>}
        {cloud && <span className="grid size-5 place-items-center rounded bg-[var(--ink)] text-white" title="Уже в стэше"><CloudIcon className="size-3" /></span>}
      </div>
    </div>
  );
}

function TagAdder({ onAdd, suggest }) {
  const [v, setV] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <input value={v} onChange={e => setV(e.target.value)} list="folder-tags" placeholder="+ тег"
        onKeyDown={e => { if (e.key === "Enter" && norm(v)) { onAdd(norm(v)); setV(""); } }}
        className="h-8 w-28 rounded-full border border-dashed bg-transparent px-3 text-xs outline-none focus:border-solid" />
      <datalist id="folder-tags">{suggest.map(t => <option key={t} value={t} />)}</datalist>
    </span>
  );
}

// one file large: picture or playing video, its tags, and sending just it
function Viewer({ f, tags, cloud, suggest, onTag, onSend, busy, prev, next, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null, on = true;
    f.h.getFile().then(file => { u = URL.createObjectURL(file); on && setUrl(u); });
    return () => { on = false; setUrl(null); if (u) URL.revokeObjectURL(u); };
  }, [f.path]);
  useEffect(() => {
    const k = e => { if (e.key === "ArrowLeft") prev?.(); if (e.key === "ArrowRight") next?.(); if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true);
  });
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black/95 text-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm" title={f.path}>{f.path}</span>
        <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-9 place-items-center rounded-full hover:bg-white/10"><XIcon className="size-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
        {url && (f.video
          ? <video key={url} src={url} controls autoPlay playsInline className="max-h-full max-w-full" onError={() => toast("Этот формат видео браузер не показывает")} />
          : <img src={url} alt="" className="max-h-full max-w-full object-contain" />)}
        {prev && <button type="button" onClick={prev} aria-label="Предыдущий" className="absolute left-2 grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><ChevronLeftIcon /></button>}
        {next && <button type="button" onClick={next} aria-label="Следующий" className="absolute right-2 grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><ChevronRightIcon /></button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {tags.map(t => (
          <span key={t} className="inline-flex h-8 items-center gap-1 rounded-full bg-white/15 pr-1 pl-3 text-xs">#{t}
            <button type="button" onClick={() => onTag(t, false)} aria-label={"Убрать тег " + t} className="grid size-6 place-items-center rounded-full hover:bg-white/20"><XIcon className="size-3" /></button>
          </span>
        ))}
        <TagAdder onAdd={t => onTag(t, true)} suggest={suggest} />
        {f.video ? <span className="ml-auto text-xs text-white/60">Видео в облако не загружаются</span> : (
          <button type="button" onClick={onSend} disabled={busy || cloud}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-60">
            {cloud ? <><CloudIcon className="size-4" />Уже в стэше</> : <><CloudUploadIcon className="size-4" />В стэш</>}
          </button>
        )}
      </div>
    </div>
  );
}
