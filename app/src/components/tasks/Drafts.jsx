import { useState } from "react";
import { InboxIcon } from "lucide-react";
import { useDb } from "@/lib/db";
import { draftTasks } from "@/lib/personal";
import { CaptureBar } from "@/components/tasks/QuickAdd";
import TaskRow from "@/components/tasks/TaskRow";
import { cn } from "@/lib/utils";

// "Черновики" of the personal project: a field to throw tasks in, and the list to sort out (tap a task → category)
export default function DraftsCard({ link = true, wide = false }) {
  const db = useDb();
  const list = draftTasks(db);
  const [all, setAll] = useState(false);
  const max = wide ? 10 : 6;
  const head = (
    <header className="flex items-center gap-2">
      <InboxIcon className="size-5 text-primary" />
      <h2 className="text-base font-semibold tracking-tight">Черновики</h2>
      {list.length > 0 && <span className="rounded-full bg-foreground/[.06] px-2 py-px text-xs font-medium text-muted-foreground tabular-nums">{list.length}</span>}
      {link && <a href="#personal" className="ml-auto text-sm text-muted-foreground underline-offset-2 hover:underline">Личное →</a>}
    </header>
  );
  const body = list.length > 0 ? <>
    <ul className={cn("-mx-2", wide && "xl:columns-2 xl:gap-4 [&>li]:break-inside-avoid")}>{(all ? list : list.slice(0, max)).map(t => <li key={t.id}><TaskRow t={t} /></li>)}</ul>
    {list.length > max && <button type="button" onClick={() => setAll(a => !a)} className="self-start text-sm text-muted-foreground hover:text-foreground">{all ? "Свернуть" : `Показать все (${list.length})`}</button>}
  </> : <p className="text-sm text-muted-foreground">Пусто. Всё, что придёт в голову, кидай сюда и разбирай потом.</p>;
  const hint = list.length > 0 && <p className="text-xs text-muted-foreground">Открой задачу, чтобы поставить срок или перенести её в категорию.</p>;

  // the personal project: field and hint on the left, the pile to sort out on the right
  if (wide) return (
    <section className="grid gap-4 rounded-xl border border-dashed border-primary/40 bg-card p-4 shadow-xs md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-6">
      <div className="flex flex-col gap-3">{head}<CaptureBar />{hint}</div>
      <div className="flex min-w-0 flex-col gap-2">{body}</div>
    </section>
  );
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      {head}<CaptureBar />{hint}{body}
    </section>
  );
}
