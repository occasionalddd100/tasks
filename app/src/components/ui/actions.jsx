import * as React from "react";
import * as Ctx from "@radix-ui/react-context-menu";
import * as Dd from "@radix-ui/react-dropdown-menu";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// One list of actions, shown either as a "⋯" dropdown or as a right-click (long-press) menu.
// item: { label, icon, onSelect, variant: "destructive", disabled, sub: [items] } | { sep: true } | { title }
const content = "z-50 min-w-[11rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md origin-(--radix-context-menu-content-transform-origin) data-[state=open]:animate-[menu-in_120ms_ease-out]";
const item = "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground";
const danger = "text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg:not([class*='text-'])]:text-destructive";
const stop = e => e.stopPropagation();

function render(P, items) {
  return items.filter(Boolean).map((it, i) => {
    if (it.sep) return <P.Separator key={i} className="-mx-1 my-1 h-px bg-border" />;
    if (it.title) return <P.Label key={i} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{it.title}</P.Label>;
    const Icon = it.icon;
    if (it.sub) return (
      <P.Sub key={i}>
        <P.SubTrigger className={item} disabled={it.disabled}>{Icon && <Icon className={it.iconClass} />}{it.label}<ChevronRightIcon className="ml-auto size-4" /></P.SubTrigger>
        <P.Portal><P.SubContent className={cn(content, "max-h-80 overflow-y-auto")} onClick={stop}>{render(P, it.sub)}</P.SubContent></P.Portal>
      </P.Sub>
    );
    return (
      <P.Item key={i} className={cn(item, it.variant === "destructive" && danger, it.active && "font-semibold")} disabled={it.disabled}
        onSelect={e => { if (it.keepOpen) e.preventDefault(); it.onSelect?.(e); }}>
        {Icon && <Icon className={it.iconClass} />}{it.label}
        {it.hint && <span className="ml-auto pl-4 text-xs text-muted-foreground">{it.hint}</span>}
      </P.Item>
    );
  });
}

export function ActionsDropdown({ items, trigger, align = "start" }) {
  return (
    <Dd.Root>
      <Dd.Trigger asChild>{trigger}</Dd.Trigger>
      <Dd.Portal>
        <Dd.Content align={align} sideOffset={4} className={content} onClick={stop} onCloseAutoFocus={e => e.preventDefault()}>{render(Dd, items)}</Dd.Content>
      </Dd.Portal>
    </Dd.Root>
  );
}

// wraps children; the innermost menu wins, so a task's menu doesn't also open its category's
export function ActionsContext({ items, children, disabled }) {
  if (disabled || !items?.length) return children;
  return (
    <Ctx.Root>
      <Ctx.Trigger asChild onContextMenu={stop}>{children}</Ctx.Trigger>
      <Ctx.Portal>
        <Ctx.Content className={content} onClick={stop} onCloseAutoFocus={e => e.preventDefault()}>{render(Ctx, items)}</Ctx.Content>
      </Ctx.Portal>
    </Ctx.Root>
  );
}
