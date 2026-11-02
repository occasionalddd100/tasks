import { useEffect, useRef, useState } from "react";
import * as Pop from "@radix-ui/react-popover";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { today, addDays } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// Our own date and time picker (the system ones look out of place on the computer).
// <WhenPicker due time onChange={({ due, time }) => …}>{trigger}</WhenPicker>
// focus="time" opens it with the time field ready; noTime hides the clock part.
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const iso = d => d.toLocaleDateString("sv-SE");
const TIMES = ["09:00", "12:00", "15:00", "18:00", "21:00"];

// «930», «9:30», «9.30», «21» → «09:30» / «21:00»
export function readTime(v) {
  const s = String(v || "").trim().replace(/[.,\-\s]/g, ":");
  let m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(s) || /^(\d{1,2})(\d{2})$/.exec(s);
  if (!m) return null;
  const h = +m[1], mi = +(m[2] || 0);
  if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0");
}

export function Calendar({ value, onPick, min }) {
  const now = today();
  const [view, setView] = useState(() => { const d = new Date((value || now) + "T12:00"); return new Date(d.getFullYear(), d.getMonth(), 1, 12); });
  const y = view.getFullYear(), m = view.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, k) => iso(new Date(y, m, k + 1, 12)))];
  const go = n => setView(new Date(y, m + n, 1, 12));
  return (
    <div className="select-none" onWheel={e => { if (Math.abs(e.deltaY) > 20) go(e.deltaY > 0 ? 1 : -1); }}>
      <div className="mb-1 flex items-center">
        <button type="button" onClick={() => go(-1)} aria-label="Прошлый месяц" className="grid size-7 place-items-center rounded hover:bg-accent"><ChevronLeftIcon className="size-4" /></button>
        <span className="flex-1 text-center font-mono text-sm font-semibold">{MONTHS[m]} {y !== new Date().getFullYear() ? y : ""}</span>
        <button type="button" onClick={() => go(1)} aria-label="Следующий месяц" className="grid size-7 place-items-center rounded hover:bg-accent"><ChevronRightIcon className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WD.map((w, k) => <span key={w} className={cn("py-1 font-mono text-[11px] text-muted-foreground", k > 4 && "text-red-500/70")}>{w}</span>)}
        {cells.map((d, k) => d ? (
          <button key={d} type="button" disabled={!!min && d < min} onClick={() => onPick(d)}
            className={cn("h-8 rounded font-mono text-sm tabular-nums hover:bg-accent disabled:opacity-30",
              d < now && "text-muted-foreground", d === now && "ring-1 ring-primary ring-inset font-semibold",
              d === value && "bg-primary font-semibold text-primary-foreground hover:bg-primary")}>{+d.slice(8)}</button>
        ) : <span key={"e" + k} />)}
      </div>
    </div>
  );
}

export function TimeField({ value, onChange, autoFocus, className }) {
  const [text, setText] = useState(value || "");
  useEffect(() => setText(value || ""), [value]);
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, [autoFocus]);
  const commit = () => { if (!text.trim()) return onChange(""); const t = readTime(text); if (t) onChange(t); else setText(value || ""); };
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <input ref={ref} value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder="чч:мм" inputMode="numeric" aria-label="Время"
          className="h-8 w-20 rounded border bg-background px-2 text-center font-mono text-sm tabular-nums outline-none focus:border-primary" />
        {value && <button type="button" onClick={() => onChange("")} aria-label="Без времени" title="Без времени" className="grid size-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"><XIcon className="size-3.5" /></button>}
      </div>
      <div className="flex flex-wrap gap-1">
        {TIMES.map(t => <button key={t} type="button" onClick={() => onChange(t)}
          className={cn("h-7 rounded border px-1.5 font-mono text-xs tabular-nums hover:bg-accent", value === t && "border-primary bg-primary/10 text-primary")}>{t}</button>)}
      </div>
    </div>
  );
}

export function WhenBody({ due, time, onChange, focus, noTime, min, onDone }) {
  const now = today();
  const quick = [["Сегодня", now], ["Завтра", addDays(1)], ["Через неделю", addDays(7)]].filter(([, d]) => !min || d >= min);
  return (
    <div className="flex w-[19.5rem] flex-col gap-2.5">
      <div className="flex flex-wrap gap-1">
        {quick.map(([l, d]) => <button key={l} type="button" onClick={() => { onChange({ due: d, time }); if (noTime) onDone?.(); }}
          className={cn("h-7 rounded border px-2 text-xs hover:bg-accent", due === d && "border-primary bg-primary/10 text-primary")}>{l}</button>)}
        {due && !min && <button type="button" onClick={() => { onChange({ due: "", time: "" }); onDone?.(); }} className="h-7 rounded border px-2 text-xs text-muted-foreground hover:bg-accent">Без даты</button>}
      </div>
      <Calendar value={due} min={min} onPick={d => { onChange({ due: d, time }); if (noTime) onDone?.(); }} />
      {!noTime && <div className="border-t pt-2.5">
        <p className="mb-1.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">Время</p>
        <TimeField value={time} autoFocus={focus === "time"} onChange={t => onChange({ due: due || (t ? now : ""), time: t })} />
      </div>}
    </div>
  );
}

export function WhenPicker({ due, time, onChange, children, focus, noTime, min, open: openProp, onOpenChange, align = "start", side }) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own, setOpen = onOpenChange ?? setOwn;
  return (
    <Pop.Root open={open} onOpenChange={setOpen}>
      <Pop.Trigger asChild>{children}</Pop.Trigger>
      <Pop.Portal>
        <Pop.Content align={align} side={side} sideOffset={6} collisionPadding={8} onClick={e => e.stopPropagation()}
          className="z-[80] rounded-md border bg-popover p-3 text-popover-foreground shadow-xl data-[state=open]:animate-[menu-in_120ms_ease-out]">
          <WhenBody due={due} time={time} onChange={onChange} focus={focus} noTime={noTime} min={min} onDone={() => setOpen(false)} />
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}

// just a time: a button that opens the clock part
export function TimePicker({ value, onChange, children, align = "start" }) {
  const [open, setOpen] = useState(false);
  return (
    <Pop.Root open={open} onOpenChange={setOpen}>
      <Pop.Trigger asChild>{children}</Pop.Trigger>
      <Pop.Portal>
        <Pop.Content align={align} sideOffset={6} collisionPadding={8} onClick={e => e.stopPropagation()}
          className="z-[80] w-56 rounded-md border bg-popover p-3 text-popover-foreground shadow-xl data-[state=open]:animate-[menu-in_120ms_ease-out]">
          <TimeField value={value} autoFocus onChange={t => { onChange(t); setOpen(false); }} />
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}
