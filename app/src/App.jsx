import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { sb, start, stop, setErrorHandler, setNoticeHandler, subscribe } from "@/lib/db";
import { startNative, isApp } from "@/lib/native";
import { webReminders } from "@/lib/reminders";
import { getDb } from "@/lib/db";
import Login from "@/components/Login";
import Shell from "@/components/Shell";

setErrorHandler(msg => toast.error(msg));
setNoticeHandler(msg => toast(msg));

// The keyboard, as in a native app: the page shrinks above it (viewport meta: resizes-content), the bottom bar steps aside,
// and the line being typed stays in view. Only the caret is followed (not the whole field), by the smallest scroll, so nothing jumps.
if (typeof window !== "undefined") {
  const editable = el => el?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=date]):not([type=time]):not([type=range]),textarea,[contenteditable=true],[contenteditable=true] *");
  const scroller = el => {
    for (let p = el?.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return document.scrollingElement;
  };
  const caret = el => {
    if (el.isContentEditable || el.closest?.("[contenteditable=true]")) {
      const s = getSelection(); if (s?.rangeCount) {
        const rg = s.getRangeAt(0), r = rg.getClientRects()[0] || rg.getBoundingClientRect();
        if (r && (r.top || r.bottom)) return r;
      }
    }
    const r = el.getBoundingClientRect();
    // a tall field: keep its top line in view rather than trying to fit all of it
    return r.height > 160 && el.tagName === "TEXTAREA" ? { top: r.top, bottom: r.top + 72 } : r;
  };
  let raf = 0;
  const keep = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const el = document.activeElement; if (!editable(el)) return;
      const vv = window.visualViewport, top = (vv?.offsetTop || 0) + 64, bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - 16;
      const r = caret(el), d = r.bottom > bottom ? r.bottom - bottom : r.top < top ? r.top - top : 0;
      if (Math.abs(d) > 2) scroller(el)?.scrollBy({ top: d, behavior: "smooth" });
    });
  };
  // keyboard up = the window got much shorter than its tallest; the bottom bar hides meanwhile
  let tallest = innerHeight;
  const sense = () => {
    const h = window.visualViewport?.height || innerHeight;
    if (h > tallest) tallest = h;
    const up = tallest - h > 150 && editable(document.activeElement);
    document.documentElement.toggleAttribute("data-kb", up);
    if (up) setTimeout(keep, 60);
  };
  addEventListener("orientationchange", () => { tallest = 0; setTimeout(sense, 400); });
  window.visualViewport?.addEventListener("resize", sense);
  addEventListener("resize", sense);
  addEventListener("focusin", e => { if (editable(e.target)) { setTimeout(keep, 320); setTimeout(sense, 320); } });
  addEventListener("focusout", () => setTimeout(sense, 100));
  addEventListener("input", e => { if (editable(e.target)) keep(); });
  document.addEventListener("selectionchange", () => { if (document.documentElement.hasAttribute("data-kb")) keep(); });
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((ev, s) => {
      if (ev === "SIGNED_OUT") { stop(); setSession(null); }
      else if (s) setSession(prev => (prev?.user?.id === s.user.id ? prev : s));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    start(session.user).then(() => {
      startNative(subscribe);
      // browser / PWA on the PC: reminders while the tab is open (the phone app schedules real notifications)
      if (!isApp) { let t = null; const sync = () => { clearTimeout(t); t = setTimeout(() => getDb().ready && webReminders(getDb()), 1500); }; subscribe(sync); sync(); }
    });
  }, [session?.user?.id]);

  return (
    <>
      {session === undefined ? null : session ? <Shell /> : <Login />}
      <Toaster position="bottom-center" richColors closeButton />
    </>
  );
}
