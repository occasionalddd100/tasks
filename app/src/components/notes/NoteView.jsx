import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MoreHorizontalIcon, UsersIcon, ChevronRightIcon } from "lucide-react";
import { useDb, update, isMine } from "@/lib/db";
import { folderPath } from "@/lib/notes";
import { NoteMenu } from "@/components/notes/NotesTree";
import { Button } from "@/components/ui/button";

const Editor = lazy(() => import("@/components/notes/Editor"));

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
  const titleRef = useRef(null), editorRef = useRef(null), editingTitle = useRef(false);

  useEffect(() => { if (fresh) titleRef.current?.focus(); }, [id]);
  // follow remote title changes unless the title field is being edited
  useEffect(() => { if (note && !editingTitle.current) setTitle(note.title || ""); }, [note?.title]);

  if (!db.ready) return null;
  if (!note) return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 px-6 py-16 text-muted-foreground">
      <p>Заметки нет: её удалили или закрыли к ней доступ.</p>
      <Button variant="outline" onClick={() => go({ tasks: true })}>К задачам</Button>
    </div>
  );

  const path = folderPath(db.folders, note.folder);
  const shared = path.some(f => !isMine(f) || db.grants.some(g => g.coll === "folders" && g.target === f.id));
  const focusEditor = () => editorRef.current?.focus();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 md:px-10 md:pt-10">
      <div className="mb-6 flex min-h-8 items-center gap-1 text-sm text-muted-foreground">
        {path.length ? path.map((f, i) => (
          <span key={f.id} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0" />}
            <span className="truncate">{f.name}</span>
          </span>
        )) : <span>Без папки</span>}
        {shared && <UsersIcon className="ml-1 size-3.5 shrink-0" aria-label="Общая папка" />}
        <span className="ml-auto" />
        <NoteMenu n={note} folders={db.folders} after={() => go({ tasks: true })}
          trigger={<Button variant="ghost" size="iconSm" aria-label="Действия с заметкой"><MoreHorizontalIcon /></Button>} />
      </div>
      <textarea
        ref={titleRef} rows={1} value={title} placeholder="Без названия"
        onFocus={() => { editingTitle.current = true; }}
        onBlur={() => { editingTitle.current = false; }}
        onChange={e => { setTitle(e.target.value); save({ title: e.target.value }); }}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); focusEditor(); } }}
        className="field-sizing-content w-full resize-none bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/60 md:text-4xl"
      />
      <Suspense fallback={<p className="py-4 text-sm text-muted-foreground">Загружаю редактор…</p>}>
        <Editor key={id} value={note.body || ""} onChange={body => save({ body })} onReady={c => { editorRef.current = c; }} />
      </Suspense>
    </div>
  );
}
