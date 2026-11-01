import { smoothBy } from "@/lib/smoothScroll";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs) => twMerge(clsx(inputs));

// a horizontal strip (tabs, tags) scrolls sideways with the mouse wheel
export function wheelX(el) {
  if (!el || el._wheelX) return;
  el._wheelX = true;
  el.addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    // a mouse notch glides, a touchpad moves as it is
    if (Math.abs(e.deltaY) >= 50 || e.deltaMode) smoothBy(el, "x", e.deltaY * (e.deltaMode ? 40 : 1));
    else el.scrollLeft += e.deltaY;
  }, { passive: false });
}
