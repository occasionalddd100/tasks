import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon, MoreHorizontalIcon, Repeat2Icon, UsersIcon, XIcon } from "lucide-react";
import { useDb, add, update, remove, isMine } from "@/lib/db";
import { folderPath } from "@/lib/notes";
import { FileMenu } from "@/components/notes/NotesTree";
import { today, byOrder, nextOrder, stale, fmtDate, plural, EVERY, habitDue, dayDiff } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import ShareDialog from "@/components/ShareDialog";
import Board from "@/components/tasks/Board";

// a project: one screen of task categories, opened from the sidebar like a note
export function ProjectView({ id, fresh, go }) {
  const db = useDb();
  const board = db.boards.find(b => b.id === id);
  const [name, setName] = useState(board?.name || "");
  const [sharing, setSharing] = useState(false);
  const titleRef = useRef(null), editing = useRef(false);
  useEffect(() => { if (fresh) { titleRef.current?.focus(); titleRef.current?.select(); } }, [id]);
  useEffect(() => { if (board && !editing.current) setName(board.name || ""); }, [board?.name]);
  useEffect(() => { if (board) { try { localStorage.setItem("lastProject", id); } catch {} } }, [id, !!board]);

  const catIds = useMemo(() => new Set(db.cats.filter(c => c.board === id).map(c => c.id)), [db.cats, id]);
  const scope = db.tasks.filter(t => !stale(t) && catIds.has(t.cat));
  const done = scope.filter(t => t.done).length;

  if (!db.ready) return <div className="p-8 text-sm text-muted-foreground">Загружаю…</div>;
  if (!board) return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 px-6 py-16 text-muted-foreground">
      <p>Проекта нет: его удалили или закрыли к нему доступ.</p>
      <Button variant="outline" onClick={() => go({ journal: true })}>К журналу</Button>
    </div>
  );

  const path = folderPath(db.folders, board.folder);
  const shared = !isMine(board) || db.grants.some(g => g.coll === "boards" && g.target === id);
  const saveName = () => { editing.current = false; const n = name.trim(); if (n && n !== board.name) update("boards", id, { name: n }); else setName(board.name); };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-5 pb-16 md:px-8 md:pt-8">
      <div className="flex min-h-8 items-center gap-1 text-sm text-muted-foreground">
        {path.length ? path.map((f, i) => (
          <span key={f.id} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0" />}<span className="truncate">{f.name}</span>
          </span>
        )) : <span>Проект</span>}
        <span className="ml-auto" />
        <Button variant="outline" size="sm" onClick={() => setSharing(true)} aria-label={isMine(board) ? "Поделиться" : "Участники"}>
          <UsersIcon /><span className="max-sm:hidden">{isMine(board) ? "Поделиться" : "Участники"}</span>
        </Button>
        <FileMenu x={{ ...board, kind: "project" }} folders={db.folders} after={() => go({ journal: true })}
          trigger={<Button variant="ghost" size="iconSm" aria-label="Действия с проектом"><MoreHorizontalIcon /></Button>} />
      </div>
      <header className="flex flex-col gap-3">
        <input ref={titleRef} value={name} aria-label="Название проекта" placeholder="Без названия"
          onFocus={() => { editing.current = true; }} onChange={e => setName(e.target.value)} onBlur={saveName}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setName(board.name); editing.current = false; setTimeout(() => e.target.blur()); } }}
          className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/60 md:text-4xl" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{scope.length ? <>сделано <b>{done}</b> из {scope.length}</> : "задач пока нет"}</Badge>
          {shared && <Badge><UsersIcon className="size-3.5" />общий</Badge>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
          <i className="block h-full bg-primary transition-[width] duration-300" style={{ width: scope.length ? (done / scope.length) * 100 + "%" : 0 }} />
        </div>
      </header>
      <Board board={board} />
      <ShareDialog open={sharing} onOpenChange={setSharing} coll="boards" target={board.id} name={board.name} isOwner={isMine(board)} />
    </div>
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
