import { useEffect, useRef } from "react";

// Phone "back" (gesture or button) closes the topmost open window instead of leaving the page.
// Each open window adds a history entry with the same URL; back pops it and we close that window.
const stack = [];
let skip = 0;
if (typeof window !== "undefined") window.addEventListener("popstate", () => {
  if (skip) { skip--; return; }
  stack.pop()?.close();
});

export function useBackClose(open, close) {
  const fn = useRef(close); fn.current = close;
  useEffect(() => {
    if (!open) return;
    const me = { id: Math.random().toString(36).slice(2), close: () => fn.current() };
    history.pushState({ ...history.state, overlay: me.id }, "");
    stack.push(me);
    return () => {
      const i = stack.indexOf(me);
      if (i < 0) return; // already closed by back
      stack.splice(i, 1);
      // closed from the UI: drop our entry, unless the app navigated on top of it meanwhile
      if (history.state?.overlay === me.id) { skip++; history.back(); }
    };
  }, [open]);
}
