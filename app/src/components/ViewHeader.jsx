import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// one look for the top of every view (project, stash, …): icon, editable title, actions on the right, then pill tabs
export const VIEW = "mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pt-3 pb-8 max-md:gap-3 md:px-8 md:pt-8 md:pb-16";

export const ViewHeader = forwardRef(function ViewHeader({ icon, children, className, ...input }, ref) {
  return (
    <header data-page-title className="flex items-center gap-2">
      {icon}
      <input ref={ref} placeholder="Без названия" {...input}
        className={cn("min-w-0 flex-1 bg-transparent text-xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50 md:text-3xl", className)} />
      {children}
    </header>
  );
});

export const PillTab = forwardRef(function PillTab({ on, drop, children, className, ...props }, ref) {
  return (
    <button ref={ref} type="button" role="tab" aria-selected={!!on} {...props}
      className={cn("relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-all",
        on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        drop && "scale-105 bg-primary/15 text-foreground ring-2 ring-primary/50", className)}>
      {children}
    </button>
  );
});

// sticky: on a phone the tabs stay pinned under the top bar, on a blurred strip
const BLUR = { backdropFilter: "blur(14px) saturate(1.6)", WebkitBackdropFilter: "blur(14px) saturate(1.6)" };
export const PillTabs = ({ children, sticky }) => (
  <div role="tablist" style={sticky ? BLUR : undefined}
    className={cn("-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 [scrollbar-width:none]",
      sticky && "max-md:sticky max-md:top-[var(--bar)] max-md:z-10 max-md:border-b max-md:bg-background/80 max-md:py-1.5")}>{children}</div>
);
