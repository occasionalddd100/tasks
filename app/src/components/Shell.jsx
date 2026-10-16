import { lazy, Suspense, useEffect, useState } from "react";
import { CheckSquareIcon, FilePlusIcon, FolderPlusIcon, LogOutIcon, MenuIcon, SearchIcon, XIcon } from "lucide-react";
import { sb, useDb } from "@/lib/db";
import { newNote, newFolder } from "@/lib/notes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConfirmHost } from "@/components/Confirm";
import NotesTree, { IconBtn } from "@/components/notes/NotesTree";
import TasksView from "@/components/tasks/TasksView";

const NoteView = lazy(() => import("@/components/notes/NoteView"));

// view lives in the URL hash: #note=<id> or nothing for tasks, so back/forward works
const readHash = () => {
  const m = location.hash.match(/^#note=([\w-]+)/);
  return m ? { note: m[1] } : { tasks: true };
};

export default function Shell() {
  const db = useDb();
  const [view, setView] = useState(readHash);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const on = () => setView(readHash());
    window.addEventListener("hashchange", on); window.addEventListener("popstate", on);
    return () => { window.removeEventListener("hashchange", on); window.removeEventListener("popstate", on); };
  }, []);

  const go = v => {
    setMenu(false);
    const hash = v.note ? "#note=" + v.note : "";
    if (location.hash !== hash) history.pushState(null, "", hash || location.pathname + location.search);
    setView(v);
  };

  const sidebar = <Sidebar view={view} go={go} email={db.email} />;

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:flex md:flex-col">{sidebar}</aside>
      <Sheet open={menu} onOpenChange={setMenu}><SheetContent>{sidebar}</SheetContent></Sheet>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-2 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" aria-label="Меню" onClick={() => setMenu(true)}><MenuIcon /></Button>
          <span className="truncate text-sm font-medium">{view.note ? "Заметка" : "Задачи"}</span>
        </div>
        {db.error && <p className="m-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive">Нет связи с базой: {db.error}. Обнови страницу.</p>}
        {view.note
          ? <Suspense fallback={null}><NoteView key={view.note} id={view.note} fresh={view.fresh} go={go} /></Suspense>
          : <TasksView />}
      </main>
      <ConfirmHost />
    </div>
  );
}

function Sidebar({ view, go, email }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const create = async () => { const id = await newNote(""); if (id) go({ note: id, fresh: true }); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-2">
        <button type="button" onClick={() => go({ tasks: true })}
          className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-accent", view.tasks && "bg-accent")}>
          <CheckSquareIcon className="size-4" />Задачи
        </button>
      </div>
      <div className="flex h-8 items-center gap-0.5 px-4 pt-2 pb-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Заметки</span>
        <span className="ml-auto" />
        <IconBtn label="Поиск по заметкам" onClick={() => { setSearching(s => !s); setQuery(""); }}>{searching ? <XIcon /> : <SearchIcon />}</IconBtn>
        <IconBtn label="Новая папка" onClick={() => newFolder("")}><FolderPlusIcon /></IconBtn>
        <IconBtn label="Новая заметка" onClick={create}><FilePlusIcon /></IconBtn>
      </div>
      {searching && (
        <div className="px-3 pb-2">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти в заметках"
            onKeyDown={e => e.key === "Escape" && (setSearching(false), setQuery(""))}
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50" />
        </div>
      )}
      <nav className="min-h-0 flex-1 overflow-y-auto pb-4" aria-label="Заметки">
        <NotesTree view={view} go={go} query={searching ? query.trim() : ""} />
      </nav>
      <div className="flex items-center gap-2 border-t p-2 pl-4 text-sm">
        <span className="truncate text-muted-foreground">{email}</span>
        <Button variant="ghost" size="iconSm" className="ml-auto" aria-label="Выйти" title="Выйти" onClick={() => sb.auth.signOut()}><LogOutIcon /></Button>
      </div>
    </div>
  );
}
