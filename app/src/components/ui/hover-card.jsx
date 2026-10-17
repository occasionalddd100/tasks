import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { cn } from "@/lib/utils";

const HoverCard = props => <HoverCardPrimitive.Root openDelay={350} closeDelay={120} {...props} />;
const HoverCardTrigger = HoverCardPrimitive.Trigger;

function HoverCardContent({ className, align = "start", sideOffset = 6, ...props }) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content align={align} sideOffset={sideOffset}
        className={cn("z-50 w-80 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-hidden data-[state=open]:animate-[menu-in_140ms_ease-out]", className)}
        {...props} />
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
