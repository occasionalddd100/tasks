import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckIcon, ImageIcon, LayoutGridIcon, LinkIcon, Loader2Icon, StickyNoteIcon } from "lucide-react";
import { toast } from "sonner";
import { useDb } from "@/lib/db";
import { addLink, addText, addPhoto, linksIn } from "@/lib/stash";
import { uploadPhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ItemIcon } from "@/components/IconPicker";

// "Поделиться → В стэш" on Android: the app hands over what was shared (window.AndroidShare.take()),
// here you pick the stash and board, and it lands there. Remembers the last place.
const LAST = "shareTarget";
const take = () => { try { const s = window.AndroidShare?.take(); return s ? JSON.parse(s) : null; } catch { return null; } };
const toFile = (url, k) => fetch(url).then(r => r.blob()).then(b => new File([b], `shared-${k}.jpg`, { type: b.type || "image/jpeg" }));

export default function ShareInbox({ go }) {
  const db = useDb();
  const [got, setGot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(() => { try { return JSON.parse(localStorage.getItem(LAST) || "null") || {}; } catch { return {}; } });

  useEffect(() => {
    if (!window.AndroidShare) return;
    const check = () => { const x = take(); if (x && (x.text || x.images?.length)) setGot(x); };
    check();
    window.addEventListener("androidshare", check);
    return () => window.removeEventListener("androidshare", check);
  }, []);

  const stashes = db.stashes;
  const stash = stashes.find(s => s.id === target.stash) || stashes[0];
  const tabs = stash?.tabs || [];
  const tab = tabs.find(t => t.id === target.tab)?.id || tabs[0]?.id || "";
  const text = [got?.subject && !got?.text?.includes(got.subject) && !linksIn(got?.text || "").length ? got.subject : "", got?.text || ""].filter(Boolean).join("\n").trim();
  const links = linksIn(text), images = got?.images || [];

  const save = async () => {
    if (!stash || busy) return;
    setBusy(true);
    try { localStorage.setItem(LAST, JSON.stringify({ stash: stash.id, tab })); } catch {}
    try {
      for (let k = 0; k < images.length; k++) await addPhoto(stash.id, tab, await uploadPhoto(await toFile(images[k], k), "stash"));
      if (links.length) for (const l of [...links].reverse()) await addLink(stash.id, tab, l);
      else if (text) await addText(stash.id, tab, text);
      const id = stash.id;
      toast.success("Сохранено в «" + stash.name + "»", { action: { label: "Открыть", onClick: () => go({ stash: id }) } });
      setGot(null);
    } catch (e) { toast.error("Не сохранилось: " + (e.message || e)); }
    setBusy(false);
  };

  const pickStash = id => setTarget({ stash: id, tab: "" });
  const Kind = images.length ? ImageIcon : links.length ? LinkIcon : StickyNoteIcon;
  return (
    <Dialog open={!!got && db.ready} onOpenChange={o => !o && !busy && setGot(null)}>
      <DialogContent onOpenAutoFocus={e => e.preventDefault()} className="gap-3 p-4 sm:max-w-sm max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-2xl max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DialogTitle className="text-base">В стэш</DialogTitle>
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
          {images.length ? (
            <div className="flex shrink-0 -space-x-6">
              {images.slice(0, 3).map((src, k) => <img key={k} src={src} alt="" className="size-14 rounded-lg border-2 border-background object-cover shadow-sm" style={{ rotate: (k - 1) * 6 + "deg" }} />)}
            </div>
          ) : <Kind className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1 text-sm">
            {images.length > 0 && <p className="font-medium">{images.length} {images.length === 1 ? "картинка" : images.length < 5 ? "картинки" : "картинок"}</p>}
            {text && <p className="line-clamp-3 break-words text-muted-foreground">{text}</p>}
          </div>
        </div>
        {!stashes.length ? <p className="text-sm text-muted-foreground">Стэшей пока нет. Создай стэш в меню, и потом делись в него.</p> : <>
          <div className="flex flex-col gap-1">
            {stashes.map(s => (
              <button key={s.id} type="button" onClick={() => pickStash(s.id)}
                className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors", s.id === stash?.id ? "bg-foreground font-medium text-background" : "hover:bg-accent")}>
                <ItemIcon x={s} fallback={LayoutGridIcon} /><span className="flex-1 truncate">{s.name}</span>
                {s.id === stash?.id && <CheckIcon className="size-4" />}
              </button>
            ))}
          </div>
          {tabs.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {tabs.map(t => (
                <button key={t.id} type="button" onClick={() => setTarget({ stash: stash.id, tab: t.id })}
                  className={cn("h-8 rounded-full border px-3 text-[13px] font-medium", t.id === tab ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}>{t.name}</button>
              ))}
            </div>
          )}
        </>}
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={save} disabled={!stash || busy}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}Сохранить
        </motion.button>
      </DialogContent>
    </Dialog>
  );
}
