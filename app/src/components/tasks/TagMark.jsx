import { HashIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// a tag's mark: its emoji if it has one, else a dot in its colour
export function TagMark({ t, size = "sm", className }) {
  if (t?.emoji) return <span className={cn("shrink-0 leading-none", size === "lg" ? "text-xl" : size === "md" ? "text-base" : "text-[13px]", className)} aria-hidden>{t.emoji}</span>;
  if (t?.color) return <span className={cn("shrink-0 rounded-full", size === "lg" ? "size-4" : "size-2", className)} style={{ background: t.color }} aria-hidden />;
  return <HashIcon className={cn("size-3 shrink-0", className)} aria-hidden />;
}
