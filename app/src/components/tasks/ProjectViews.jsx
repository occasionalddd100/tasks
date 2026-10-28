import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import * as Pop from "@radix-ui/react-popover";
import { ArrowLeftIcon, ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, ListChecksIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Repeat2Icon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";
import { useDb, add, update, updateMany, remove, isMine } from "@/lib/db";
import { folderPath, newTab, deleteTab } from "@/lib/notes";
import { FileMenu } from "@/components/notes/NotesTree";
import { today, byOrder, nextOrder, stale, fmtDate, plural, EVERY, habitDue, dayDiff } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { VIEW, ViewHeader, PillTab, PillTabs } from "@/components/ViewHeader";
import { ItemIcon } from "@/components/IconPicker";
import ShareDialog from "@/components/ShareDialog";
import { confirmAction } from "@/components/Confirm";
import { ActionsContext, ActionsDropdown } from "@/components/ui/actions";
import { motion } from "motion/react";
import Board from "@/components/tasks/Board";
import DraftsCard from "@/components/tasks/Drafts";

const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// a project: tabs of task categories, opened from the sidebar like a note
export function ProjectView({ id, fresh, go }) {
  const db = useDb();
  const project = db.projects.find(p => p.id === id);
  const [name, setName] = useState(project?.name || "");
  const [sharing, setSharing] = useState(false);
  const [tab, setTab] = useState(() => store.get("tab:" + id));
  const [renaming, setRenaming] = useState(false);
  const titleRef = useRef(null), editing = useRef(false);
  useEffect(() => { if (fresh) { titleRef.current?.focus(); titleRef.current?.select(); } }, [id]);
  useEffect(() => { if (project && !editing.current) setName(project.name || ""); }, [project?.name]);
  useEffect(() => { if (project) store.set("lastProject", id); }, [id, !!project]);

  const tabs = useMemo(() => db.boards.filter(b => b.project === id).sort(byOrder), [db.boards, id]);
  const board = tabs.find(b => b.id === tab) || tabs[0];
  const pick = t => { setTab(t); store.set("tab:" + id, t); setRenaming(false); };
  const catIds = useMemo(() => new Set(db.cats.filter(c => c.board === board?.id).map(c => c.id)), [db.cats, board?.id]);
  const scope = db.tasks.filter(t => !stale(t) && catIds.has(t.cat));
  const done = scope.filter(t => t.done).length;

  if (!db.ready) return <div className="p-8 text-sm text-muted-foreground">Загружаю…</div>;
  if (!project) return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 px-6 py-16 text-muted-foreground">
      <p>Проекта нет: его удалили или закрыли к нему доступ.</p>
      <Button variant="outline" onClick={() => go({ journal: true })}>К журналу</Button>
    </div>
  );

  const path = folderPath(db.folders, project.folder);
  const shared = !isMine(project) || db.grants.some(g => g.coll === "projects" && g.target === id);
  const saveName = () => { editing.current = false; const n = name.trim(); if (n && n !== project.name) update("projects", id, { name: n }); else setName(project.name); };
  const addTab = async () => { const t = await newTab(id, "Новая вкладка", nextOrder(tabs)); if (t) { pick(t); setRenaming(true); } };
  const removeTab = async b => {
    const cats = db.cats.filter(c => c.board === b.id).map(c => c.id);
    const open = db.tasks.filter(t => cats.includes(t.cat) && !t.done).length;
    if (await confirmAction({ title: `Удалить вкладку «${b.name}»?`, description: cats.length ? `Удалятся категории (${cats.length}) и открытые задачи (${open}). Выполненные останутся в журнале.` : "Вкладка пустая." }))
      deleteTab(b.id);
  };

  const tabItems = b => {
    const i = tabs.indexOf(b);
    return [
      { label: "Переименовать вкладку", icon: PencilIcon, onSelect: () => { pick(b.id); setTimeout(() => setRenaming(true)); } },
      { label: "Сдвинуть влево", icon: ArrowLeftIcon, disabled: i === 0, onSelect: () => moveTab(tabs, b, -1) },
      { label: "Сдвинуть вправо", icon: ArrowRightIcon, disabled: i === tabs.length - 1, onSelect: () => moveTab(tabs, b, 1) },
      { sep: true },
      { label: "Удалить вкладку", icon: Trash2Icon, variant: "destructive", onSelect: () => removeTab(b) },
    ];
  };

  return (
    <div className={VIEW}>
      <ViewHeader ref={titleRef} value={name} aria-label="Название проекта" icon={<ItemIcon x={project} fallback={ListChecksIcon} className="size-6" />}
        onFocus={() => { editing.current = true; }} onChange={e => setName(e.target.value)} onBlur={saveName}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setName(project.name); editing.current = false; setTimeout(() => e.target.blur()); } }}>
        {path.length > 0 && <span className="max-w-40 truncate text-sm text-muted-foreground max-sm:hidden" title={path.map(f => f.name).join(" / ")}>{path.at(-1).name}</span>}
        {/* «Личное» is never shared */}
        {!project.personal && <Button variant="ghost" size="iconSm" onClick={() => setSharing(true)} aria-label={isMine(project) ? "Поделиться" : "Участники"} title={isMine(project) ? "Поделиться" : "Участники"}
          className={cn(shared && "text-foreground")}><UsersIcon /></Button>}
        <FileMenu x={{ ...project, kind: "project" }} folders={db.folders} after={() => go({ journal: true })}
          trigger={<Button variant="ghost" size="iconSm" aria-label="Действия с проектом"><MoreHorizontalIcon /></Button>} />
      </ViewHeader>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border" aria-hidden>
          <i className="block h-full bg-primary transition-[width] duration-300" style={{ width: scope.length ? (done / scope.length) * 100 + "%" : 0 }} />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{scope.length ? `${done} из ${scope.length}` : "задач пока нет"}</span>
      </div>

      {project.personal && isMine(project) && <DraftsCard link={false} wide />}

      <PillTabs sticky>
        {tabs.map(b => b.id === board?.id && renaming
          ? <TabRename key={b.id} value={b.name} onDone={n => { setRenaming(false); if (n && n !== b.name) update("boards", b.id, { name: n }); }} />
          : <ActionsContext key={b.id} items={tabItems(b)}>
              <PillTab on={b.id === board?.id} onClick={() => b.id === board?.id ? setRenaming(true) : pick(b.id)}
                title={b.id === board?.id ? "Нажми ещё раз, чтобы переименовать" : undefined}>{b.name}
                {b.id === board?.id && <ActionsDropdown align="start" items={tabItems(b)}
                  trigger={<span role="button" tabIndex={0} aria-label="Действия с вкладкой" onClick={e => e.stopPropagation()} className="-mr-1 grid size-5 place-items-center rounded hover:bg-foreground/10"><MoreHorizontalIcon className="size-3.5" /></span>} />}
              </PillTab>
            </ActionsContext>)}
        <button type="button" onClick={addTab} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Новая вкладка" title="Новая вкладка"><PlusIcon className="size-4" /></button>
      </PillTabs>

      {board ? <Board key={board.id} board={board} hideDrafts={project.personal} /> : <p className="text-sm text-muted-foreground">Вкладок пока нет. Создай первую кнопкой «+».</p>}
      <ShareDialog open={sharing} onOpenChange={setSharing} coll="projects" target={id} name={project.name} isOwner={isMine(project)} />
    </div>
  );
}

// swap a tab with its neighbour and renumber
function moveTab(tabs, b, dir) {
  const list = [...tabs], i = list.indexOf(b), j = i + dir;
  [list[i], list[j]] = [list[j], list[i]];
  updateMany("boards", list.map((t, k) => [t, k + 1]).filter(([t, o]) => t.order !== o).map(([t, order]) => [t.id, { order }]));
}

const Tab = forwardRef(function Tab({ active, className, children, ...props }, ref) {
  return (
    <button ref={ref} type="button" role="tab" aria-selected={!!active} {...props}
      className={cn("relative inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        active && "text-foreground", className)}>
      {active && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", bounce: 0.15, duration: 0.35 }} />}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </button>
  );
});

function TabRename({ value, onDone }) {
  const ref = useRef(null), done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = v => { if (!done.current) { done.current = true; onDone(v); } };
  return (
    <input ref={ref} defaultValue={value} aria-label="Название вкладки"
      onKeyDown={e => { if (e.key === "Enter") finish(e.currentTarget.value.trim()); if (e.key === "Escape") finish(null); }}
      onBlur={e => finish(e.currentTarget.value.trim())}
      className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/50" />
  );
}

export const Badge = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-[13px] font-medium text-muted-foreground tabular-nums [&_b]:font-semibold [&_b]:text-foreground">{children}</span>
);

export function Habits({ habits }) {
  const [showRest, setShowRest] = useState(false);
  const [text, setText] = useState(""), [every, setEvery] = useState("1");
  const list = [...habits].sort(byOrder), now = list.filter(habitDue), rest = list.filter(h => !habitDue(h));

  const mark = (h, val) => {
    const d = today(), hist = (h.history || []).filter(k => k !== d);
    if (val) hist.push(d);
    const prev = hist.filter(k => k < d).sort().pop() || "";
    update("habits", h.id, { history: hist.slice(-120), lastDone: val ? d : prev });
  };
  const submit = e => {
    e.preventDefault(); const t = text.trim(); if (!t) return;
    setText(""); add("habits", { text: t, every: +every, order: nextOrder(habits), history: [] });
  };

  return (
    <section className="m-flat rounded-xl border bg-card p-3 shadow-xs">
      <h2 className="mb-1 flex items-center gap-2 px-1 text-[15px] font-semibold"><Repeat2Icon className="size-4 text-violet-500" />Повторяющиеся</h2>
      <ul>
        {now.map(h => <HabitRow key={h.id} h={h} onMark={mark} />)}
        {showRest && rest.map(h => <HabitRow key={h.id} h={h} waiting onMark={mark} />)}
      </ul>
      {!now.length && list.length > 0 && <p className="px-1 py-1 text-sm text-good">На сегодня всё сделано ✓</p>}
      {rest.length > 0 && (
        <button type="button" className="px-1 py-1 text-[13px] text-muted-foreground hover:text-foreground" onClick={() => setShowRest(s => !s)}>
          {showRest ? "Скрыть сделанные" : "Ждут следующего раза: " + rest.length}
        </button>
      )}
      <form onSubmit={submit} className="mt-1 flex gap-2">
        <Input value={text} onChange={e => setText(e.target.value)} placeholder="+ повторяющаяся задача" className="h-8 border-dashed bg-transparent shadow-none" />
        <select value={every} onChange={e => setEvery(e.target.value)} aria-label="Как часто"
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground">
          {Object.entries(EVERY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </form>
    </section>
  );
}

function HabitRow({ h, waiting, onMark }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (armed) { const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); } }, [armed]);
  return (
    <li className={cn("group flex min-h-9 items-center gap-2.5 rounded-md px-1 hover:bg-accent/50", waiting && "[&>span:first-of-type]:opacity-55")}>
      <Checkbox checked={!!waiting} onCheckedChange={v => onMark(h, !!v)} aria-label={h.text} />
      <span className={cn("min-w-0 flex-1 truncate text-[15px]", waiting && "line-through")}>{h.text}</span>
      <HabitStrip h={h} />
      <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">{EVERY[h.every] || `каждые ${h.every} дн.`}</span>
      <button type="button" aria-label="Удалить повторяющуюся"
        onClick={() => armed ? remove("habits", h.id) : setArmed(true)}
        className={cn("rounded px-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-60", armed && "text-destructive opacity-100")}>
        {armed ? "удалить?" : <XIcon className="size-3.5" />}
      </button>
    </li>
  );
}

// the last weeks of a recurring task at a glance: done days filled, missed daily ones faintly red, today ringed.
// Tap a day to set or clear it; tap the month to see a whole month.
const isoD = d => d.toLocaleDateString("sv-SE");
const shift = (iso, n) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + n); return isoD(d); };
function toggleDay(h, date) {
  const hist = new Set(h.history || []);
  hist.has(date) ? hist.delete(date) : hist.add(date);
  const list = [...hist].sort();
  update("habits", h.id, { history: list.slice(-400), lastDone: list.at(-1) || "" });
}
function dayCell(h, date, now, done) {
  if (date > now) return { cls: "opacity-25 bg-muted", label: "впереди" };
  if (done) return { cls: "bg-violet-500", label: "сделано" };
  if (date === now) return { cls: "bg-muted", label: "сегодня" };
  // before the first mark the habit didn't exist yet: nothing was missed
  const start = h.created?.slice(0, 10) || [...(h.history || [])].sort()[0] || now;
  return (h.every || 1) === 1 && date >= start ? { cls: "bg-red-500/25", label: "пропущено" } : { cls: "bg-muted", label: "не было" };
}
function HabitStrip({ h }) {
  const [open, setOpen] = useState(false);
  const now = today(), hist = new Set(h.history || []);
  const days = Array.from({ length: 14 }, (_, k) => shift(now, k - 13));
  const streak = (() => { let n = 0, d = hist.has(now) ? now : shift(now, -1); while (hist.has(d)) { n++; d = shift(d, -1); } return n; })();
  return (
    <Pop.Root open={open} onOpenChange={setOpen}>
      <Pop.Trigger asChild>
        <button type="button" aria-label={"Календарь: " + h.text} className="flex shrink-0 items-center gap-[3px] rounded-md p-1 hover:bg-accent">
          {days.map((d, k) => {
            const c = dayCell(h, d, now, hist.has(d));
            return <i key={d} title={d.slice(8) + "." + d.slice(5, 7) + " · " + c.label}
              className={cn("block size-[9px] rounded-[3px]", k < 7 && "max-sm:hidden", c.cls, d === now && "ring-[1.5px] ring-foreground ring-offset-1 ring-offset-card")} />;
          })}
          {streak >= 2 && <span className="ml-1 text-[11px] font-semibold text-violet-500 tabular-nums">{streak}🔥</span>}
        </button>
      </Pop.Trigger>
      <Pop.Portal><Pop.Content align="end" sideOffset={6} className="z-50 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl data-[state=open]:animate-[menu-in_140ms_ease-out]">
        <HabitMonth h={h} />
      </Pop.Content></Pop.Portal>
    </Pop.Root>
  );
}
const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
function HabitMonth({ h }) {
  const [off, setOff] = useState(0);
  const now = today(), hist = new Set(h.history || []);
  const t = new Date(), first = new Date(t.getFullYear(), t.getMonth() + off, 1);
  const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(), pad = (first.getDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...Array.from({ length: n }, (_, k) => isoD(new Date(first.getFullYear(), first.getMonth(), k + 1)))];
  const doneN = cells.filter(d => d && hist.has(d)).length;
  return (
    <div className="w-60">
      <div className="mb-2 flex items-center gap-1">
        <span className="flex-1 truncate text-sm font-semibold">{MONTH_NAMES[first.getMonth()]}<span className="ml-1.5 font-normal text-muted-foreground">{doneN} из {cells.filter(d => d && d <= now).length}</span></span>
        <button type="button" onClick={() => setOff(o => o - 1)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Прошлый месяц"><ChevronLeftIcon className="size-4" /></button>
        <button type="button" onClick={() => setOff(o => Math.min(0, o + 1))} disabled={off >= 0} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Следующий месяц"><ChevronRightIcon className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(w => <span key={w} className="pb-0.5 text-center text-[10px] text-muted-foreground">{w}</span>)}
        {cells.map((d, k) => {
          if (!d) return <span key={"p" + k} />;
          const done = hist.has(d), c = dayCell(h, d, now, done);
          return (
            <button key={d} type="button" disabled={d > now} onClick={() => toggleDay(h, d)} title={c.label}
              className={cn("grid aspect-square place-items-center rounded-md text-[11px] font-medium tabular-nums transition-transform hover:scale-110 disabled:pointer-events-none", c.cls,
                done ? "text-white" : "text-muted-foreground", d === now && "ring-2 ring-foreground ring-offset-1 ring-offset-popover")}>
              {+d.slice(8)}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Нажми на день, чтобы отметить или снять.</p>
    </div>
  );
}

// journal: log notes + tasks I completed + recurring marks, grouped by day
export function useJournal(db) {
  return useMemo(() => {
    const byDay = new Map();
    const day = k => { if (!byDay.has(k)) byDay.set(k, { items: [], note: "" }); return byDay.get(k); };
    for (const l of db.log) { const d = day(l.id); d.items.push(...(l.items || []).map(text => ({ text }))); d.note = l.note || ""; }
    for (const t of db.tasks) {
      if (!t.done || !t.doneOn || (t.doneBy || t._owner || db.me) !== db.me) continue;
      const d = day(t.doneOn);
      if (!d.items.some(i => i.text === t.text)) d.items.push({ text: t.text, from: "из задач" });
    }
    for (const h of db.habits) for (const k of h.history || []) day(k).items.push({ text: h.text, from: "повторяющаяся" });
    return byDay;
  }, [db.log, db.tasks, db.habits, db.me]);
}
