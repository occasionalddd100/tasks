import { createClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

const SB_URL = "https://hhqxiwiodbowvnbrahsf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocXhpd2lvZGJvd3ZuYnJhaHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNDgyMzQsImV4cCI6MjEwNzcyNDIzNH0.j0_v9nyuqldNVXpQFLU8Z1xDS_9COPgW3c2cqCzOGK4";

export const sb = createClient(SB_URL, SB_KEY);

export const COLLS = ["projects", "boards", "cats", "tasks", "habits", "log", "folders", "notes", "days", "prefs", "stashes", "clips"];

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
  let data, grants;
  try {
    const [r, g] = await Promise.all([
      sb.from("docs").select("coll,id,data,owner"),
      sb.from("grants").select("coll,target,user_id,owner"),
    ]);
    if (r.error) throw r.error;
    data = r.data; grants = g.data || [];
    store.set(SNAP, JSON.stringify({ me: state.me, data, grants }));
  } catch (e) {
    // no network: open with the last copy this device saw, edits queue up until it's back
    const snap = JSON.parse(store.get(SNAP) || "null");
    if (!isNet(e) || !snap || snap.me !== state.me) throw e;
    data = snap.data; grants = snap.grants; setState({ offline: true });
  }
  for (const c of COLLS) cache[c].clear();
  for (const r of data) cache[r.coll]?.set(r.id, val(r));
  replay();
  dropForeignPersonal();
  state = { ...state, grants };
  emit(...COLLS);
}

/* ───── offline: writes that can't reach the server wait in a queue on this device ───── */
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const SNAP = "tasks.snap", OUT = "tasks.outbox";
let outbox = JSON.parse(store.get(OUT) || "[]");
const saveOut = () => { store.set(OUT, JSON.stringify(outbox)); setState({ pending: outbox.length }); };
const isNet = e => (typeof navigator !== "undefined" && !navigator.onLine) || e instanceof TypeError || /fetch|network|load failed|timeout/i.test(e?.message || "");
// pending edits on top of freshly loaded data, so a reload doesn't undo them
function replay() {
  for (const op of outbox) {
    if (op.me && op.me !== state.me) continue;
    if (op.t === "ins") for (const r of op.rows) cache[r.coll]?.set(r.id, { ...(cache[r.coll].get(r.id) || {}), ...r.data, id: r.id, _owner: state.me });
    if (op.t === "merge") { const o = cache[op.coll]?.get(op.id); if (o) cache[op.coll].set(op.id, { ...o, ...op.f }); }
    if (op.t === "del") op.ids.forEach(id => cache[op.coll]?.delete(id));
  }
}
async function send(op) {
  if (op.t === "ins") for (let i = 0; i < op.rows.length; i += 500) {
    const r = await sb.from("docs").insert(op.rows.slice(i, i + 500));
    if (r.error?.code === "23505") { for (const x of op.rows.slice(i, i + 500)) chk(await sb.rpc("merge_doc", { c: x.coll, i: x.id, f: x.data })); }
    else chk(r);
  }
  if (op.t === "merge") chk(await sb.rpc("merge_doc", { c: op.coll, i: op.id, f: op.f }));
  if (op.t === "del") chk(await sb.from("docs").delete().eq("coll", op.coll).in("id", op.ids));
}
let flushing = false;
export async function flush() {
  if (flushing || !outbox.length) return;
  flushing = true;
  try {
    // edits queued under another account wait for that account; they never go out as this one
    let i = 0;
    while (i < outbox.length) {
      if (outbox[i].me && outbox[i].me !== state.me) { i++; continue; }
      try { await send(outbox[i]); }
      catch (e) { if (isNet(e)) break; fail("Не сохранилось", e); }
      outbox.splice(i, 1); saveOut();
    }
    if (!outbox.some(o => !o.me || o.me === state.me) && state.offline) setState({ offline: false });
  } finally { flushing = false; }
}
// runs a write now, or queues it when there's no network (or earlier writes still wait, to keep their order)
async function write(op, undo, msg = "Не сохранилось") {
  if (outbox.length) { outbox.push({ ...op, me: state.me }); saveOut(); flush(); return true; }
  try { await send(op); return true; }
  catch (e) {
    if (isNet(e)) { outbox.push({ ...op, me: state.me }); saveOut(); onOffline(); return true; }
    undo(); fail(msg, e); return false;
  }
}
let warned = 0;
const onOffline = () => { if (Date.now() - warned > 60e3) { warned = Date.now(); onNotice("Нет сети. Всё сохранится, когда интернет появится."); } };
let onNotice = () => {};
export const setNoticeHandler = f => { onNotice = f; };
if (typeof window !== "undefined") {
  window.addEventListener("online", () => flush());
  setInterval(() => outbox.length && navigator.onLine && flush(), 30e3);
}

// someone else's «Личное» is theirs alone, even if it was once shared: its boards, columns and tasks never show here
const hidden = new Set();
const foreign = (coll, x) => !!x && (
  (coll === "projects" && x.personal && x._owner !== state.me) ||
  (coll === "boards" && hidden.has(x.project)) || (coll === "cats" && hidden.has(x.board)) || (coll === "tasks" && hidden.has(x.cat)));
function dropForeignPersonal() {
  hidden.clear();
  for (const c of ["projects", "boards", "cats", "tasks"])
    for (const x of [...cache[c].values()]) if (foreign(c, x)) { hidden.add(x.id); cache[c].delete(x.id); }
}

let channel = null;
export async function start(user) {
  setState({ me: user.id, email: user.email || "" });
  try { await loadAll(); setState({ ready: true, pending: outbox.length }); flush(); }
  catch (e) { setState({ ready: true, error: e.message || String(e) }); }
  channel?.unsubscribe();
  channel = sb.channel("docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
      const r = p.eventType === "DELETE" ? p.old : p.new;
      if (!cache[r.coll]) return;
      if (p.eventType === "DELETE") cache[r.coll].delete(r.id);
      else { cache[r.coll].set(r.id, val(r)); if (foreign(r.coll, cache[r.coll].get(r.id))) cache[r.coll].delete(r.id); }
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
  const ok = await write({ t: "ins", rows: [{ coll, id, data: strip(data) }] }, () => { cache[coll].delete(id); emit(coll); });
  return ok ? id : null;
}

// many new docs in one request (a scanned folder can bring hundreds)
export async function addMany(coll, list) {
  if (!list.length) return [];
  const rows = list.map(data => ({ coll, id: rid(), data }));
  for (const r of rows) cache[coll].set(r.id, { ...r.data, id: r.id, _owner: state.me });
  emit(coll);
  const ok = await write({ t: "ins", rows }, () => { rows.forEach(r => cache[coll].delete(r.id)); emit(coll); });
  return ok ? rows.map(r => r.id) : [];
}

// a doc with a known id (journal day = "<me>:<date>"): merge into it, or create it on first write
export async function put(coll, id, fields) {
  if (cache[coll].has(id)) return updateMany(coll, [[id, fields]]);
  cache[coll].set(id, { ...fields, id, _owner: state.me }); emit(coll);
  // created meanwhile on another device: send() merges on a duplicate id
  await write({ t: "ins", rows: [{ coll, id, data: fields }] }, () => { cache[coll].delete(id); emit(coll); });
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
  const undo = () => { for (const [id, o] of before) if (o) cache[coll].set(id, o); emit(coll); };
  if (outbox.length) { for (const [id, f] of list) await write({ t: "merge", coll, id, f }, undo); return; }
  // parallel when online; whatever fails for lack of network goes to the queue one by one
  await Promise.all(list.map(([id, f]) => write({ t: "merge", coll, id, f }, undo)));
}

export async function remove(coll, ids) {
  ids = [].concat(ids);
  const before = ids.map(id => [id, cache[coll].get(id)]);
  ids.forEach(id => cache[coll].delete(id)); emit(coll);
  await write({ t: "del", coll, ids }, () => { for (const [id, o] of before) if (o) cache[coll].set(id, o); emit(coll); }, "Не удалилось");
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
