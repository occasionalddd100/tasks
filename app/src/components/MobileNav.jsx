import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { BookOpenIcon, CheckIcon, CrosshairIcon, InboxIcon, MenuIcon, PlusIcon, UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// phone bottom bar shared by every view: a view puts its own buttons there with useNavItems,
// "Меню" (the sidebar) is always last
let items = null; const subs = new Set();
const set = v => { items = v; subs.forEach(f => f()); };
export function useNavItems(list) {
  useEffect(() => { set(list); });
  useEffect(() => () => set(null), []);
}

export const scrollTop = () => { document.querySelector("main")?.scrollTo?.({ top: 0, behavior: "smooth" }); window.scrollTo({ top: 0 }); };

// the default bar: Журнал · Личное · ＋ (into drafts) · Фокус · Меню
export default function MobileNav({ onMenu, onSearch, onJournal, onAdd, journal, personal, focus }) {
  const own = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => items);
  const list = own || [
    { k: "journal", label: "Журнал", icon: BookOpenIcon, onClick: onJournal, active: journal },
    { k: "personal", label: "Личное", icon: UserRoundIcon, ...personal },
    { k: "add", label: "Добавить", icon: PlusIcon, onClick: onAdd, accent: true },
  ];
  // views may list "journal" / "search" without a handler: those go to the shell
  const builtin = { journal: onJournal, search: onSearch };
  // "Фокус" sits next to "Меню" on the main screens
  const all = [...list.map(x => x.onClick ? x : { ...x, onClick: builtin[x.k] }),
    // a view with its own buttons (stash, note) keeps the bar to those plus "Меню"
    !own && { k: "focus", label: "Фокус", icon: CrosshairIcon, ...focus, active: focus?.active && !list.some(x => x.active) },
    { k: "menu", label: "Меню", icon: MenuIcon, onClick: onMenu }].filter(Boolean);
  return (
    <nav style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}>
        {all.map(({ k, label, icon: Icon, onClick, active, badge, accent }) => accent ? <AddButton key={k} onPick={onClick} /> : (
          <button key={k} type="button" onClick={onClick}
            className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-foreground" : "text-muted-foreground")}>
            {active && <motion.span layoutId="navpill" className="absolute top-2 h-8 w-14 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
            <span className={cn("relative", accent && "grid size-9 -mt-1 place-items-center rounded-full bg-primary text-primary-foreground shadow-md")}>
              <Icon className="size-5" />
              {badge > 0 && <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-bold text-white">{badge}</span>}
            </span>
            {!accent && <span className="relative max-w-full truncate px-1">{label}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}

// the centre ＋: tap = new draft; hold and slide left = "Сделал", right = "Черновик"
function AddButton({ onPick }) {
  const [dx, setDx] = useState(null);
  const start = useRef(null), timer = useRef(0);
  const pick = dx == null ? null : dx < -28 ? "done" : dx > 28 ? "draft" : null;
  const down = e => {
    start.current = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId);
    timer.current = setTimeout(() => { setDx(0); navigator.vibrate?.(10); }, 180);
  };
  const move = e => { if (start.current != null && dx != null) setDx(Math.max(-90, Math.min(90, e.clientX - start.current))); };
  const up = () => {
    clearTimeout(timer.current);
    const held = dx != null, p = pick;
    start.current = null; setDx(null);
    onPick(held ? p : "draft");
  };
  return (
    <div className="relative flex h-16 items-center justify-center">
      {dx != null && (
        <motion.div initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          className="pointer-events-none absolute bottom-[4.5rem] left-1/2 flex w-64 -translate-x-1/2 items-center justify-between gap-2 rounded-2xl border bg-background/95 p-1.5 shadow-xl">
          <span className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors", pick === "done" ? "bg-good text-white" : "text-muted-foreground")}><CheckIcon className="size-4" />Сделал</span>
          <span className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors", pick === "draft" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><InboxIcon className="size-4" />Черновик</span>
        </motion.div>
      )}
      <button type="button" aria-label="Добавить: нажми для черновика, удерживай и веди влево, чтобы записать сделанное"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { clearTimeout(timer.current); start.current = null; setDx(null); }}
        onContextMenu={e => e.preventDefault()}
        style={{ transform: dx ? `translateX(${dx * 0.35}px)` : undefined }}
        className="grid size-12 touch-none place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform select-none">
        <PlusIcon className={cn("size-6 transition-transform", pick === "done" && "-rotate-45", pick === "draft" && "rotate-45")} />
      </button>
    </div>
  );
}
