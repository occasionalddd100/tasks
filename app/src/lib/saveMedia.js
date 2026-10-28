import { toast } from "sonner";

// Saves pictures / videos: in the Android app straight into the gallery (Pictures/Задачи, Movies/Задачи),
// in a browser as ordinary downloads. items: [{ url, name? }], url may be https, data: or blob:.
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
const asData = url => fetch(url).then(r => r.blob()).then(b => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); }));

export async function saveMedia(items) {
  items = items.filter(i => i?.url);
  if (!items.length) return;
  const n = items.length, base = stamp();
  const named = items.map((it, k) => ({ url: it.url, name: it.name || (n > 1 ? `${base}-${k + 1}` : base) }));
  if (window.AndroidMedia) {
    const id = toast.loading(n > 1 ? `Сохраняю ${n}…` : "Сохраняю…");
    const list = await Promise.all(named.map(async it => it.url.startsWith("blob:") ? { ...it, url: await asData(it.url) } : it));
    window.addEventListener("mediasaved", e => {
      const { ok, fail } = e.detail || {};
      if (!fail) toast.success(ok > 1 ? `Сохранено в галерею: ${ok}` : "Сохранено в галерею", { id });
      else if (ok) toast.warning(`Сохранено ${ok}, не получилось ${fail}`, { id });
      else toast.error("Не получилось сохранить", { id });
    }, { once: true });
    window.AndroidMedia.save(JSON.stringify(list));
    return;
  }
  let failed = 0;
  for (const it of named) {
    try {
      const r = await fetch(it.url); if (!r.ok) throw new Error(r.status);
      const b = await r.blob(), ext = (b.type.split("/")[1] || "jpg").replace("jpeg", "jpg").replace("quicktime", "mov");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = it.name + "." + ext; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (n > 1) await new Promise(r => setTimeout(r, 300)); // browsers drop downloads fired all at once
    } catch { failed++; if (n === 1) window.open(it.url, "_blank", "noopener"); }
  }
  if (n > 1) failed ? toast.warning(`Скачано ${n - failed} из ${n}`) : toast.success(`Скачано: ${n}`);
}
