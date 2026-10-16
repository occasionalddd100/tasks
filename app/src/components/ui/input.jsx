import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm",
      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
