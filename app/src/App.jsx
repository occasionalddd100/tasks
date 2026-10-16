import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { sb, start, stop, setErrorHandler } from "@/lib/db";
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

  useEffect(() => { if (session?.user) start(session.user); }, [session?.user?.id]);

  return (
    <>
      {session === undefined ? null : session ? <Shell /> : <Login />}
      <Toaster position="bottom-center" richColors closeButton />
    </>
  );
}
