import { Component, lazy, Suspense, useEffect, useState } from "react";
import { freshReload } from "@/lib/reload";
import { BookOpenIcon, SettingsIcon, LogOutIcon, MenuIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { sb, useDb } from "@/lib/db";
import { newNote, newFolder, newProject, newStash } from "@/lib/notes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConfirmHost } from "@/components/Confirm";
import { IconPickerHost } from "@/components/IconPicker";
import MobileNav from "@/components/MobileNav";
import { SettingsHost, openSettings } from "@/components/Settings";
import { useAppearance } from "@/lib/appearance";
import Avatar from "@/components/Avatar";
import ProfileDialog from "@/components/ProfileDialog";
import { loadMe, useMe } from "@/lib/people";
import { importFiles, fromDrop } from "@/lib/importMd";
import { MotionConfig, motion } from "motion/react";
import NotesTree, { IconBtn, CreateMenu, itemName } from "@/components/notes/NotesTree";
import { ProjectView } from "@/components/tasks/ProjectViews";
import JournalView from "@/components/journal/JournalView";

const NoteView = lazy(() => import("@/components/notes/NoteView").catch(e => {
  if (freshReload("chunk:note")) return new Promise(() => {}); // the page is reloading
  throw e;
}));

// a note that fails to open shows a way out instead of an empty screen
class NoteGuard extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">Не получилось открыть.<br /><span className="text-xs opacity-70">{String(this.state.err?.message || this.state.err).slice(0, 160)}</span></p>
        <button type="button" onClick={() => { try { sessionStorage.removeItem("reloadedFor"); } catch {} freshReload("manual" + Date.now()); }} className="h-9 rounded-lg border px-4 text-sm font-medium hover:bg-accent">Обновить</button>
      </div>
    );
  }
}

const StashView = lazy(() => import("@/components/stash/StashView").catch(e => {
  if (freshReload("chunk:stash")) return new Promise(() => {});
  throw e;
}));

const Loading = () => <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground"><span className="animate-pulse">Открываю…</span></div>;

// view lives in the URL hash (#note=<id>, #project=<id>, #stash=<id>, #journal) so back/forward works;
// with no hash (opening the site or the app) the journal is home
const readHash = () => {
  const m = location.hash.match(/^#(note|project|stash)=([\w-]+)/);
  if (m) return { [m[1]]: m[2] };
  if (location.hash === "#journal") return { journal: true };
  return { journal: true };
};

export default function Shell() {
  const db = useDb(), look = useAppearance();
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
    const hash = v.note ? "#note=" + v.note : v.project ? "#project=" + v.project : v.stash ? "#stash=" + v.stash : "#journal";
    if (location.hash !== hash) history.pushState(null, "", hash || location.pathname + location.search);
    setView(v);
  };

  // the remembered project may be gone; then the journal is home
  const project = view.project && !(view.home && db.ready && !db.projects.some(b => b.id === view.project)) ? view.project : null;
  const stash = view.stash || null;
  const shown = view.note ? db.notes.find(n => n.id === view.note) : project ? db.projects.find(b => b.id === project) : stash ? db.stashes.find(b => b.id === stash) : null;
  const title = shown ? itemName({ ...shown, kind: view.note ? "note" : stash ? "stash" : "project" }) : "Журнал";
  const sidebar = <Sidebar view={{ ...view, project, journal: !view.note && !project && !stash }} go={go} email={db.email} search={menu === "search"} />;

  return (
    <MotionConfig reducedMotion={look.motion === "off" ? "always" : "user"}>
    <div className="flex h-dvh overflow-hidden">
      <aside className={cn("hidden shrink-0 border-r bg-sidebar md:flex md:flex-col", { narrow: "w-56", normal: "w-64", wide: "w-80" }[look.sidebar] || "w-64")}>{sidebar}</aside>
      <Sheet open={!!menu} onOpenChange={o => setMenu(o ? "menu" : false)}><SheetContent>{sidebar}</SheetContent></Sheet>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-2 md:hidden" style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
          <Button variant="ghost" size="icon" aria-label="Меню" onClick={() => setMenu(true)}><MenuIcon /></Button>
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        {db.error && <p className="m-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive">Нет связи с базой: {db.error}. Обнови страницу.</p>}
        <motion.div key={view.note || project || stash || "journal"} className="flex flex-1 flex-col" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
          {view.note
            ? <NoteGuard key={view.note}><Suspense fallback={<Loading />}><NoteView id={view.note} fresh={view.fresh} go={go} /></Suspense></NoteGuard>
            : project ? <ProjectView id={project} fresh={view.fresh} go={go} />
            : stash ? <NoteGuard key={stash}><Suspense fallback={<Loading />}><StashView id={stash} fresh={view.fresh} go={go} /></Suspense></NoteGuard>
            : <JournalView />}
        </motion.div>
      </main>
      <MobileNav onMenu={() => setMenu("menu")} onSearch={() => setMenu("search")} onJournal={() => go({ journal: true })} />
      <ConfirmHost />
      <SettingsHost />
      <IconPickerHost />
    </div>
    </MotionConfig>
  );
}

function Sidebar({ view, go, email, search }) {
  const db = useDb(), me = useMe();
  const [profile, setProfile] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(!!search);
  const create = async kind => {
    if (kind === "folder") return newFolder("");
    const id = kind === "note" ? await newNote("") : kind === "stash" ? await newStash("") : await newProject("");
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
        <Button variant="ghost" size="iconSm" className="shrink-0" aria-label="Настройки" title="Настройки" onClick={openSettings}><SettingsIcon /></Button>
        <Button variant="ghost" size="iconSm" className="shrink-0" aria-label="Выйти" title="Выйти" onClick={() => sb.auth.signOut()}><LogOutIcon /></Button>
      </div>
    </div>
  );
}
