import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, ChevronRightIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Repeat2Icon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";
import { useDb, add, update, updateMany, remove, isMine } from "@/lib/db";
import { folderPath, newTab, deleteTab } from "@/lib/notes";
import { FileMenu } from "@/components/notes/NotesTree";
import { today, byOrder, nextOrder, stale, fmtDate, plural, EVERY, habitDue, dayDiff } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import ShareDialog from "@/components/ShareDialog";
import { confirmAction } from "@/components/Confirm";
import { ActionsContext, ActionsDropdown } from "@/components/ui/actions";
import { motion } from "motion/react";
import Board from "@/components/tasks/Board";

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-5 pb-16 md:px-8 md:pt-8">
      <div className="flex min-h-8 items-center gap-1 text-sm text-muted-foreground">
        {path.length ? path.map((f, i) => (
          <span key={f.id} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0" />}<span className="truncate">{f.name}</span>
          </span>
        )) : <span>Проект</span>}
        <span className="ml-auto" />
        <Button variant="outline" size="sm" onClick={() => setSharing(true)} aria-label={isMine(project) ? "Поделиться" : "Участники"}>
          <UsersIcon /><span className="max-sm:hidden">{isMine(project) ? "Поделиться" : "Участники"}</span>
        </Button>
        <FileMenu x={{ ...project, kind: "project" }} folders={db.folders} after={() => go({ journal: true })}
          trigger={<Button variant="ghost" size="iconSm" aria-label="Действия с проектом"><MoreHorizontalIcon /></Button>} />
      </div>
      <header className="flex flex-col gap-3">
        <input ref={titleRef} value={name} aria-label="Название проекта" placeholder="Без названия"
          onFocus={() => { editing.current = true; }} onChange={e => setName(e.target.value)} onBlur={saveName}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setName(project.name); editing.current = false; setTimeout(() => e.target.blur()); } }}
          className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/60 md:text-4xl" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{scope.length ? <>сделано <b>{done}</b> из {scope.length}</> : "задач пока нет"}</Badge>
          {shared && <Badge><UsersIcon className="size-3.5" />общий</Badge>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
          <i className="block h-full bg-primary transition-[width] duration-300" style={{ width: scope.length ? (done / scope.length) * 100 + "%" : 0 }} />
        </div>
      </header>

      <div className="flex items-center gap-2">
        <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1">
          <div role="tablist" className="inline-flex gap-1 rounded-lg border bg-muted p-1 whitespace-nowrap">
            {tabs.map(b => b.id === board?.id && renaming
              ? <TabRename key={b.id} value={b.name} onDone={n => { setRenaming(false); if (n && n !== b.name) update("boards", b.id, { name: n }); }} />
              : <ActionsContext key={b.id} items={tabItems(b)}>
                  <Tab active={b.id === board?.id} onClick={() => b.id === board?.id ? setRenaming(true) : pick(b.id)}
                    title={b.id === board?.id ? "Нажми ещё раз, чтобы переименовать" : undefined}>{b.name}</Tab>
                </ActionsContext>)}
            <Tab onClick={addTab} title="Новая вкладка" aria-label="Новая вкладка"><PlusIcon className="size-4" /></Tab>
          </div>
        </div>
        {board && <ActionsDropdown align="end" items={tabItems(board)}
          trigger={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Действия с вкладкой"><MoreHorizontalIcon /></Button>} />}
      </div>

      {board ? <Board key={board.id} board={board} /> : <p className="text-sm text-muted-foreground">Вкладок пока нет. Создай первую кнопкой «+».</p>}
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

// home screen: recurring tasks and what got done, day by day
export function JournalView() {
  const db = useDb();
  const days = useJournal(db);
  const streak = useMemo(() => {
    let n = 0; const d = new Date();
    for (;;) {
      const k = d.toLocaleDateString("sv-SE");
      if (days.get(k)?.items.length) { n++; d.setDate(d.getDate() - 1); }
      else if (n === 0 && k === today()) d.setDate(d.getDate() - 1);
      else break;
    }
    return n;
  }, [days]);
  const deadline = Math.ceil((new Date("2026-10-31T23:59:00+03:00") - new Date()) / 864e5);
  const todayDone = days.get(today())?.items.length || 0;

  if (!db.ready) return <div className="p-8 text-sm text-muted-foreground">Загружаю…</div>;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-5 pb-16 md:px-8 md:pt-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Журнал</h1>
        <div className="flex flex-wrap gap-2">
          <Badge>сегодня: <b>{todayDone}</b> {plural(todayDone, ["дело", "дела", "дел"])}</Badge>
          {deadline >= 0 && <Badge>до 31.10: <b>{deadline}</b> {plural(deadline, ["день", "дня", "дней"])}</Badge>}
          {streak >= 2 && <Badge>дней подряд с делами: <b>{streak}</b></Badge>}
        </div>
      </header>
      <Habits habits={db.habits} />
      <Journal days={days} />
    </div>
  );
}

const Badge = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-[13px] font-medium text-muted-foreground tabular-nums [&_b]:font-semibold [&_b]:text-foreground">{children}</span>
);

function Habits({ habits }) {
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
    <section className="rounded-xl border bg-card p-3 shadow-xs">
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
    <li className={cn("group flex min-h-9 items-center gap-2.5 rounded-md px-1 hover:bg-accent/50", waiting && "opacity-55")}>
      <Checkbox checked={!!waiting} onCheckedChange={v => onMark(h, !!v)} aria-label={h.text} />
      <span className={cn("flex-1 text-[15px]", waiting && "line-through")}>{h.text}</span>
      <span className="text-xs text-muted-foreground">{EVERY[h.every] || `каждые ${h.every} дн.`}</span>
      <button type="button" aria-label="Удалить повторяющуюся"
        onClick={() => armed ? remove("habits", h.id) : setArmed(true)}
        className={cn("rounded px-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-60", armed && "text-destructive opacity-100")}>
        {armed ? "удалить?" : <XIcon className="size-3.5" />}
      </button>
    </li>
  );
}

// journal: log notes + tasks I completed + recurring marks, grouped by day
function useJournal(db) {
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

function Journal({ days }) {
  const keys = [...days.keys()].filter(k => days.get(k).items.length || days.get(k).note).sort().reverse();
  if (!keys.length) return <p className="text-sm text-muted-foreground">Тут будет журнал по дням: что сделал. Отмеченные задачи попадают сюда сами.</p>;
  return (
    <div className="flex flex-col gap-4">
      {keys.map(k => {
        const d = days.get(k);
        return (
          <section key={k} className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[15px] font-semibold">{fmtDate(k)}</h2>
              <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs font-semibold text-good tabular-nums">{d.items.length} {plural(d.items.length, ["дело", "дела", "дел"])}</span>
              {dayDiff(k, today()) === 1 && <span className="text-xs text-muted-foreground">вчера</span>}
            </div>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] marker:text-muted-foreground">
              {d.items.map((it, i) => <li key={i}>{it.text}{it.from && <span className="text-xs text-muted-foreground"> · {it.from}</span>}</li>)}
            </ul>
            {d.note && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{d.note}</p>}
          </section>
        );
      })}
    </div>
  );
}
