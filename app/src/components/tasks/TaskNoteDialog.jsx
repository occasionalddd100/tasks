import { lazy, Suspense, useEffect, useRef } from "react";
import { FileTextIcon } from "lucide-react";
import { update } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const Editor = lazy(() => import("@/components/notes/Editor"));

// markdown note stored inside the task (field `body`), edited in a dialog
export default function TaskNoteDialog({ t, open, onOpenChange }) {
  const pending = useRef(null), timer = useRef(null);
  const flush = () => { clearTimeout(timer.current); if (pending.current !== null) { update("tasks", t.id, { body: pending.current }); pending.current = null; } };
  useEffect(() => { if (!open) flush(); }, [open]);
  useEffect(() => () => flush(), []);
  const onChange = md => { pending.current = md; clearTimeout(timer.current); timer.current = setTimeout(flush, 600); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6"><FileTextIcon className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{t.text}</span></DialogTitle>
          <DialogDescription>Заметка к задаче. Сохраняется сама.</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 [&_.milkdown_.ProseMirror]:!pb-10">
          <Suspense fallback={<p className="py-4 text-sm text-muted-foreground">Загружаю редактор…</p>}>
            {open && <Editor value={t.body || ""} onChange={onChange} onReady={e => e.focus()} />}
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
