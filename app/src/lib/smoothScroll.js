// Mac-like scrolling for a mouse wheel on the computer: each notch glides instead of jumping.
// Touchpads already send fine-grained deltas, so their scrolling is left to the browser.
const anim = new WeakMap();

export function smoothBy(el, axis, delta) {
  const key = axis === "x" ? "scrollLeft" : "scrollTop";
  const max = axis === "x" ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
  let a = anim.get(el);
  if (!a || a.axis !== axis || Math.abs(el[key] - a.set) > 2) a = { axis, to: el[key], set: el[key], raf: 0 };
  a.to = Math.max(0, Math.min(max, a.to + delta));
  anim.set(el, a);
  if (a.raf) return;
  let cur = el[key];
  const step = () => {
    // someone else moved it (scrollbar, keyboard, code): let go
    if (Math.abs(el[key] - a.set) > 2) { a.raf = 0; anim.delete(el); return; }
    cur += (a.to - cur) * 0.2;
    if (Math.abs(a.to - cur) < 0.5) cur = a.to;
    el[key] = cur; a.set = el[key];
    a.raf = cur !== a.to ? requestAnimationFrame(step) : 0;
  };
  a.raf = requestAnimationFrame(step);
}

const scrolls = (el, axis, d) => {
  const s = getComputedStyle(el), o = axis === "x" ? s.overflowX : s.overflowY;
  if (!/(auto|scroll|overlay)/.test(o) && el !== document.scrollingElement) return false;
  const pos = axis === "x" ? el.scrollLeft : el.scrollTop;
  const max = axis === "x" ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
  return max > 1 && (d > 0 ? pos < max - 1 : pos > 0);
};

export function initSmoothScroll() {
  if (!matchMedia("(pointer: fine)").matches) return;
  addEventListener("wheel", e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    const notch = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (!notch) return;
    const axis = e.shiftKey ? "x" : "y";
    let d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    for (let el = e.target; el && el.nodeType === 1; el = el.parentElement) {
      if (el.closest?.("[data-native-scroll]")) return;
      if (scrolls(el, axis, d)) {
        if (getComputedStyle(el).scrollSnapType !== "none") return; // snapping lists keep their own feel
        e.preventDefault(); smoothBy(el, axis, d); return; }
      if (el === document.body) break;
    }
    const root = document.scrollingElement;
    if (root && scrolls(root, axis, d)) { e.preventDefault(); smoothBy(root, axis, d); }
  }, { passive: false });
}
