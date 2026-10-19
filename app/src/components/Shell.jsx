import { lazy, Suspense, useEffect, useState } from "react";
import { BookOpenIcon, LogOutIcon, MenuIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { sb, useDb } from "@/lib/db";
import { newNote, newFolder, newProject } from "@/lib/notes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConfirmHost } from "@/components/Confirm";
import Avatar from "@/components/Avatar";
import ProfileDialog from "@/components/ProfileDialog";
import { loadMe, useMe } from "@/lib/people";
import { importFiles, fromDrop } from "@/lib/importMd";
import { MotionConfig, motion } from "motion/react";
import NotesTree, { IconBtn, CreateMenu, itemName } from "@/components/notes/NotesTree";
import { ProjectView } from "@/components/tasks/ProjectViews";
import JournalView from "@/components/journal/JournalView";

const NoteView = lazy(() => import("@/components/notes/NoteView"));

// view lives in the URL hash (#note=<id>, #project=<id>, #journal) so back/forward works;
// with no hash the last opened project is shown
const readHash = () => {
  const m = location.hash.match(/^#(note|project)=([\w-]+)/);
  if (m) return { [m[1]]: m[2] };
  if (location.hash === "#journal") return { journal: true };
  let last = null; try { last = localStorage.getItem("lastProject"); } catch {}
  return last ? { project: last, home: true } : { journal: true };
};

export default function Shell() {
  const db = useDb();
  const [view, setView] = useState(readHash);
  const [menu, setMenu] = useState(false);

  useEffect(() => { loadMe().catch(() => {}); }, []);
  useEffect(() => {
    const on = () => setView(readHash());
    window.addEventListener("hashchange", on); window.addEventListener("popstate", on);
    return () => { window.removeEventListener("hashchange", on); window.removeEventListener("popstate", on); };
  }, []);

  const go = v => {
    setMenu(false);
    const hash = v.note ? "#note=" + v.note : v.project ? "#project=" + v.project : "#journal";
    if (location.hash !== hash) history.pushState(null, "", hash || location.pathname + location.search);
    setView(v);
  };

  // the remembered project may be gone; then the journal is home
  const project = view.project && !(view.home && db.ready && !db.projects.some(b => b.id === view.project)) ? view.project : null;
  const shown = view.note ? db.notes.find(n => n.id === view.note) : project ? db.projects.find(b => b.id === project) : null;
  const title = shown ? itemName({ ...shown, kind: view.note ? "note" : "project" }) : "Журнал";
  const sidebar = <Sidebar view={{ ...view, project, journal: !view.note && !project }} go={go} email={db.email} />;

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:flex md:flex-col">{sidebar}</aside>
      <Sheet open={menu} onOpenChange={setMenu}><SheetContent>{sidebar}</SheetContent></Sheet>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-2 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" aria-label="Меню" onClick={() => setMenu(true)}><MenuIcon /></Button>
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        {db.error && <p className="m-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive">Нет связи с базой: {db.error}. Обнови страницу.</p>}
        <motion.div key={view.note || project || "journal"} className="flex flex-1 flex-col" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
          {view.note
            ? <Suspense fallback={null}><NoteView id={view.note} fresh={view.fresh} go={go} /></Suspense>
            : project ? <ProjectView id={project} fresh={view.fresh} go={go} /> : <JournalView />}
        </motion.div>
      </main>
      <ConfirmHost />
    </div>
    </MotionConfig>
  );
}

function Sidebar({ view, go, email }) {
  const db = useDb(), me = useMe();
  const [profile, setProfile] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const create = async kind => {
    if (kind === "folder") return newFolder("");
    const id = kind === "note" ? await newNote("") : await newProject("");
    if (id) go({ [kind]: id, fresh: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-2">
        <button type="button" onClick={() => go({ journal: true })}
          className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-accent", view.journal && "bg-accent")}>
          <BookOpenIcon className="size-4" />Журнал
        </button>
      </div>
      <div className="flex h-8 items-center gap-0.5 px-4 pt-2 pb-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Проекты и заметки</span>
        <span className="ml-auto" />
        <IconBtn label="Поиск" onClick={() => { setSearching(s => !s); setQuery(""); }}>{searching ? <XIcon /> : <SearchIcon />}</IconBtn>
        <CreateMenu onCreate={create} trigger={<IconBtn label="Создать"><PlusIcon /></IconBtn>} />
      </div>
      {searching && (
        <div className="px-3 pb-2">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти проект или заметку"
            onKeyDown={e => e.key === "Escape" && (setSearching(false), setQuery(""))}
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50" />
        </div>
      )}
      <nav className={cn("min-h-0 flex-1 overflow-y-auto pb-4 transition-colors", dropping && "bg-accent/60 ring-2 ring-ring/40 ring-inset")} aria-label="Проекты и заметки"
        onDragOver={e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDropping(true); } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false); }}
        onDrop={async e => { e.preventDefault(); setDropping(false); importFiles(await fromDrop(e.dataTransfer)); }}>
        <NotesTree view={view} go={go} query={searching ? query.trim() : ""} />
        {dropping && <p className="px-4 py-2 text-sm text-muted-foreground">Отпусти, чтобы импортировать .md</p>}
      </nav>
      <div className="flex items-center gap-1 border-t p-2 text-sm">
        <button type="button" onClick={() => setProfile(true)} title="Профиль: имя и аватарка"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent">
          <Avatar person={{ ...me, email, user_id: db.me }} />
          <span className="min-w-0">
            {me?.name && <span className="block truncate font-medium">{me.name}</span>}
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
        </button>
        <ProfileDialog open={profile} onOpenChange={setProfile} />
        <Button variant="ghost" size="iconSm" className="shrink-0" aria-label="Выйти" title="Выйти" onClick={() => sb.auth.signOut()}><LogOutIcon /></Button>
      </div>
    </div>
  );
}
