import { $prose } from "@milkdown/kit/utils";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { clearTextInCurrentBlockCommand } from "@milkdown/kit/preset/commonmark";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { viewImages } from "@/components/stash/Pics";

// pictures go into the note itself as data URLs: shrink them first so a note with a gallery stays light
export const shrinkImage = (file, max = 1600) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    resolve(cv.toDataURL(file.type === "image/png" && k === 1 && file.size < 300e3 ? "image/png" : "image/jpeg", 0.82));
  };
  img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
  img.src = url;
});
export const pickImages = () => new Promise(resolve => {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.onchange = async () => resolve(await Promise.all([...inp.files].filter(f => f.type.startsWith("image/")).map(f => shrinkImage(f).catch(() => null))).then(l => l.filter(Boolean)));
  inp.click();
});

// a tag's colour comes from its name (same formula as the stash tags)
const hue = t => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360; return (h * 137) % 360; };
export const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu;
const EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*️?)\s?/u;
const isImage = n => n.type.name === "image";
const isGallery = n => n.type.name === "paragraph" && n.childCount > 1 && n.content.content.filter(isImage).length >= 2
  && n.content.content.every(c => isImage(c) || (c.isText && !c.text.trim()) || c.type.name === "hard_break");

/* hashtags, galleries, icon chips: all drawn as decorations, the note itself stays plain markdown */
const key = new PluginKey("extras");
function decorate(doc) {
  const d = [];
  doc.descendants((n, pos) => {
    if (n.isText) {
      if (n.marks.some(m => m.type.name === "inlineCode" || m.type.name === "link")) return;
      for (const m of n.text.matchAll(TAG_RE)) {
        const from = pos + m.index + m[1].length, to = from + m[2].length + 1;
        d.push(Decoration.inline(from, to, { class: "pm-tag", style: `--h:${hue(m[2].toLowerCase())}`, "data-tag": m[2] }));
      }
      return;
    }
    if (n.type.name === "code_block") return false;
    if (isGallery(n)) {
      d.push(Decoration.node(pos, pos + n.nodeSize, { class: "pm-gallery" }));
      d.push(Decoration.widget(pos + n.nodeSize - 1, () => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "pm-gallery-add"; b.textContent = "+"; b.title = "Добавить картинки"; b.dataset.galleryAdd = String(pos);
        b.contentEditable = "false";
        return b;
      }, { side: 1, ignoreSelection: true, key: "ga" + pos }));
      return false;
    }
    if (n.type.name === "list_item") {
      const p = n.firstChild, m = p?.type.name === "paragraph" && p.textContent.match(EMOJI);
      if (m) {
        const start = pos + 2;
        d.push(Decoration.node(pos, pos + n.nodeSize, { class: "pm-chip-li" }));
        d.push(Decoration.inline(start, start + m[1].length, { class: "pm-chip" }));
      }
    }
  });
  return DecorationSet.create(doc, d);
}

const ICONS = ["⭐", "🔥", "✅", "❗", "❓", "💡", "📌", "🎯", "🎮", "🎬", "📺", "📚", "📖", "🎵", "🎧", "🎨", "✍️", "🧠", "💪", "🏃", "🍿", "🍜", "☕", "🛒", "💰", "🏠", "✈️", "🌿", "❤️", "😂", "🤔", "😴", "👀", "🚀", "🛠️", "🐛", "📅", "⏳", "🔗", "🎁"];
let pop = null;
const closePop = () => { pop?.remove(); pop = null; document.removeEventListener("mousedown", outside, true); };
function outside(e) { if (pop && !pop.contains(e.target)) closePop(); }
// the icon picker opened from a list bullet: puts an emoji at the start of the item (or swaps / removes it)
function iconPicker(view, itemPos, at) {
  closePop();
  const item = view.state.doc.nodeAt(itemPos); if (!item) return;
  const start = itemPos + 2, cur = item.firstChild?.textContent.match(EMOJI);
  pop = document.createElement("div"); pop.className = "pm-icon-pop";
  const set = icon => {
    const tr = view.state.tr;
    if (cur) tr.delete(start, start + cur[0].length);
    if (icon) tr.insertText(icon + " ", start);
    view.dispatch(tr); view.focus(); closePop();
  };
  for (const i of ICONS) { const b = document.createElement("button"); b.type = "button"; b.textContent = i; b.onclick = () => set(i); pop.appendChild(b); }
  if (cur) { const b = document.createElement("button"); b.type = "button"; b.className = "wide"; b.textContent = "Обычный маркер"; b.onclick = () => set(null); pop.appendChild(b); }
  document.body.appendChild(pop);
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(at.left, innerWidth - w - 8)) + "px";
  pop.style.top = (at.bottom + h + 8 > innerHeight ? at.top - h - 6 : at.bottom + 6) + "px";
  setTimeout(() => document.addEventListener("mousedown", outside, true));
}

const listItemAt = (view, el) => {
  const block = el.closest(".milkdown-list-item-block"); if (!block) return null;
  let pos; try { pos = view.posAtDOM(block, 0); } catch { return null; }
  const $p = view.state.doc.resolve(pos);
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === "list_item") return $p.before(d);
  const after = view.state.doc.nodeAt(pos);
  return after?.type.name === "list_item" ? pos : null;
};

export const extras = $prose(() => new Plugin({
  key,
  state: {
    init: (_, s) => decorate(s.doc),
    apply: (tr, v, _, s) => (tr.docChanged ? decorate(s.doc) : v),
  },
  props: {
    decorations(state) { return key.getState(state); },
  },
  // listening in the capture phase: crepe's list and image views swallow their own clicks
  view(view) {
    const on = e => { if (down(view, e)) { e.stopPropagation(); } };
    view.dom.addEventListener("mousedown", on, true);
    return { destroy: () => view.dom.removeEventListener("mousedown", on, true) };
  },
}));

function down(view, e) {
  {
    {
      {
        const t = e.target;
        if (!(t instanceof Element)) return false;
        // galleries: tap a picture to look through all of them; "+" adds more
        const add = t.closest(".pm-gallery-add");
        if (add) {
          e.preventDefault();
          const pos = +add.dataset.galleryAdd;
          pickImages().then(srcs => {
            const n = view.state.doc.nodeAt(pos); if (!n || !srcs.length) return;
            const img = view.state.schema.nodes.image;
            view.dispatch(view.state.tr.insert(pos + n.nodeSize - 1, srcs.map(src => img.create({ src, alt: "" }))));
          });
          return true;
        }
        const g = t.closest(".pm-gallery");
        if (g && t.tagName === "IMG" && (!view.editable || e.detail >= 2 || e.altKey)) {
          e.preventDefault();
          const all = [...g.querySelectorAll("img")].filter(i => i.src);
          viewImages(all.map(i => i.src), Math.max(0, all.indexOf(t)));
          return true;
        }
        // tags: open the global search (in reading mode a tap, while writing Ctrl/⌘ + click)
        const tag = t.closest(".pm-tag");
        if (tag && (!view.editable || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("globalsearch", { detail: "#" + tag.dataset.tag }));
          return true;
        }
        // list bullets: pick an icon for the item
        if (view.editable && (t.closest(".label.bullet") || t.closest(".pm-chip"))) {
          const itemPos = listItemAt(view, t);
          if (itemPos != null) { e.preventDefault(); iconPicker(view, itemPos, t.getBoundingClientRect()); return true; }
        }
        return false;
      }
    }
  }
}

// slash menu: «Галерея» asks for several pictures and puts them side by side
export const addGalleryItem = builder => builder.getGroup("advanced").addItem("gallery", {
  label: "Галерея",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  onRun: ctx => {
    ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
    const view = ctx.get(editorViewCtx);
    pickImages().then(srcs => {
      if (!srcs.length) return;
      const { schema, selection } = view.state, $f = selection.$from;
      const para = schema.nodes.paragraph.create(null, srcs.map(src => schema.nodes.image.create({ src, alt: "" })));
      const empty = $f.parent.type.name === "paragraph" && !$f.parent.content.size;
      const tr = empty ? view.state.tr.replaceWith($f.before(), $f.after(), para) : view.state.tr.insert($f.after(), para);
      view.dispatch(tr);
    });
  },
});
