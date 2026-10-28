import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeftIcon, ChevronRightIcon, ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { update, getDb } from "@/lib/db";
import { uploadPhoto, usePhotoUrl, deletePhoto } from "@/lib/photos";
import { useBackClose } from "@/lib/back";
import { cn } from "@/lib/utils";

// a card can hold several pictures: the photo it was made from (if any) plus `pics` added later.
// On the card they show as a row of thumbnails; tapping one opens a full-screen viewer you swipe through.
export const gallery = c => [...(c.provider === "photo" && c.photo ? [c.photo] : []), ...(c.pics || [])];

// the viewer is mounted once in the shell; anything can open it with a list of pictures ({ path } in storage, or { src })
let openViewer = () => {};
export const viewPics = (c, at = 0) => openViewer({ list: gallery(c), at });
export const viewImages = (srcs, at = 0) => openViewer({ list: srcs.map(src => ({ src, path: src })), at });

function Thumb({ p, className, onClick, children }) {
  const signed = usePhotoUrl(p.src ? null : p.path), url = p.src || signed;
  return (
    <button type="button" onClick={onClick} className={cn("relative overflow-hidden rounded-lg bg-muted", className)}>
      {url && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
      {children}
    </button>
  );
}

// thumbnails on the card itself (only the extra pictures; the main one is already the card's cover)
export function PicsRow({ c, small }) {
  const pics = c.pics || [];
  if (!pics.length) return null;
  const off = gallery(c).length - pics.length, max = small ? 3 : 4;
  return (
    <div className="grid grid-cols-4 gap-1" onClick={e => e.stopPropagation()}>
      {pics.slice(0, max).map((p, k) => (
        <Thumb key={p.path} p={p} className="aspect-square" onClick={() => viewPics(c, off + k)}>
          {k === max - 1 && pics.length > max && <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">+{pics.length - max + 1}</span>}
        </Thumb>
      ))}
    </div>
  );
}

// upload pictures into a card one by one (each lands as soon as it is up); `onLeft` counts down
export async function addPics(id, files, onLeft = () => {}) {
  const imgs = [...files].filter(f => f.type.startsWith("image/"));
  if (!imgs.length) return;
  onLeft(imgs.length);
  try {
    for (const f of imgs) {
      const p = await uploadPhoto(f, "stash");
      const cur = getDb().clips.find(x => x.id === id)?.pics || [];
      await update("clips", id, { pics: [...cur, p] });
      onLeft(n => n - 1);
    }
  } catch (e) { toast.error("Не загрузилось: " + (e.message || e)); }
  onLeft(0);
}

// in the card's window: all pictures, add more (several at once), remove one
export function PicsEditor({ c }) {
  const [busy, setBusy] = useState(0);
  const file = useRef(null);
  // Ctrl+V with a picture anywhere in the open card adds it here
  useEffect(() => {
    const on = e => {
      const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault(); addFiles(files);
    };
    window.addEventListener("paste", on); return () => window.removeEventListener("paste", on);
  }, [c.id]);
  const all = gallery(c), off = all.length - (c.pics || []).length;
  const addFiles = files => addPics(c.id, files, setBusy);
  const drop = p => { update("clips", c.id, { pics: (c.pics || []).filter(x => x.path !== p.path) }); deletePhoto(p.path); };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5">
        {all.map((p, k) => (
          <div key={p.path} className="group relative">
            <Thumb p={p} className="aspect-square w-full" onClick={() => viewPics(c, k)} />
            {k >= off && <button type="button" onClick={() => drop(p)} aria-label="Убрать картинку"
              className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 max-md:opacity-100"><XIcon className="size-3.5" /></button>}
          </div>
        ))}
        <button type="button" onClick={() => file.current?.click()} disabled={busy > 0}
          className="grid aspect-square place-items-center rounded-lg border border-dashed text-muted-foreground hover:bg-accent hover:text-foreground">
          {busy ? <span className="flex flex-col items-center gap-1 text-xs"><Loader2Icon className="size-5 animate-spin" />{busy}</span> : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlusIcon className="size-5" />добавить</span>}
        </button>
      </div>
      <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function Slide({ p }) {
  const signed = usePhotoUrl(p.src ? null : p.path), url = p.src || signed;
  return url ? <img src={url} alt="" draggable={false} className="max-h-full max-w-full rounded-md object-contain select-none" /> : <Loader2Icon className="size-6 animate-spin text-white/60" />;
}

// full-screen viewer: swipe or arrows, Esc / back closes
export function PicsViewer() {
  const [st, setSt] = useState(null);
  useEffect(() => { openViewer = setSt; return () => { openViewer = () => {}; }; }, []);
  const list = st?.list || [];
  const at = Math.min(st?.at || 0, Math.max(0, list.length - 1));
  const [dir, setDir] = useState(0);
  const go = d => { if (at + d < 0 || at + d >= list.length) return; setDir(d); setSt(s => ({ ...s, at: at + d })); };
  const close = () => setSt(null);
  useBackClose(!!st, close);
  useEffect(() => {
    if (!st) return;
    const k = e => { if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") close(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  return createPortal(
    <AnimatePresence>
      {st && list.length > 0 && (
        <motion.div key="v" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}
          className="fixed inset-0 z-[100] flex flex-col bg-black/92" style={{ backdropFilter: "blur(6px)" }}>
          <div className="flex items-center justify-between p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-sm text-white/80">
            <span className="tabular-nums">{at + 1} / {list.length}</span>
            <button type="button" onClick={close} aria-label="Закрыть" className="grid size-10 place-items-center rounded-full hover:bg-white/10"><XIcon className="size-5" /></button>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={dir}>
              <motion.div key={at + list[at].path.slice(-40)} custom={dir} className="absolute inset-0 grid place-items-center px-2"
                initial={{ x: dir * 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -dir * 300, opacity: 0 }} transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                drag={list.length > 1 ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.6}
                onDragEnd={(e, i) => { if (i.offset.x < -60 || i.velocity.x < -400) go(1); else if (i.offset.x > 60 || i.velocity.x > 400) go(-1); }}
                onClick={e => e.stopPropagation()}>
                <Slide p={list[at]} />
              </motion.div>
            </AnimatePresence>
            {at > 0 && <button type="button" onClick={e => { e.stopPropagation(); go(-1); }} aria-label="Назад" className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 max-md:hidden"><ChevronLeftIcon className="size-6" /></button>}
            {at < list.length - 1 && <button type="button" onClick={e => { e.stopPropagation(); go(1); }} aria-label="Дальше" className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 max-md:hidden"><ChevronRightIcon className="size-6" /></button>}
          </div>
          {list.length > 1 && (
            <div className="flex justify-center gap-1.5 overflow-x-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
              {list.map((p, k) => <Thumb key={k} p={p} onClick={() => { setDir(k > at ? 1 : -1); setSt(s => ({ ...s, at: k })); }}
                className={cn("size-12 shrink-0 transition-opacity", k === at ? "ring-2 ring-white" : "opacity-50 hover:opacity-90")} />)}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
