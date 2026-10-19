import { createClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

const SB_URL = "https://hhqxiwiodbowvnbrahsf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocXhpd2lvZGJvd3ZuYnJhaHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNDgyMzQsImV4cCI6MjEwNzcyNDIzNH0.j0_v9nyuqldNVXpQFLU8Z1xDS_9COPgW3c2cqCzOGK4";

export const sb = createClient(SB_URL, SB_KEY);

export const COLLS = ["projects", "boards", "cats", "tasks", "habits", "log", "folders", "notes"];

// One table `docs` (coll, id, data jsonb, owner). The store keeps every visible doc in memory,
// applies writes optimistically and follows realtime changes from other people.
let state = { ready: false, error: null, me: null, email: "", grants: [], ...Object.fromEntries(COLLS.map(c => [c, []])) };
const cache = Object.fromEntries(COLLS.map(c => [c, new Map()]));
const listeners = new Set();

const val = r => ({ ...r.data, id: r.id, _owner: r.owner });
function emit(...colls) {
  const next = { ...state };
  for (const c of colls) next[c] = [...cache[c].values()];
  state = next;
  listeners.forEach(f => f());
}
const setState = patch => { state = { ...state, ...patch }; listeners.forEach(f => f()); };

export function useDb() {
  return useSyncExternalStore(f => (listeners.add(f), () => listeners.delete(f)), () => state);
}
export const getDb = () => state;
export const subscribe = f => (listeners.add(f), () => listeners.delete(f));

const chk = r => { if (r.error) throw r.error; return r; };
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const strip = ({ id, _owner, ...data }) => data;

async function loadAll() {
  const [{ data, error }, g] = await Promise.all([
    sb.from("docs").select("coll,id,data,owner"),
    sb.from("grants").select("coll,target,user_id,owner"),
  ]);
  if (error) throw error;
  for (const c of COLLS) cache[c].clear();
  for (const r of data) cache[r.coll]?.set(r.id, val(r));
  state = { ...state, grants: g.data || [] };
  emit(...COLLS);
}

let channel = null;
export async function start(user) {
  setState({ me: user.id, email: user.email || "" });
  try { await loadAll(); setState({ ready: true }); }
  catch (e) { setState({ ready: true, error: e.message || String(e) }); }
  channel?.unsubscribe();
  channel = sb.channel("docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
      const r = p.eventType === "DELETE" ? p.old : p.new;
      if (!cache[r.coll]) return;
      if (p.eventType === "DELETE") cache[r.coll].delete(r.id);
      else cache[r.coll].set(r.id, val(r));
      emit(r.coll);
    })
    // someone shared or removed access: what is visible changed, refetch it all
    .on("postgres_changes", { event: "*", schema: "public", table: "grants" }, () => loadAll().catch(() => {}))
    .subscribe();
}
export function stop() { channel?.unsubscribe(); channel = null; }

let onError = () => {};
export const setErrorHandler = f => { onError = f; };
const fail = (msg, e) => { onError(msg + ": " + (e?.message || e)); };

export async function add(coll, data) {
  const id = rid();
  cache[coll].set(id, { ...data, id, _owner: state.me }); emit(coll);
  try { chk(await sb.from("docs").insert({ coll, id, data: strip(data) })); }
  catch (e) { cache[coll].delete(id); emit(coll); fail("Не сохранилось", e); return null; }
  return id;
}

export async function update(coll, id, fields) {
  return updateMany(coll, [[id, fields]]);
}

// several docs at once: one redraw, parallel writes
export async function updateMany(coll, list) {
  if (!list.length) return;
  const before = list.map(([id]) => [id, cache[coll].get(id)]);
  for (const [id, f] of list) { const o = cache[coll].get(id); if (o) cache[coll].set(id, { ...o, ...f }); }
  emit(coll);
  try {
    const rs = await Promise.all(list.map(([id, f]) => sb.rpc("merge_doc", { c: coll, i: id, f })));
    rs.forEach(chk);
  } catch (e) {
    for (const [id, o] of before) if (o) cache[coll].set(id, o);
    emit(coll); fail("Не сохранилось", e);
  }
}

export async function remove(coll, ids) {
  ids = [].concat(ids);
  const before = ids.map(id => [id, cache[coll].get(id)]);
  ids.forEach(id => cache[coll].delete(id)); emit(coll);
  try { chk(await sb.from("docs").delete().eq("coll", coll).in("id", ids)); }
  catch (e) { for (const [id, o] of before) if (o) cache[coll].set(id, o); emit(coll); fail("Не удалилось", e); }
}

export async function rpc(name, args) { return chk(await sb.rpc(name, args)).data; }

export async function share(coll, target, email) {
  await rpc("share", { p_coll: coll, p_target: target, p_email: email });
  await loadAll();
}
export async function unshare(coll, target, member) {
  await rpc("unshare", { p_coll: coll, p_target: target, p_member: member });
  await loadAll();
}
export const members = (coll, target) => rpc("members", { p_coll: coll, p_target: target });

export const isMine = x => !x?._owner || x._owner === state.me;
export const isShared = (coll, id) => state.grants.some(g => g.coll === coll && g.target === id);
