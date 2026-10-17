import { useEffect, useRef, useState } from "react";
import { getDb, rpc, sb } from "@/lib/db";

// One person edits a note at a time. The editor takes a 45 s lease on its first keystroke and renews it
// while typing; after 2 min without input (AFK) it lets go. A closed tab or a crash simply lets the lease
// run out, and the server rejects text from anyone but the lease holder.
const RENEW = 15e3, IDLE = 120e3;

export function useEditLock(coll, id) {
  const [lock, setLock] = useState(null); // { user_id, name, until(ms) }
  const [now, setNow] = useState(Date.now());
  const mine = useRef(false), lastInput = useRef(0), taking = useRef(null);
  const me = getDb().me;

  const apply = r => setLock(r ? { user_id: r.user_id, name: r.name, until: new Date(r.until).getTime() } : null);

  const take = async () => {
    if (taking.current) return taking.current;
    taking.current = rpc("take_lock", { p_coll: coll, p_id: id })
      .then(rows => { const r = rows?.[0]; apply(r); mine.current = r?.user_id === me; return mine.current; })
      .catch(() => false)
      .finally(() => { taking.current = null; });
    return taking.current;
  };
  const release = () => {
    if (!mine.current) return;
    mine.current = false;
    rpc("release_lock", { p_coll: coll, p_id: id }).catch(() => {});
    setLock(l => (l?.user_id === me ? null : l));
  };

  useEffect(() => {
    sb.from("locks").select("user_id,name,until").eq("coll", coll).eq("id", id).maybeSingle().then(({ data }) => apply(data));
    const ch = sb.channel("lock-" + coll + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "locks", filter: "id=eq." + id }, p => {
        const r = p.eventType === "DELETE" ? null : p.new;
        if (r && r.coll !== coll) return;
        if (!r && p.old?.coll && p.old.coll !== coll) return;
        apply(r);
      })
      .subscribe();
    // renew while typing, drop after being idle; also re-check expiry of someone else's lease
    const tick = setInterval(() => {
      setNow(Date.now());
      if (!mine.current) return;
      if (Date.now() - lastInput.current > IDLE) release(); else take();
    }, RENEW);
    const onHide = () => release();
    window.addEventListener("pagehide", onHide);
    return () => { clearInterval(tick); window.removeEventListener("pagehide", onHide); ch.unsubscribe(); release(); };
  }, [coll, id]);

  // a lease is only trusted while it has not run out (with a little slack for clock drift)
  const live = lock && lock.until + 5e3 > now;
  const other = live && lock.user_id !== me ? lock : null;
  useEffect(() => {
    if (!other) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(1e3, other.until + 5e3 - Date.now()));
    return () => clearTimeout(t);
  }, [other?.until]);

  const touch = () => {
    lastInput.current = Date.now();
    if (!mine.current) take();
  };
  return { other, touch };
}
