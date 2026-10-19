import { toast } from "sonner";
import { add } from "@/lib/db";

// Import .md files (or a whole folder, e.g. an Obsidian vault) as notes, keeping the folder tree.
// Images next to the notes are inlined as data URLs when small enough, like pasted images.
const MAX_IMAGE = 1024 * 1024;
const isMd = n => /\.(md|markdown|txt)$/i.test(n);
const isImg = n => /\.(png|jpe?g|gif|webp|svg)$/i.test(n);
const hidden = p => p.split("/").some(s => s.startsWith("."));
const base = p => p.split("/").pop();

const readText = f => f.text();
const readUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

// items: [{ path: "Vault/sub/note.md", file }]
export async function importFiles(items, target = "") {
  items = items.filter(x => !hidden(x.path));
  const notes = items.filter(x => isMd(x.path));
  if (!notes.length) { toast.error("Нет .md файлов"); return 0; }

  const images = new Map();
  for (const x of items.filter(x => isImg(x.path) && x.file.size <= MAX_IMAGE)) {
    try { const url = await readUrl(x.file); images.set(x.path, url); images.set(base(x.path), url); } catch {}
  }
  const findImg = (ref, from) => {
    ref = decodeURIComponent(ref.split("|")[0].trim());
    const dir = from.split("/").slice(0, -1).join("/");
    return images.get((dir ? dir + "/" : "") + ref.replace(/^\.\//, "")) || images.get(base(ref));
  };

  const folders = new Map([["", target]]);
  const folderFor = async dir => {
    if (folders.has(dir)) return folders.get(dir);
    const parts = dir.split("/"), parent = await folderFor(parts.slice(0, -1).join("/"));
    const id = await add("folders", { name: parts.at(-1), parent });
    folders.set(dir, id || parent);
    return id || parent;
  };

  let n = 0;
  for (const x of notes) {
    let body;
    try { body = await readText(x.file); } catch (e) { console.warn("import", x.path, e); continue; }
    body = body
      .replace(/!\[\[([^\]]+)\]\]/g, (m, ref) => { const u = findImg(ref, x.path); return u ? `![](${u})` : m; })
      .replace(/!\[([^\]]*)\]\((?!https?:|data:)([^)\s]+)\)/g, (m, alt, ref) => { const u = findImg(ref, x.path); return u ? `![${alt}](${u})` : m; });
    const dir = x.path.split("/").slice(0, -1).join("/");
    const folder = await folderFor(dir);
    if (await add("notes", { title: base(x.path).replace(/\.(md|markdown|txt)$/i, ""), body, folder, updated: new Date(x.file.lastModified || Date.now()).toISOString() })) n++;
  }
  toast.success(`Импортировано заметок: ${n}`);
  return n;
}

export const fromInput = files => [...files].map(file => ({ path: file.webkitRelativePath || file.name, file }));

// drag and drop: walk dropped folders too
export async function fromDrop(dt) {
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) { const file = await new Promise((res, rej) => entry.file(res, rej)); out.push({ path: prefix + entry.name, file }); return; }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, prefix + entry.name + "/");
    }
  };
  const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) for (const e of entries) await walk(e, "");
  else for (const file of dt.files) out.push({ path: file.name, file });
  return out;
}
