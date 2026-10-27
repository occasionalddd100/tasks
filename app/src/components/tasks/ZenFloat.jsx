import { AnimatePresence, motion } from "motion/react";
import { Maximize2Icon, PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { useDb } from "@/lib/db";
import { focusList } from "@/lib/focus";
import { useZenTimer } from "@/lib/zenTimer";

// Фокус closed with the timer on: a small window floats over the app (drag it anywhere) with the time,
// the task at the top of work, pause, back into focus, and stop.
export default function ZenFloat() {
  const db = useDb();
  const t = useZenTimer();
  const cur = focusList(db).find(x => !x.done && !x.parent);
  const R = 15, C = 2 * Math.PI * R, part = t.left / t.total;
  return (
    <AnimatePresence>
      {t.active && (
        <motion.div drag dragMomentum={false} initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.9 }}
          className="fixed right-28 bottom-6 z-40 flex max-w-[min(22rem,calc(100vw-2rem))] cursor-grab items-center gap-2.5 rounded-2xl bg-[#11121a]/95 py-2 pr-2 pl-2.5 text-white shadow-2xl ring-1 ring-white/10 active:cursor-grabbing max-md:right-4 max-md:bottom-[calc(9.5rem+env(safe-area-inset-bottom))]"
          style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", touchAction: "none" }}>
          <svg viewBox="0 0 36 36" className="size-10 shrink-0 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
            <circle cx="18" cy="18" r={R} fill="none" stroke={t.left ? "#34d399" : "#f59e0b"} strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * part} style={{ transition: "stroke-dashoffset .5s linear" }} />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] leading-tight font-semibold tabular-nums">{t.left ? t.label : "Круг закончен"}</div>
            <div className="truncate text-xs text-white/50">{t.running ? (cur ? cur.text : "фокус") : t.left ? "пауза" : "отметь, что сделал"}</div>
          </div>
          <button type="button" onPointerDown={e => e.stopPropagation()} onClick={t.toggle} aria-label={t.running ? "Пауза" : "Продолжить"} title={t.running ? "Пауза" : t.left ? "Продолжить" : "Ещё круг"}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/20">{t.running ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}</button>
          <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => { location.hash = "#zen"; }} aria-label="Открыть фокус" title="Открыть фокус"
            className="grid size-9 shrink-0 place-items-center rounded-xl hover:bg-white/10"><Maximize2Icon className="size-4" /></button>
          <button type="button" onPointerDown={e => e.stopPropagation()} onClick={t.stop} aria-label="Остановить таймер" title="Остановить и сбросить"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"><XIcon className="size-3.5" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
