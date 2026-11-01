import { forwardRef } from "react";
import { cn, wheelX } from "@/lib/utils";

// one look for the top of every view (project, stash, …): icon, editable title, actions on the right, then pill tabs
export const VIEW = "mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 pt-3 pb-8 md:px-3 md:pt-3 md:pb-8";

export const ViewHeader = forwardRef(function ViewHeader({ icon, children, className, ...input }, ref) {
  return (
    <header data-page-title className="flex items-center gap-2">
      {icon}
      <input ref={ref} placeholder="Без названия" {...input}
        className={cn("min-w-0 flex-1 bg-transparent font-mono text-xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50 md:text-2xl", className)} />
      {children}
    </header>
  );
});

export const PillTab = forwardRef(function PillTab({ on, drop, children, className, ...props }, ref) {
  return (
    <button ref={ref} type="button" role="tab" aria-selected={!!on} {...props}
      className={cn("relative flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 font-mono text-[13px] font-medium whitespace-nowrap transition-colors md:rounded-none md:border-r",
        on ? "bg-accent font-semibold text-foreground shadow-[inset_0_-2px_0_var(--primary)]" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        drop && "scale-105 bg-primary/15 text-foreground ring-2 ring-primary/50", className)}>
      {children}
    </button>
  );
});

// sticky: on a phone the tabs stay pinned under the top bar, on a blurred strip
const BLUR = { backdropFilter: "blur(14px) saturate(1.6)", WebkitBackdropFilter: "blur(14px) saturate(1.6)" };
export const PillTabs = ({ children, sticky }) => (
  <div ref={wheelX} role="tablist" style={sticky ? BLUR : undefined}
    className={cn("-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:w-fit md:max-w-full md:gap-0 md:rounded-md md:border md:px-0 md:pb-0 [scrollbar-width:none]",
      sticky && "max-md:sticky max-md:top-[var(--bar)] max-md:z-10 max-md:border-b max-md:bg-background/80 max-md:py-1.5")}>{children}</div>
);
