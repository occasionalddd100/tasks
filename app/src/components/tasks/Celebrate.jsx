import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useDb } from "@/lib/db";
import { focusList } from "@/lib/focus";

// Ticking off work should feel good. Every done task in «В работе» pops a little confetti,
// the last two get a word of encouragement, and an empty list sets off fireworks.
const COLORS = ["#f43f5e", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Celebrate() {
  const db = useDb();
  const list = db.ready ? focusList(db) : null;
  const open = list?.filter(t => !t.done).length, done = list?.filter(t => t.done).length;
  const prev = useRef(null), cv = useRef(null), parts = useRef([]), raf = useRef(0);
  const [msg, setMsg] = useState(null);

  const loop = () => {
    const c = cv.current; if (!c) return;
    const g = c.getContext("2d"), dpr = devicePixelRatio || 1;
    if (c.width !== innerWidth * dpr) { c.width = innerWidth * dpr; c.height = innerHeight * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    parts.current = parts.current.filter(p => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts.current) {
      p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      g.save(); g.globalAlpha = Math.min(1, p.life / 30); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.s / 2, 0, 7); g.fill(); } else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2 * Math.abs(Math.cos(p.r * 3)) + 1);
      g.restore();
    }
    raf.current = parts.current.length ? requestAnimationFrame(loop) : 0;
  };
  const burst = (x, y, n, { speed = 9, spread = Math.PI * 2, dir = -Math.PI / 2, g = 0.22 } = {}) => {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread, v = speed * (0.4 + Math.random() * 0.8);
      parts.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g, drag: 0.985, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        s: 6 + Math.random() * 7, c: COLORS[(Math.random() * COLORS.length) | 0], round: Math.random() < 0.3, life: 140 + Math.random() * 80 });
    }
    if (!raf.current) raf.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const p = prev.current; prev.current = { open, done };
    // only a task getting done counts, not one taken out of work or the done ones cleared away
    if (!p || open == null || !(open < p.open && done > p.done)) return;
    const W = innerWidth, H = innerHeight, quiet = calm();
    if (open === 0) {
      navigator.vibrate?.([30, 60, 30, 60, 80]);
      setMsg({ big: true, title: "Всё сделано!", sub: `${done} из ${done} в работе. Красавчик` });
      if (!quiet) {
        burst(0, H, 90, { dir: -Math.PI / 3, spread: 0.7, speed: 22, g: 0.3 });
        burst(W, H, 90, { dir: -Math.PI * 2 / 3, spread: 0.7, speed: 22, g: 0.3 });
        [300, 650, 1000, 1350].forEach((ms, i) => setTimeout(() => burst(W * (0.2 + 0.6 * Math.random()), H * (0.15 + 0.25 * Math.random()), 70, { speed: 8, g: 0.12 }), ms + i * 40));
      }
      setTimeout(() => setMsg(null), 2800);
    } else {
      navigator.vibrate?.(15);
      if (!quiet) burst(W / 2, H * 0.85, open <= 2 ? 70 : 35, { spread: 1.4, speed: open <= 2 ? 16 : 12 });
      if (open <= 2) { setMsg({ title: open === 1 ? "Осталась одна!" : "Ещё две, и всё", sub: "Дожимай" }); setTimeout(() => setMsg(m => (m?.big ? m : null)), 1800); }
    }
  }, [open, done]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <>
      <canvas ref={cv} className="pointer-events-none fixed inset-0 z-[70] h-full w-full" aria-hidden />
      <AnimatePresence>
        {msg && (
          <motion.div key={msg.title} role="status" className="pointer-events-none fixed inset-x-0 z-[71] flex justify-center px-6" style={{ top: msg.big ? "34%" : "calc(var(--sat) + 4.5rem)" }}
            initial={{ opacity: 0, scale: 0.4, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}>
            <div className={msg.big ? "flex flex-col items-center gap-1 rounded-3xl bg-background/85 px-8 py-6 text-center shadow-2xl backdrop-blur" : "flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-background shadow-xl"}>
              {msg.big && <motion.span className="text-6xl" initial={{ rotate: -30 }} animate={{ rotate: [-30, 15, -8, 0] }} transition={{ duration: 0.8 }}>🎉</motion.span>}
              <span className={msg.big ? "text-3xl font-extrabold tracking-tight" : "text-base font-bold"}>{msg.title}</span>
              <span className={msg.big ? "text-sm text-muted-foreground" : "text-sm opacity-70"}>{msg.sub}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
