import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarXIcon, CheckIcon, CrosshairIcon, FlameIcon, SunIcon, SunriseIcon, XIcon } from "lucide-react";
import { focus } from "@/lib/focusSession";
import { useSelection, clearSel, moveTasks } from "@/lib/select";

// what to do with every picked task at once; Esc (or ✕) lets them go
export default function SelectionBar() {
  const sel = useSelection(), ids = [...sel], n = ids.length;
  useEffect(() => {
    if (!n) return;
    const on = e => { if (e.key === "Escape") clearSel(); };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [n]);
  const act = k => { moveTasks(ids, k); clearSel(); };
  const btn = "flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-white/10 max-sm:flex-col max-sm:h-12 max-sm:gap-0.5 max-sm:px-1.5 max-sm:text-[10px]";
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
          className="fixed inset-x-2 bottom-[calc(4.75rem+var(--sab))] z-50 mx-auto flex max-w-max items-center gap-0.5 overflow-x-auto rounded-2xl bg-[#11121a]/95 p-1 text-white shadow-2xl ring-1 ring-white/10 md:bottom-6">
          <span className="px-2.5 text-sm font-semibold tabular-nums">{n}</span>
          <button type="button" onClick={() => { focus.start(ids); clearSel(); }} className={btn}><CrosshairIcon className="size-4 text-violet-400" />Фокус</button>
          <button type="button" onClick={() => act("done")} className={btn}><CheckIcon className="size-4 text-emerald-400" />Готово</button>
          <button type="button" onClick={() => act("today")} className={btn}><SunIcon className="size-4 text-amber-400" />Сегодня</button>
          <button type="button" onClick={() => act("tomorrow")} className={btn}><SunriseIcon className="size-4 text-sky-400" />Завтра</button>
          <button type="button" onClick={() => act("free")} className={btn}><CalendarXIcon className="size-4" />Без срока</button>
          <button type="button" onClick={() => act("urgent")} className={btn}><FlameIcon className="size-4 text-red-400" />Приоритет</button>
          
          <button type="button" onClick={clearSel} aria-label="Снять выделение" title="Снять выделение (Esc)" className="grid size-10 shrink-0 place-items-center rounded-xl text-white/60 hover:bg-white/10"><XIcon className="size-4" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
