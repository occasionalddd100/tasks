// soft pastel tints for categories and projects; stored by key so the palette can change later
export const PASTELS = [
  { k: "rose", name: "Розовый", c: "oklch(0.78 0.11 15)" },
  { k: "peach", name: "Персиковый", c: "oklch(0.8 0.1 55)" },
  { k: "sand", name: "Песочный", c: "oklch(0.84 0.1 90)" },
  { k: "mint", name: "Мятный", c: "oklch(0.8 0.1 160)" },
  { k: "sky", name: "Голубой", c: "oklch(0.78 0.09 230)" },
  { k: "lavender", name: "Лавандовый", c: "oklch(0.76 0.1 290)" },
  { k: "lilac", name: "Сиреневый", c: "oklch(0.78 0.1 330)" },
];
export const pastel = k => PASTELS.find(p => p.k === k)?.c || null;
// a card tinted with the colour: faint fill, soft border (as variables, so the flat phone layout can drop them)
export const tint = k => {
  const c = pastel(k); if (!c) return undefined;
  return { "--tint": c, "--tint-bg": `color-mix(in oklab, var(--card) 94%, ${c})`, "--tint-bd": `color-mix(in oklab, var(--border) 72%, ${c})` };
};
