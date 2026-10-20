import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { sb, start, stop, setErrorHandler, subscribe } from "@/lib/db";
import { startNative, isApp } from "@/lib/native";
import { webReminders } from "@/lib/reminders";
import { getDb } from "@/lib/db";
import Login from "@/components/Login";
import Shell from "@/components/Shell";

setErrorHandler(msg => toast.error(msg));

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
