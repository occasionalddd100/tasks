import { useEffect, useRef, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { ListTodoIcon, MenuIcon, NotebookPenIcon, PlusIcon } from "lucide-react";
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

// the screen that owns "Задачи" can take over a second tap on it (to open its tag fan)
let again = null; const againSubs = new Set();
export function useTasksTap(fn) {
  useEffect(() => { again = fn; againSubs.forEach(f => f()); return () => { again = null; againSubs.forEach(f => f()); }; });
}

// the default bar: my shortcut · Дневник · ＋ (new task) · Задачи · Меню
export default function MobileNav({ onMenu, onSearch, onAdd, diary, tasks, shortcut }) {
  const own = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => items);
  const tap = useSyncExternalStore(f => (againSubs.add(f), () => againSubs.delete(f)), () => again);
  const hold = useRef(0), held = useRef(false);
  const list = own || [
    shortcut,
    { k: "diary", label: "Дневник", icon: NotebookPenIcon, ...diary },
    { k: "add", label: "Добавить", icon: PlusIcon, onClick: onAdd, accent: true },
    { k: "tasks", label: "Задачи", icon: ListTodoIcon, ...tasks, onClick: tasks?.active && tap ? tap : tasks?.onClick },
  ];
  // views may list "journal" / "search" without a handler: those go to the shell (the journal is the diary now)
  const builtin = { journal: diary?.onClick, search: onSearch, add: onAdd };
  const all = [...list.filter(Boolean).map(x => x.onClick ? x : { ...x, onClick: builtin[x.k] }), { k: "menu", label: "Меню", icon: MenuIcon, onClick: onMenu }];
  return (
    <nav style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-[var(--sab)] md:hidden">
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${all.filter(Boolean).length}, minmax(0, 1fr))` }}>
        {all.filter(Boolean).map(({ k, label, icon: Icon, onClick, onHold, active, badge, accent }) => accent ? (
          <div key={k} className="flex h-16 items-center justify-center">
            <button type="button" onClick={onClick} aria-label={label}
              className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95">
              <PlusIcon className="size-6" />
            </button>
          </div>
        ) : (
          <button key={k} type="button" onClick={() => { if (!held.current) onClick?.(); held.current = false; }}
            // a long press on a button that has one (the shortcut): change what it opens
            onPointerDown={onHold ? () => { held.current = false; clearTimeout(hold.current); hold.current = setTimeout(() => { held.current = true; navigator.vibrate?.(15); onHold(); }, 500); } : undefined}
            onPointerUp={onHold ? () => clearTimeout(hold.current) : undefined} onPointerLeave={onHold ? () => clearTimeout(hold.current) : undefined}
            onContextMenu={onHold ? e => e.preventDefault() : undefined}
            className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-foreground" : "text-muted-foreground")}>
            {/* the pill grows in place under the icon (no sliding across the other buttons) */}
            {active && <motion.span initial={{ opacity: 0, scaleX: 0.6 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ duration: 0.18, ease: "easeOut" }} className="absolute top-2 h-8 w-16 rounded-full bg-accent" />}
            <span className="relative">
              <Icon className="size-5" />
              {badge > 0 && <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-bold text-white">{badge}</span>}
            </span>
            <span className="relative max-w-full truncate px-1">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
