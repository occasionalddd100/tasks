import { useEffect, useRef } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll, $prose } from "@milkdown/kit/utils";
import { keymap } from "@milkdown/kit/prose/keymap";
import { sinkListItem, liftListItem } from "@milkdown/kit/prose/schema-list";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { editorViewCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { toast } from "sonner";
import { extras, addGalleryItem, shrinkImage } from "@/components/notes/extras";

const MAX_IMAGE = 1024 * 1024;
// images live inside the note as data URLs, so keep them small
// (big photos are shrunk first; only what is still too big is refused)
const toDataUrl = async file => {
  const url = await shrinkImage(file).catch(() => null);
  if (!url || url.length > MAX_IMAGE * 1.37) { toast.error("Картинка слишком большая, вставь ссылкой"); throw new Error("too big"); }
  return url;
};

// Tab / Shift+Tab nest and un-nest list items like Obsidian; tables and code blocks keep their own Tab
const inTable = state => { const $f = state.selection.$from; for (let d = $f.depth; d > 0; d--) if (/table/.test($f.node(d).type.name)) return true; return false; };
const inList = state => { const $f = state.selection.$from; for (let d = $f.depth; d > 0; d--) if ($f.node(d).type.name === "list_item") return true; return false; };
const listTabs = $prose(() => keymap({
  Tab: (state, dispatch) => {
    if (inTable(state)) return false;
    if (inList(state)) { sinkListItem(state.schema.nodes.list_item)(state, dispatch); return true; }
    dispatch?.(state.tr.insertText("\t")); return true;
  },
  "Shift-Tab": (state, dispatch) => {
    if (inTable(state)) return false;
    if (inList(state)) liftListItem(state.schema.nodes.list_item)(state, dispatch);
    return true;
  },
}));

// headings, Obsidian style: "##" shows while the cursor is in the heading; Backspace at its start
// removes one "#" (h1 becomes text), "#" at its start adds one
const headingAt = state => { const { $from, empty } = state.selection; return empty && $from.parent.type.name === "heading" ? $from : null; };
const headingKeys = $prose(() => keymap({
  Backspace: (state, dispatch) => {
    const $f = headingAt(state); if (!$f || $f.parentOffset !== 0) return false;
    const pos = $f.before(), lvl = $f.parent.attrs.level;
    if (dispatch) dispatch(lvl > 1 ? state.tr.setNodeMarkup(pos, null, { ...$f.parent.attrs, level: lvl - 1 }) : state.tr.setNodeMarkup(pos, state.schema.nodes.paragraph));
    return true;
  },
  "#": (state, dispatch) => {
    const $f = headingAt(state); if (!$f || $f.parentOffset !== 0 || $f.parent.attrs.level >= 6) return false;
    dispatch?.(state.tr.setNodeMarkup($f.before(), null, { ...$f.parent.attrs, level: $f.parent.attrs.level + 1 }));
    return true;
  },
}));

// sections: content sits indented under its heading with guide lines, and a heading folds what belongs to it.
// Fold buttons live in an overlay next to the editor (not inside the text) so the caret never trips on them.
const foldKey = new PluginKey("fold");
function scan(state) {
  const folded = foldKey.getState(state), doc = state.doc, decos = [], heads = [], seen = new Map();
  const cur = headingAt(state)?.before();
  let min = 6; doc.forEach(n => { if (n.type.name === "heading") min = Math.min(min, n.attrs.level); });
  const kids = []; doc.forEach((n, pos) => kids.push([n, pos]));
  let sec = 0, hide = 0;
  kids.forEach(([n, pos], i) => {
    const end = pos + n.nodeSize;
    if (n.type.name === "heading") {
      const L = n.attrs.level;
      if (hide && L <= hide) hide = 0;
      if (hide) { decos.push(Decoration.node(pos, end, { class: "pm-hidden" })); return; }
      const base = L + "|" + n.textContent, c = (seen.get(base) || 0) + 1; seen.set(base, c);
      const key = base + "|" + c, isFolded = folded.has(key);
      const next = kids[i + 1]?.[0], hasBody = !!next && !(next.type.name === "heading" && next.attrs.level <= L);
      decos.push(Decoration.node(pos, end, { class: "pm-sec pm-h" + (isFolded && hasBody ? " pm-folded" : "") + (pos === cur ? " pm-cur" : ""), style: `--d:${L - min}`, "data-hashes": "#".repeat(L) + " " }));
      if (hasBody) heads.push({ pos, key, folded: isFolded });
      if (isFolded && hasBody) hide = L;
      sec = L;
    } else {
      decos.push(Decoration.node(pos, end, hide ? { class: "pm-hidden" } : { class: "pm-sec", style: `--d:${sec ? sec - min + 1 : 0}` }));
    }
  });
  return { decos, heads };
}
const CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
function sections(storeKey) {
  const load = () => { try { return new Set(JSON.parse(localStorage.getItem(storeKey) || "[]")); } catch { return new Set(); } };
  return $prose(() => new Plugin({
    key: foldKey,
    state: {
      init: load,
      apply(tr, v) {
        const k = tr.getMeta(foldKey); if (!k) return v;
        const n = new Set(v); n.has(k) ? n.delete(k) : n.add(k);
        try { localStorage.setItem(storeKey, JSON.stringify([...n])); } catch {}
        return n;
      },
    },
    props: { decorations: state => DecorationSet.create(state.doc, scan(state).decos) },
    view(view) {
      const host = view.dom.parentElement, layer = document.createElement("div");
      layer.className = "pm-fold-layer"; host.style.position ||= "relative"; host.appendChild(layer);
      let raf = 0;
      const draw = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const { heads } = scan(view.state), base = host.getBoundingClientRect();
          layer.textContent = "";
          for (const h of heads) {
            const el = view.nodeDOM(h.pos); if (!(el instanceof HTMLElement)) continue;
            const r = el.getBoundingClientRect();
            const b = document.createElement("button");
            b.type = "button"; b.className = "pm-fold" + (h.folded ? " is-folded" : ""); b.innerHTML = CHEVRON;
            b.setAttribute("aria-label", h.folded ? "Развернуть раздел" : "Свернуть раздел");
            b.style.top = r.top - base.top + Math.min(r.height, parseFloat(getComputedStyle(el).lineHeight) || r.height) / 2 - 10 + "px";
            b.style.left = r.left - base.left - 24 + "px";
            b.onmousedown = e => { e.preventDefault(); view.dispatch(view.state.tr.setMeta(foldKey, h.key)); };
            layer.appendChild(b);
          }
        });
      };
      const ro = new ResizeObserver(draw); ro.observe(view.dom);
      draw();
      return { update: draw, destroy: () => { ro.disconnect(); cancelAnimationFrame(raf); layer.remove(); } };
    },
  }));
}

const RU = {
  [CrepeFeature.Placeholder]: { text: "Пиши здесь. «/» откроет меню блоков" },
  [CrepeFeature.ImageBlock]: { onUpload: toDataUrl, inlineUploadButton: "Загрузить", inlineUploadPlaceholderText: "или вставь ссылку", blockUploadButton: "Загрузить файл", blockUploadPlaceholderText: "или вставь ссылку", blockCaptionPlaceholderText: "Подпись" },
  [CrepeFeature.LinkTooltip]: { inputPlaceholder: "Вставь ссылку" },
  [CrepeFeature.BlockEdit]: {
    buildMenu: addGalleryItem,
    textGroup: { label: "Текст", text: { label: "Текст" }, h1: { label: "Заголовок 1" }, h2: { label: "Заголовок 2" }, h3: { label: "Заголовок 3" }, h4: { label: "Заголовок 4" }, h5: { label: "Заголовок 5" }, h6: { label: "Заголовок 6" }, quote: { label: "Цитата" }, divider: { label: "Разделитель" } },
    listGroup: { label: "Списки", bulletList: { label: "Маркированный" }, orderedList: { label: "Нумерованный" }, taskList: { label: "Чек-лист" } },
    advancedGroup: { label: "Ещё", image: { label: "Картинка" }, codeBlock: { label: "Код" }, table: { label: "Таблица" }, math: { label: "Формула" } },
  },
};

// Milkdown Crepe: WYSIWYG markdown in the spirit of Obsidian's live preview; stores plain markdown.
// `value` updates from other people are applied only while the local user is not typing.
export default function Editor({ value, onChange, onReady, readOnly, foldKey: storeKey = "fold:misc" }) {
  const root = useRef(null), crepe = useRef(null);
  const last = useRef(value), typedAt = useRef(0), cb = useRef(onChange), ro = useRef(readOnly);
  cb.current = onChange; ro.current = readOnly;

  useEffect(() => {
    const c = new Crepe({ root: root.current, defaultValue: value || "", featureConfigs: RU });
    // Obsidian-style "-" bullets; opening a note must not rewrite it
    c.editor.config(ctx => ctx.update(remarkStringifyOptionsCtx, o => ({ ...o, bullet: "-" })));
    c.editor.use(listTabs).use(headingKeys).use(sections(storeKey)).use(extras);
    let ready = false;
    c.on(l => l.markdownUpdated((_, md) => {
      if (!ready || md === last.current) return;
      last.current = md; typedAt.current = Date.now(); cb.current(md);
    }));
    let alive = true;
    c.create().then(() => { last.current = c.getMarkdown(); ready = true; if (alive) { crepe.current = c; c.setReadonly(!!ro.current); onReady?.({ focus: () => c.editor.action(ctx => ctx.get(editorViewCtx).focus()) }); } });
    return () => { alive = false; crepe.current = null; c.destroy(); };
  }, []);

  useEffect(() => {
    const c = crepe.current;
    if (!c || value === last.current) return;
    if (Date.now() - typedAt.current < 3000) return;
    last.current = value;
    c.editor.action(replaceAll(value || ""));
  }, [value]);

  useEffect(() => { crepe.current?.setReadonly(!!readOnly); }, [readOnly]);

  return <div ref={root} className="min-h-[50vh]" />;
}
