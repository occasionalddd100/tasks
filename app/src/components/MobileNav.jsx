import { useEffect, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { BookOpenIcon, CrosshairIcon, MenuIcon, PlusIcon, UserRoundIcon } from "lucide-react";
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
        {all.map(({ k, label, icon: Icon, onClick, active, badge, accent }) => (
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
