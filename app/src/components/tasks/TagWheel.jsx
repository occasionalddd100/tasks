import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, CrosshairIcon } from "lucide-react";
import { useDb } from "@/lib/db";
import { tagsOf, tagOfTask, setTag } from "@/lib/tags";
import { inFocus, toFocus, fromFocus } from "@/lib/focus";
import { useBackClose } from "@/lib/back";
import { cn } from "@/lib/utils";

// Hold a task: its tags come out in a ring around the finger. Slide onto one and let go to retag,
// or let go in the middle and tap one. The top of the ring puts the task in or out of work.
let st = null; const subs = new Set();
const emit = () => subs.forEach(f => f());
export const openWheel = (t, x = innerWidth / 2, y = innerHeight / 2, tap = false) => { if (!Number.isFinite(x) || !Number.isFinite(y)) { x = innerWidth / 2; y = innerHeight / 2; } st = { id: t.id, x, y, px: x, py: y, moved: false, released: tap }; navigator.vibrate?.(12); lock(true); emit(); };
export const moveWheel = (x, y) => { if (!st) return; st = { ...st, px: x, py: y, moved: st.moved || Math.hypot(x - st.x, y - st.y) > 30 }; emit(); };
export const endWheel = () => { if (!st) return; const pick = st.hot; if (pick) { pick.run(); close(); } else { st = { ...st, released: true }; emit(); } };
const close = () => { st = null; lock(false); emit(); };
export const wheelOpen = () => !!st;

// no page scroll while the finger is choosing
function lock(on) { const m = document.querySelector("main"); if (m) m.style.overflow = on ? "hidden" : ""; document.body.style.overflow = on ? "hidden" : ""; }

const R = 112, DEAD = 40;
export function TagWheelHost() {
  const s = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => st);
  const db = useDb();
  useBackClose(!!s, close);
  const t = s && db.tasks.find(x => x.id === s.id);
  if (s && !t) { setTimeout(close); return null; }

  let items = [], cx = 0, cy = 0, hot = null;
  if (s) {
    const cur = tagOfTask(db, t)?.project;
    const work = { id: "\u0000work", name: inFocus(t) ? "Из работы" : "В работу", glyph: <CrosshairIcon className="size-4" />, on: inFocus(t), run: () => (inFocus(t) ? fromFocus(t) : toFocus(t)) };
    const tags = tagsOf(db).slice(0, 9).map(g => ({ id: g.id, name: g.name, color: g.color, on: g.id === cur, run: () => setTag(t, g.id) }));
    items = [work, ...tags];
    // keep the whole ring on screen
    cx = Math.min(innerWidth - R - 44, Math.max(R + 44, s.x)); cy = Math.min(innerHeight - R - 60, Math.max(R + 60, s.y));
    const n = items.length;
    items = items.map((it, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return { ...it, a, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; });
    // the finger points at the nearest item once it has left the middle
    const dx = s.px - cx, dy = s.py - cy;
    if (!s.released && Math.hypot(dx, dy) > DEAD) {
      const a = Math.atan2(dy, dx);
      hot = items.reduce((b, it) => { const d = Math.abs(Math.atan2(Math.sin(it.a - a), Math.cos(it.a - a))); return !b || d < b.d ? { it, d } : b; }, null)?.it;
    }
    if (st && st.hot !== hot) st.hot = hot;
  }

  return (
    <AnimatePresence>
      {s && (
        <motion.div key="wheel" className="fixed inset-0 z-[60] touch-none select-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
          onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }} onClick={close} />
          <motion.div className="absolute rounded-full border border-white/15" style={{ left: cx, top: cy, width: R * 2, height: R * 2, x: "-50%", y: "-50%" }}
            initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 30 }} />
          <div className="absolute w-36 -translate-x-1/2 -translate-y-1/2 text-center text-xs leading-tight font-medium text-white/90" style={{ left: cx, top: cy }}>
            <span className="line-clamp-3">{t.text}</span>
          </div>
          {items.map((it, i) => (
            <motion.button key={it.id} type="button" onClick={() => { it.run(); close(); }}
              className="absolute flex flex-col items-center gap-1" style={{ x: "-50%", y: "-50%" }}
              initial={{ left: cx, top: cy, opacity: 0, scale: 0.3 }} animate={{ left: it.x, top: it.y, opacity: 1, scale: hot === it ? 1.18 : 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 30, delay: i * 0.015 }}>
              <span className={cn("grid size-12 place-items-center rounded-full text-sm font-bold shadow-lg ring-2 transition-colors",
                hot === it ? "bg-primary text-primary-foreground ring-primary" : it.on ? "bg-foreground text-background ring-foreground" : "bg-popover text-popover-foreground ring-white/10")}
                style={it.color && hot !== it && !it.on ? { boxShadow: `inset 0 0 0 3px ${it.color}` } : undefined}>
                {it.glyph || (it.on ? <CheckIcon className="size-4" /> : (it.name.trim()[0] || "#").toUpperCase())}
              </span>
              <span className={cn("max-w-24 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold shadow", hot === it ? "bg-primary text-primary-foreground" : "bg-popover/95 text-popover-foreground")}>{it.name}</span>
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
