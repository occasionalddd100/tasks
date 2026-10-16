import { useEffect, useRef } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { editorViewCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { toast } from "sonner";

const MAX_IMAGE = 1024 * 1024;
// images live inside the note as data URLs, so keep them small
const toDataUrl = file => new Promise((resolve, reject) => {
  if (file.size > MAX_IMAGE) { toast.error("Картинка больше 1 МБ, вставь ссылкой"); return reject(new Error("too big")); }
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
});

const RU = {
  [CrepeFeature.Placeholder]: { text: "Пиши здесь. «/» откроет меню блоков" },
  [CrepeFeature.ImageBlock]: { onUpload: toDataUrl, inlineUploadButton: "Загрузить", inlineUploadPlaceholderText: "или вставь ссылку", blockUploadButton: "Загрузить файл", blockUploadPlaceholderText: "или вставь ссылку", blockCaptionPlaceholderText: "Подпись" },
  [CrepeFeature.LinkTooltip]: { inputPlaceholder: "Вставь ссылку" },
  [CrepeFeature.BlockEdit]: {
    textGroup: { label: "Текст", text: { label: "Текст" }, h1: { label: "Заголовок 1" }, h2: { label: "Заголовок 2" }, h3: { label: "Заголовок 3" }, h4: { label: "Заголовок 4" }, h5: { label: "Заголовок 5" }, h6: { label: "Заголовок 6" }, quote: { label: "Цитата" }, divider: { label: "Разделитель" } },
    listGroup: { label: "Списки", bulletList: { label: "Маркированный" }, orderedList: { label: "Нумерованный" }, taskList: { label: "Чек-лист" } },
    advancedGroup: { label: "Ещё", image: { label: "Картинка" }, codeBlock: { label: "Код" }, table: { label: "Таблица" }, math: { label: "Формула" } },
  },
};

// Milkdown Crepe: WYSIWYG markdown in the spirit of Obsidian's live preview; stores plain markdown.
// `value` updates from other people are applied only while the local user is not typing.
export default function Editor({ value, onChange, onReady }) {
  const root = useRef(null), crepe = useRef(null);
  const last = useRef(value), typedAt = useRef(0), cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const c = new Crepe({ root: root.current, defaultValue: value || "", featureConfigs: RU });
    // Obsidian-style "-" bullets; opening a note must not rewrite it
    c.editor.config(ctx => ctx.update(remarkStringifyOptionsCtx, o => ({ ...o, bullet: "-" })));
    let ready = false;
    c.on(l => l.markdownUpdated((_, md) => {
      if (!ready || md === last.current) return;
      last.current = md; typedAt.current = Date.now(); cb.current(md);
    }));
    let alive = true;
    c.create().then(() => { last.current = c.getMarkdown(); ready = true; if (alive) { crepe.current = c; onReady?.({ focus: () => c.editor.action(ctx => ctx.get(editorViewCtx).focus()) }); } });
    return () => { alive = false; crepe.current = null; c.destroy(); };
  }, []);

  useEffect(() => {
    const c = crepe.current;
    if (!c || value === last.current) return;
    if (Date.now() - typedAt.current < 3000) return;
    last.current = value;
    c.editor.action(replaceAll(value || ""));
  }, [value]);

  return <div ref={root} className="min-h-[50vh]" />;
}
