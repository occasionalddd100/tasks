import { forwardRef, useRef } from "react";
import { parseWhen } from "@/lib/when";
import { dueLabel } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// A text field that marks the date words it understood («завтра», «в пятницу», «12.11», «в 14:30»):
// a copy of the text sits behind the transparent field with those words tinted, and the date it means shows at the end.
export const HiliteField = forwardRef(function HiliteField({ value, multiline, className, boxClassName, onScroll, ...props }, ref) {
  const back = useRef(null);
  const w = parseWhen(value || "");
  const parts = []; let at = 0;
  for (const [a, b] of w.marks) { parts.push(value.slice(at, a)); parts.push(<mark key={a} className="rounded-sm bg-sky-500/25 text-transparent">{value.slice(a, b)}</mark>); at = b; }
  parts.push(value.slice(at));
  const Tag = multiline ? "textarea" : "input";
  const sync = e => { if (back.current) { back.current.scrollLeft = e.target.scrollLeft; back.current.scrollTop = e.target.scrollTop; } onScroll?.(e); };
  return (
    <div className={cn("relative grid min-w-0 flex-1 [&>*]:[font-kerning:none] [&>*]:[font-variant-ligatures:none] [&>*]:[letter-spacing:0]", boxClassName)}>
      <div ref={back} aria-hidden className={cn(className, "pointer-events-none col-start-1 row-start-1 overflow-hidden border-transparent text-transparent",
        multiline ? "break-words whitespace-pre-wrap" : "flex items-center whitespace-pre")}>{parts}{"​"}</div>
      <Tag ref={ref} value={value} {...props} onScroll={sync} onInput={sync}
        className={cn(className, "col-start-1 row-start-1 bg-transparent", w.marks.length && "pr-24")} />
      {w.marks.length > 0 && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[11px] text-sky-600 dark:text-sky-400">
        {w.due ? dueLabel(w.due) : "сегодня"}{w.time ? " " + w.time : ""}</span>}
    </div>
  );
});
