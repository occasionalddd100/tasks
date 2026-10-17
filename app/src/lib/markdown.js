import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });
export const renderMd = md => DOMPurify.sanitize(marked.parse(md || ""));
// first meaningful line, for compact hints
export const mdExcerpt = (md, n = 80) => {
  const line = (md || "").split("\n").map(s => s.replace(/^[#>\-*\s\d.[\]x]+/i, "").trim()).find(Boolean) || "";
  return line.length > n ? line.slice(0, n) + "…" : line;
};
