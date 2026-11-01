import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBackClose } from "@/lib/back";
import { cn } from "@/lib/utils";

// items fan up out of a bottom-bar button in a slight arc, like a Stack in the macOS Dock
// how many items fit in the arc on this screen, so a fan never runs off the top on a short phone
// (each item is ~50px; the extra slots like «Ещё…» and «Править» are counted by the caller)
export const fanMax = (extra = 2) => Math.max(3, Math.min(9, Math.floor((window.innerHeight - 260) / 52) - extra));

export const ANCHORS = {
  navRight: { right: "calc(30% - 22px)", bottom: "calc(4.5rem + var(--sab))" },
  navLeft: { left: "calc(10% - 22px)", bottom: "calc(4.5rem + var(--sab))" },
  dock: { right: "1.5rem", bottom: "5.5rem" },
};
export function Fan({ open, setOpen, items, onPick, anchor }) {
  const style = typeof anchor === "string" ? ANCHORS[anchor] : anchor;
  const left = anchor === "navLeft" || (style && "left" in style && !("right" in style));
  useBackClose(open, () => setOpen(false));
  useEffect(() => { if (!open) return; const k = e => e.key === "Escape" && setOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  // a drum: how far an item leans depends on where it is on screen now, not on its number,
  // so a long list keeps the same gentle arc while it scrolls
  const box = useRef(null);
  const lean = () => {
    const ul = box.current; if (!ul) return;
    const r = ul.getBoundingClientRect(), sign = left ? 1 : -1;
    for (const li of ul.children) {
      const b = li.getBoundingClientRect(), d = Math.min(1, Math.max(0, (r.bottom - (b.top + b.height / 2)) / Math.max(320, r.height)));
      li.firstChild.style.transform = `translateX(${sign * d * d * 56}px) rotate(${sign * d * 9}deg)`;
    }
  };
  useEffect(() => {
    if (!open) return;
    let raf = requestAnimationFrame(function tick() { lean(); raf = requestAnimationFrame(tick); });
    const stop = setTimeout(() => cancelAnimationFrame(raf), 700); // follow the opening spring, then only on scroll
    addEventListener("resize", lean);
    return () => { cancelAnimationFrame(raf); clearTimeout(stop); removeEventListener("resize", lean); };
  }, [open, items.length]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-30">
          <motion.button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40"
            style={{ backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          {/* a long list scrolls inside the fan instead of hiding behind «Ещё…» */}
          <ul ref={box} onScroll={lean} className={cn("no-scrollbar absolute flex max-h-[calc(100dvh-7rem-var(--sab)-var(--sat))] flex-col-reverse gap-2 overflow-y-auto overscroll-contain py-2", left ? "items-start pr-20" : "items-end pl-20")} style={{ ...style, maskImage: "linear-gradient(to bottom, transparent, #000 2.5rem)", WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 2.5rem)" }}>
            {items.map((t, i) => {
              return (
                <motion.li key={t.id} style={{ originX: left ? 0 : 1, originY: 1 }}
                  initial={{ opacity: 0, y: 40 + i * 30, scale: 0.4 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 28, delay: Math.min(i, 12) * 0.025 } }}
                  exit={{ opacity: 0, y: 30 + i * 24, scale: 0.5, transition: { duration: 0.16, delay: (items.length - i) * 0.012 } }}>
                  <div style={{ transformOrigin: left ? "0 100%" : "100% 100%" }}>
                  <button type="button" onClick={() => { if (!onPick(t)) setOpen(false); }} className={cn("flex items-center gap-2.5", left && "flex-row-reverse")}>
                    <span className={cn("max-w-[60vw] truncate rounded-full px-3 py-1.5 text-sm font-medium shadow-lg transition-colors md:max-w-xs",
                      t.on ? "bg-foreground text-background" : "bg-popover/95 text-popover-foreground hover:bg-accent")}>
                      {t.name}{t.n != null && <span className="ml-1.5 opacity-60 tabular-nums">{t.n}</span>}
                    </span>
                    <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl shadow-lg ring-1 ring-black/5 transition-transform hover:scale-110",
                      t.on ? "bg-[var(--ink)] text-white" : t.dashed ? "border border-dashed bg-popover/95 text-muted-foreground" : "bg-popover text-foreground")}>
                      {t.glyph}
                    </span>
                  </button>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}
    </AnimatePresence>
  );
}

