import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export default function InlineInput({ value, onDone, className, placeholder }) {
  const ref = useRef(null), done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = v => { if (!done.current) { done.current = true; onDone(v); } };
  return (
    <input ref={ref} defaultValue={value} placeholder={placeholder}
      onKeyDown={e => { if (e.key === "Enter") finish(e.currentTarget.value.trim()); if (e.key === "Escape") finish(null); }}
      onBlur={e => finish(e.currentTarget.value.trim())}
      className={cn("min-w-0 flex-1 rounded-md border border-input bg-background px-2 outline-none focus:ring-2 focus:ring-ring/50", className)} />
  );
}

