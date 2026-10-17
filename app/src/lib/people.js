import { useEffect, useSyncExternalStore } from "react";
import { getDb, rpc, sb } from "@/lib/db";

// who can see a project (for picking a task's assignee), and my own profile
let people = {}, me = null;
const listeners = new Set();
const emit = () => listeners.forEach(f => f());
const sub = f => (listeners.add(f), () => listeners.delete(f));

export async function loadPeople(project) {
  try { people = { ...people, [project]: await rpc("project_people", { p_project: project }) || [] }; emit(); } catch {}
}
export function usePeople(project) {
  const list = useSyncExternalStore(sub, () => people[project]);
  useEffect(() => { if (project) loadPeople(project); }, [project]);
  return list || [];
}

export async function loadMe() {
  const { data } = await sb.from("profiles").select("name,avatar").eq("id", getDb().me).maybeSingle();
  me = { name: data?.name || "", avatar: data?.avatar || "" }; emit();
}
export const useMe = () => useSyncExternalStore(sub, () => me);

export async function saveProfile(name, avatar) {
  await rpc("save_profile", { p_name: name, p_avatar: avatar });
  me = { name: name.trim(), avatar }; emit();
  // refresh my face in projects already loaded
  for (const p of Object.keys(people)) loadPeople(p);
}

export const personName = p => p?.name?.trim() || p?.email?.split("@")[0] || "?";

// shrink a picked image to a small square webp data url (~5-15 KB) so it fits in the profile row
export function avatarFromFile(file, size = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let out = c.toDataURL("image/webp", 0.85);
      if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", 0.85);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не получилось открыть картинку")); };
    img.src = url;
  });
}
