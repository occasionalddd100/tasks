import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { CornerUpLeftIcon } from "lucide-react";
import { useDb } from "@/lib/db";
import { bucketList, fromBucket } from "@/lib/focus";
import { placeOf } from "@/lib/focus";
import { openTask } from "@/components/tasks/TaskSheet";
import { useBackClose } from "@/lib/back";
import { cn } from "@/lib/utils";

// A pail floating in the corner of «Задачи». Drag work onto it to put it aside (or use «Отложить» on a task);
// the lid lifts while something is dragged, the pail fills up with what's inside. Tap it to see and take things back.
export default function Bucket({ docked }) {
  const db = useDb();
  const list = bucketList(db);
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({ id: "bucket" });
  const [open, setOpen] = useState(false);
  useBackClose(open, () => setOpen(false));
  const shake = useAnimationControls();
  const prev = useRef(list.length);
  useEffect(() => {
    if (list.length > prev.current) shake.start({ rotate: [0, -12, 10, -6, 3, 0], scale: [1, 1.15, 1], transition: { duration: 0.55 } });
    prev.current = list.length;
  }, [list.length]);
  const dragging = !!active;
  if (docked) return <Docked list={list} db={db} setNodeRef={setNodeRef} isOver={isOver} dragging={dragging} shake={shake} />;
  const fill = list.length ? 0.25 + 0.75 * Math.min(list.length, 8) / 8 : 0;

  return createPortal(
    <>
      <motion.div ref={setNodeRef} animate={shake} style={{ touchAction: "none" }}
        className="fixed right-5 bottom-6 z-30 max-md:right-auto max-md:left-4 max-md:bottom-[calc(5rem+var(--sab))]">
        <motion.button type="button" onClick={() => setOpen(o => !o)} aria-label={"Ведёрко: " + list.length} title="Ведёрко: отложенные задачи"
          animate={{ scale: isOver ? 1.25 : dragging ? 1.1 : 1, y: dragging ? -4 : 0 }} transition={{ type: "spring", bounce: 0.45, duration: 0.4 }}
          className={cn("relative grid size-16 place-items-center rounded-full border bg-card/90 shadow-lg transition-colors max-md:size-13",
            isOver ? "border-primary bg-primary/10" : dragging && "border-dashed border-primary/60")}
          style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
          <Pail fill={fill} lid={dragging} over={isOver} />
          {list.length > 0 && (
            <motion.span key={list.length} initial={{ scale: 0.4 }} animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground tabular-nums">{list.length}</motion.span>
          )}
        </motion.button>
        <AnimatePresence>
          {dragging && (
            <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-background">
              {isOver ? "Отпусти" : "Сюда, чтобы отложить"}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
      <AnimatePresence>
        {open && <>
          <motion.div className="fixed inset-0 z-30" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 20 }}
            transition={{ type: "spring", bounce: 0.25, duration: 0.35 }}
            className="fixed right-5 bottom-24 z-40 flex max-h-[60vh] w-80 origin-bottom-right flex-col overflow-hidden rounded-2xl border bg-popover shadow-2xl max-md:right-auto max-md:left-4 max-md:origin-bottom-left max-md:w-[calc(100vw-2rem)] max-md:bottom-[calc(9.5rem+var(--sab))]">
            <div className="flex items-baseline gap-2 border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Ведёрко</h3>
              <span className="text-xs text-muted-foreground">отложено: {list.length}</span>
            </div>
            {list.length === 0
              ? <p className="px-4 py-5 text-sm text-muted-foreground">Пусто. Перетащи сюда задачу, и она подождёт тут.</p>
              : <BucketItems list={list} db={db} onOpen={() => setOpen(false)} />}
          </motion.div>
        </>}
      </AnimatePresence>
    </>,
    document.body
  );
}

// the pail: a lid that lifts while dragging, a handle, and "water" rising with how much is inside
function Pail({ fill, lid, over }) {
  const top = 13, bottom = 34, level = bottom - (bottom - top - 2) * fill;
  return (
    <svg viewBox="0 0 44 40" className="size-9 overflow-visible" aria-hidden>
      <defs><clipPath id="pail-body"><path d="M9 13 L35 13 L32 35 Q31.6 37 29.6 37 L14.4 37 Q12.4 37 12 35 Z" /></clipPath></defs>
      <path d="M12 13 Q22 0 32 13" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted-foreground" />
      <g clipPath="url(#pail-body)">
        <rect x="0" y="0" width="44" height="40" className="fill-muted" />
        <motion.rect x="0" width="44" height="40" className="fill-primary/70" animate={{ y: level }} transition={{ type: "spring", bounce: 0.3, duration: 0.6 }} />
      </g>
      <path d="M9 13 L35 13 L32 35 Q31.6 37 29.6 37 L14.4 37 Q12.4 37 12 35 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <motion.g animate={{ rotate: lid ? (over ? -38 : -22) : 0, y: lid ? -3 : 0 }} style={{ originX: "8px", originY: "12px" }} transition={{ type: "spring", bounce: 0.4, duration: 0.4 }}>
        <rect x="7" y="9.5" width="30" height="3.5" rx="1.75" className="fill-foreground" />
        <rect x="19" y="7" width="6" height="2.5" rx="1" className="fill-foreground" />
      </motion.g>
    </svg>
  );
}

function BucketItems({ list, db, onOpen, dense }) {
  return (
    <ul className={cn("overflow-y-auto", dense ? "p-1" : "p-1.5")}>
      <AnimatePresence initial={false}>
        {list.map((t, k) => (
          <motion.li key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: k * 0.03 } }} exit={{ opacity: 0, x: 40 }}
            className={cn("group flex items-center gap-1 rounded-lg hover:bg-accent", dense ? "px-2 py-1" : "px-2 py-1.5")}>
            <button type="button" onClick={() => { onOpen?.(); openTask(t.id); }} className="min-w-0 flex-1 text-left">
              <span className={cn("leading-snug", dense ? "line-clamp-1 text-[13px]" : "line-clamp-2 text-sm")}>{t.text}</span>
              {!dense && <span className="block truncate text-[11px] text-muted-foreground">{placeOf(db, t)}</span>}
            </button>
            <button type="button" onClick={() => fromBucket(t)} title="Вернуть из ведёрка" aria-label={"Вернуть: " + t.text}
              className={cn("grid shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-primary hover:text-primary-foreground", dense ? "size-7" : "size-8")}><CornerUpLeftIcon className="size-4" /></button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

// computer: the pail sits at the top of the side column, always in sight, with what's inside listed under it
function Docked({ list, db, setNodeRef, isOver, dragging, shake }) {
  const fill = list.length ? 0.25 + 0.75 * Math.min(list.length, 8) / 8 : 0;
  return (
    <motion.section ref={setNodeRef} animate={shake}
      className={cn("rounded-2xl border bg-card/80 transition-colors", isOver ? "border-primary bg-primary/[0.07] ring-2 ring-primary/40" : dragging && "border-dashed border-primary/60")}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <motion.span animate={{ scale: isOver ? 1.2 : 1, y: dragging ? -2 : 0 }} transition={{ type: "spring", bounce: 0.45, duration: 0.4 }} className="grid size-9 place-items-center">
          <Pail fill={fill} lid={dragging} over={isOver} />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] leading-tight font-semibold">Ведёрко</h3>
          <p className="text-xs text-muted-foreground">{dragging ? (isOver ? "Отпусти, чтобы отложить" : "Тащи сюда, чтобы отложить") : list.length ? "отложено: " + list.length : "Перетащи сюда задачу из «В работе»"}</p>
        </div>
        {list.length > 0 && <motion.span key={list.length} initial={{ scale: 0.4 }} animate={{ scale: 1 }} className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums">{list.length}</motion.span>}
      </div>
      {list.length > 0 && <div className="max-h-56 overflow-y-auto border-t"><BucketItems list={list} db={db} dense /></div>}
    </motion.section>
  );
}
