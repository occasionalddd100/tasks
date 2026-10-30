import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArchiveIcon, CheckIcon, FlameIcon, SunIcon, SunriseIcon } from "lucide-react";
import { useDb, getDb, update } from "@/lib/db";
import { toBucket } from "@/lib/focus";
import { today, addDays } from "@/lib/tasks";
import { tagsOf, tagOfTask, setTag } from "@/lib/tags";
import { useBackClose } from "@/lib/back";
import { cn } from "@/lib/utils";

// Hold a task: two rings come out around the finger. The inner one acts on the task (done, today, tomorrow,
// priority, into the pail), the outer one retags it. Slide onto one and let go, or let go in the middle and tap one.
let st = null; const subs = new Set();
const emit = () => subs.forEach(f => f());
export const openWheel = (t, x = innerWidth / 2, y = innerHeight / 2, tap = false) => { if (!Number.isFinite(x) || !Number.isFinite(y)) { x = innerWidth / 2; y = innerHeight / 2; } st = { id: t.id, x, y, px: x, py: y, moved: false, released: tap }; navigator.vibrate?.(12); lock(true); emit(); };
export const moveWheel = (x, y) => { if (!st) return; st = { ...st, px: x, py: y, moved: st.moved || Math.hypot(x - st.x, y - st.y) > 30 }; emit(); };
export const endWheel = () => { if (!st) return; const pick = st.hot; if (pick) { pick.run(); close(); } else { st = { ...st, released: true, releasedAt: Date.now() }; emit(); } };
const close = () => { st = null; lock(false); emit(); };
export const wheelOpen = () => !!st;

// no page scroll while the finger is choosing
function lock(on) { const m = document.querySelector("main"); if (m) m.style.overflow = on ? "hidden" : ""; document.body.style.overflow = on ? "hidden" : ""; }

const R = 138, RI = 74, DEAD = 40;
export function TagWheelHost() {
  const s = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => st);
  const db = useDb();
  useBackClose(!!s, close);
  const t = s && db.tasks.find(x => x.id === s.id);
  if (s && !t) { setTimeout(close); return null; }

  let items = [], cx = 0, cy = 0, hot = null;
  if (s) {
    const cur = tagOfTask(db, t)?.id;
    const tags = tagsOf(db).slice(0, 10).map(g => ({ id: g.id, name: g.name, color: g.color, emoji: g.emoji, on: g.id === cur, run: () => setTag(t, g.id) }));
    const now = today(), tmr = addDays(1), urgent = t.prio === "urgent";
    const acts = [
      { id: "\u0000done", name: "Готово", glyph: <CheckIcon className="size-5" />, run: () => update("tasks", t.id, { done: true, doneOn: now, doneAt: new Date().toISOString(), doneBy: getDb().me }) },
      { id: "\u0000today", name: "Сегодня", glyph: <SunIcon className="size-5" />, on: t.due === now, run: () => update("tasks", t.id, t.due === now ? { due: "", time: "" } : { due: now }) },
      { id: "\u0000tmr", name: "Завтра", glyph: <SunriseIcon className="size-5" />, on: t.due === tmr, run: () => update("tasks", t.id, t.due === tmr ? { due: "", time: "" } : { due: tmr }) },
      { id: "\u0000prio", name: urgent ? "Без приоритета" : "Приоритет", glyph: <FlameIcon className="size-5" />, on: urgent, run: () => update("tasks", t.id, { prio: urgent ? "" : "urgent" }) },
      { id: "\u0000pail", name: "В ведёрко", glyph: <ArchiveIcon className="size-5" />, run: () => toBucket(t) },
    ].filter(a => !t.done || a.id === "\u0000pail");
    // keep the whole outer ring on screen
    cx = Math.min(innerWidth - R - 40, Math.max(R + 40, s.x)); cy = Math.min(innerHeight - R - 56, Math.max(R + 70, s.y));
    const ring = (list, r, inner) => list.map((it, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / list.length; return { ...it, a, r, inner, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });
    items = [...ring(acts, RI, true), ...ring(tags, R, false)];
    // the finger points at the nearest item of the ring it is over, once it has moved away from where it pressed
    // (measured from the press, not the ring's centre: the ring may be shifted to stay on screen)
    const dx = s.px - s.x, dy = s.py - s.y, dist = Math.hypot(dx, dy);
    if (!s.released && dist > DEAD) {
      const a = Math.atan2(dy, dx), inner = dist < (R + RI) / 2;
      hot = items.filter(it => it.inner === inner).reduce((b, it) => { const d = Math.abs(Math.atan2(Math.sin(it.a - a), Math.cos(it.a - a))); return !b || d < b.d ? { it, d } : b; }, null)?.it;
    }
    if (st && st.hot !== hot) st.hot = hot;
  }

  return (
    <AnimatePresence>
      {s && (
        <motion.div key="wheel" className="fixed inset-0 z-[60] touch-none select-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
          onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }} onClick={() => Date.now() - (st?.releasedAt || 0) > 400 && close()} />
          <motion.div className="absolute rounded-full border border-white/15" style={{ left: cx, top: cy, width: R * 2, height: R * 2, x: "-50%", y: "-50%" }}
            initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 30 }} />
          {/* the task's name above the rings */}
          <div className="absolute w-64 -translate-x-1/2 -translate-y-full text-center text-sm leading-tight font-semibold text-white" style={{ left: cx, top: cy - R - 36 }}>
            <span className="line-clamp-2">{t.text}</span>
          </div>
          {items.map((it, i) => (
            <motion.button key={it.id} type="button" onClick={() => { if (Date.now() - (st?.releasedAt || 0) < 400) return; /* the click the lifted finger makes is not a pick */ it.run(); close(); }}
              className="absolute flex flex-col items-center gap-1" style={{ x: "-50%", y: "-50%" }}
              initial={{ left: cx, top: cy, opacity: 0, scale: 0.3 }} animate={{ left: it.x, top: it.y, opacity: 1, scale: hot === it ? 1.18 : 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 30, delay: i * 0.015 }}>
              <span className={cn("grid place-items-center rounded-full", it.inner ? "size-11" : "size-12", " text-sm font-bold shadow-lg ring-2 transition-colors",
                hot === it ? "bg-primary text-primary-foreground ring-primary" : it.on ? "bg-foreground text-background ring-foreground" : it.inner ? "bg-white/90 text-black ring-white/20" : "bg-popover text-popover-foreground ring-white/10")}
                style={it.color && hot !== it && !it.on ? { boxShadow: `inset 0 0 0 3px ${it.color}` } : undefined}>
                {it.glyph || (it.on ? <CheckIcon className="size-4" /> : it.emoji ? <span className="text-xl leading-none">{it.emoji}</span> : (it.name.trim()[0] || "#").toUpperCase())}
              </span>
              <span className={cn("truncate rounded-full px-2 py-0.5 font-semibold shadow", it.inner ? "max-w-20 text-[10px]" : "max-w-24 text-[11px]", hot === it ? "bg-primary text-primary-foreground" : "bg-popover/95 text-popover-foreground")}>{it.name}</span>
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
