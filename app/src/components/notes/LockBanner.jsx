import { useEffect } from "react";
import { LockIcon } from "lucide-react";

// typing anywhere inside `ref` counts as editing and takes the lock
export function useTypingIn(ref, touch, deps = []) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.addEventListener("beforeinput", touch, true);
    return () => el.removeEventListener("beforeinput", touch, true);
  }, deps);
}

export default function LockBanner({ other }) {
  if (!other) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-md border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
      <LockIcon className="size-4 shrink-0" />
      <span>Сейчас редактирует <b className="font-medium text-foreground">{other.name || "другой участник"}</b>. Откроется, когда закончит.</span>
    </div>
  );
}
