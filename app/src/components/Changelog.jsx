import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CHANGELOG, LATEST } from "@/lib/changelog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// «Что нового»: opened from Settings, and offered once after the app updates
let open = false; const subs = new Set();
export const openChangelog = () => { open = true; subs.forEach(f => f()); };
const close = () => { open = false; subs.forEach(f => f()); };
const SEEN = "changelogSeen";

export function ChangelogHost() {
  const shown = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => open);
  const [, force] = useState(0);
  useEffect(() => {
    let seen = ""; try { seen = localStorage.getItem(SEEN) || ""; } catch {}
    try { localStorage.setItem(SEEN, LATEST); } catch {}
    // a fresh account has nothing to compare with: no pop-up, the tour takes care of it
    if (!seen || seen === LATEST) return;
    const t = setTimeout(() => toast("Обновление: " + CHANGELOG[0].title, { duration: 10000, action: { label: "Что нового", onClick: openChangelog } }), 1500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => force(x => x + 1), [shown]);
  return (
    <Dialog open={shown} onOpenChange={o => !o && close()}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 overflow-hidden p-5 sm:max-w-lg">
        <DialogTitle className="text-base">Что нового</DialogTitle>
        <div className="thin-scroll -mx-1 flex min-h-0 flex-col gap-5 overflow-y-auto px-1 pb-1">
          {CHANGELOG.map((v, i) => (
            <section key={v.id}>
              <h3 className="mb-1.5 flex items-baseline gap-2 font-mono text-sm font-semibold">
                {v.title}<span className="text-xs font-normal text-muted-foreground">{v.date}</span>
                {i === 0 && <span className="rounded bg-primary px-1.5 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">новое</span>}
              </h3>
              <ul className="flex flex-col gap-1 text-sm leading-snug">
                {v.items.map(x => <li key={x} className="flex gap-2"><span className="text-muted-foreground">•</span><span>{x}</span></li>)}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
