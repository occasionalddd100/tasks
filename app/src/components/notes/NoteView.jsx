import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MoreHorizontalIcon, UsersIcon, ChevronRightIcon, BookOpenIcon, PencilIcon, MoveHorizontalIcon, ShrinkIcon, FileTextIcon, SearchIcon, MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDb, update, isMine } from "@/lib/db";
import { folderPath } from "@/lib/notes";
import { FileMenu } from "@/components/notes/NotesTree";
import { Button } from "@/components/ui/button";
import { useEditLock } from "@/lib/lock";
import { ItemIcon } from "@/components/IconPicker";
import { useNavItems } from "@/components/MobileNav";
import LockBanner, { useTypingIn } from "@/components/notes/LockBanner";

const Editor = lazy(() => import("@/components/notes/Editor"));

// remembered view settings, like Obsidian's readable line length and reading/editing mode
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
function usePref(k, d) {
  const [v, set] = useState(() => pref(k, d));
  return [v, x => { set(x); try { localStorage.setItem(k, x); } catch {} }];
}

// saves are debounced; the latest pending patch is flushed when leaving the note
function useDebouncedSave(id, ms = 600) {
  const pending = useRef({}), timer = useRef(null);
  const flush = () => {
    clearTimeout(timer.current);
    const f = pending.current; pending.current = {};
    if (Object.keys(f).length) update("notes", id, { ...f, updated: new Date().toISOString() });
  };
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => { window.removeEventListener("pagehide", onHide); flush(); };
  }, [id]);
  return patch => { Object.assign(pending.current, patch); clearTimeout(timer.current); timer.current = setTimeout(flush, ms); };
}

export default function NoteView({ id, fresh, go }) {
  const db = useDb();
  const note = db.notes.find(n => n.id === id);
  const save = useDebouncedSave(id);
  const [title, setTitle] = useState(note?.title || "");
  const titleRef = useRef(null), editorRef = useRef(null), editingTitle = useRef(false), box = useRef(null);
  const { other, touch } = useEditLock("notes", id);
  const [width, setWidth] = usePref("noteWidthV2", "wide");
  const [mode, setMode] = usePref("noteMode", "edit");
  const reading = mode === "read" && !fresh;
  const toggleMode = () => setMode(reading ? "edit" : "read");
  // Ctrl/Cmd+E switches reading and editing, as in Obsidian
  useEffect(() => {
    const on = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") { e.preventDefault(); toggleMode(); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });
  useTypingIn(box, touch, [id, !!note]);
  useNavItems([
    { k: "journal", label: "Журнал", icon: BookOpenIcon },
    { k: "search", label: "Поиск", icon: SearchIcon },
    { k: "mode", label: reading ? "Править" : "Читать", icon: reading ? PencilIcon : FileTextIcon, active: reading, onClick: toggleMode },
  ]);

  useEffect(() => { if (fresh) titleRef.current?.focus(); }, [id]);
  // follow remote title changes unless the title field is being edited
  useEffect(() => { if (note && !editingTitle.current) setTitle(note.title || ""); }, [note?.title]);

  if (!db.ready) return null;
  if (!note) return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 px-6 py-16 text-muted-foreground">
      <p>Заметки нет: её удалили или закрыли к ней доступ.</p>
      <Button variant="outline" onClick={() => go({ journal: true })}>К журналу</Button>
    </div>
  );

  const path = folderPath(db.folders, note.folder);
  const shared = path.some(f => !isMine(f) || db.grants.some(g => g.coll === "folders" && g.target === f.id));
  const focusEditor = () => editorRef.current?.focus();

  return (
    <div ref={box} className={cn("mx-auto w-full px-4 pt-5 pb-10 transition-[max-width] duration-300 md:px-8 md:pt-8", width === "wide" ? "max-w-6xl" : "max-w-3xl")}>
      <LockBanner other={other} />
      <header className="flex items-start gap-2">
        <ItemIcon x={note} fallback={FileTextIcon} className="mt-2 size-6 md:mt-2.5" />
        <textarea
          ref={titleRef} rows={1} value={title} placeholder="Без названия" readOnly={!!other || reading}
          onFocus={() => { editingTitle.current = true; }}
          onBlur={() => { editingTitle.current = false; }}
          onChange={e => { setTitle(e.target.value); save({ title: e.target.value }); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); focusEditor(); } }}
          className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50 md:text-3xl"
        />
        <div className="mt-1 flex shrink-0 items-center gap-0.5 text-sm text-muted-foreground md:mt-1.5">
          {path.length > 0 && <span className="mr-1 max-w-40 truncate max-sm:hidden" title={path.map(f => f.name).join(" / ")}>{path.at(-1).name}</span>}
          {shared && <UsersIcon className="mr-1 size-3.5 shrink-0" aria-label="Общая папка" />}
          <Button variant="ghost" size="iconSm" className="max-md:hidden" onClick={() => setWidth(width === "wide" ? "narrow" : "wide")}
            aria-label={width === "wide" ? "Узкий вид" : "Широкий вид"} title={width === "wide" ? "Узкий вид" : "Широкий вид"}>
            {width === "wide" ? <ShrinkIcon /> : <MoveHorizontalIcon />}
          </Button>
          <Button variant={reading ? "secondary" : "ghost"} size="iconSm" onClick={toggleMode}
            aria-label={reading ? "Редактировать" : "Режим чтения"} title={(reading ? "Редактировать" : "Режим чтения") + " (Ctrl+E)"}>
            {reading ? <PencilIcon /> : <BookOpenIcon />}
          </Button>
          <FileMenu x={{ ...note, kind: "note" }} folders={db.folders} after={() => go({ journal: true })}
            trigger={<Button variant="ghost" size="iconSm" aria-label="Действия с заметкой"><MoreHorizontalIcon /></Button>} />
        </div>
      </header>
      <Suspense fallback={<p className="py-4 text-sm text-muted-foreground">Загружаю редактор…</p>}>
        <Editor key={id} foldKey={"fold:" + id} value={note.body || ""} onChange={body => save({ body })} readOnly={!!other || reading} onReady={c => { editorRef.current = c; }} />
      </Suspense>
    </div>
  );
}
