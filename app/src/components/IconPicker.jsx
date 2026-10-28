import { useEffect, useState, useSyncExternalStore } from "react";
import {
  FolderIcon, FileTextIcon, ListChecksIcon, LayoutGridIcon, StarIcon, HeartIcon, BookmarkIcon, BookIcon, BriefcaseIcon, CodeIcon, TerminalIcon,
  CpuIcon, BrainIcon, LightbulbIcon, RocketIcon, TargetIcon, FlagIcon, FlameIcon, ZapIcon, MusicIcon, FilmIcon, CameraIcon, ImageIcon, PaletteIcon,
  BrushIcon, PenToolIcon, Gamepad2Icon, TrophyIcon, GraduationCapIcon, DumbbellIcon, CoffeeIcon, UtensilsIcon, HouseIcon, PlaneIcon, MapPinIcon,
  GlobeIcon, ShoppingCartIcon, WalletIcon, CalendarIcon, ClockIcon, BellIcon, MessageCircleIcon, UsersIcon, SmileIcon, SparklesIcon, LeafIcon,
  SunIcon, MoonIcon, ShieldIcon, KeyIcon, DatabaseIcon, ServerIcon, BotIcon, TvIcon, HeadphonesIcon, CarIcon, PawPrintIcon, GiftIcon, ArchiveIcon, InboxIcon,
} from "lucide-react";
import { update } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// a hand-picked set, one line style, so the sidebar stays tidy
export const ICONS = {
  folder: FolderIcon, file: FileTextIcon, tasks: ListChecksIcon, grid: LayoutGridIcon, inbox: InboxIcon, archive: ArchiveIcon,
  star: StarIcon, heart: HeartIcon, bookmark: BookmarkIcon, sparkles: SparklesIcon, flame: FlameIcon, zap: ZapIcon,
  book: BookIcon, study: GraduationCapIcon, brain: BrainIcon, idea: LightbulbIcon, target: TargetIcon, flag: FlagIcon,
  work: BriefcaseIcon, rocket: RocketIcon, code: CodeIcon, terminal: TerminalIcon, cpu: CpuIcon, bot: BotIcon,
  database: DatabaseIcon, server: ServerIcon, shield: ShieldIcon, key: KeyIcon, calendar: CalendarIcon, clock: ClockIcon,
  music: MusicIcon, headphones: HeadphonesIcon, film: FilmIcon, tv: TvIcon, camera: CameraIcon, image: ImageIcon,
  palette: PaletteIcon, brush: BrushIcon, pen: PenToolIcon, game: Gamepad2Icon, trophy: TrophyIcon, gym: DumbbellIcon,
  coffee: CoffeeIcon, food: UtensilsIcon, home: HouseIcon, plane: PlaneIcon, pin: MapPinIcon, globe: GlobeIcon,
  cart: ShoppingCartIcon, wallet: WalletIcon, gift: GiftIcon, bell: BellIcon, chat: MessageCircleIcon, people: UsersIcon,
  smile: SmileIcon, leaf: LeafIcon, sun: SunIcon, moon: MoonIcon, car: CarIcon, paw: PawPrintIcon,
};
export const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#94a3b8"];

// beyond the curated set an item can take any lucide icon ("l:Shirt") or any emoji ("e:🎰");
// the full lucide set is a separate chunk, fetched once on first need
let all = null, loading = null; const waiters = new Set();
const loadAll = () => (loading ??= import("@/lib/allIcons").then(m => { all = m.icons; waiters.forEach(f => f()); }));
function useAll(need = true) {
  const [, tick] = useState(0);
  useEffect(() => { if (!need || all) return; const f = () => tick(x => x + 1); waiters.add(f); loadAll(); return () => waiters.delete(f); }, [need]);
  return all;
}

// the icon a sidebar item shows: its own if chosen, else the default for its kind
export function ItemIcon({ x, fallback: Fallback, className }) {
  const k = x.icon || "", lucide = k.startsWith("l:"), lib = useAll(lucide);
  if (k.startsWith("e:")) return <span className={cn("grid size-4 shrink-0 place-items-center text-[0.95em] leading-none", className)} aria-hidden>{k.slice(2)}</span>;
  const Icon = ICONS[k] || (lucide && lib?.[k.slice(2)]) || Fallback;
  return <Icon className={cn("size-4 shrink-0", !x.color && "text-muted-foreground", className)} style={x.color ? { color: x.color } : undefined} />;
}

// Russian words → lucide names, so search works in Russian too
const RU = {
  одежда: "shirt|shoe|footprints|glasses|watch|hat|backpack|handbag|gem|scissors", футболка: "shirt", рубашка: "shirt", кофта: "shirt", обувь: "footprints", очки: "glasses", шапка: "hard-hat", сумка: "handbag", рюкзак: "backpack", часы: "watch",
  рулетка: "dices|dice|coins|spade|club|diamond|cherry|ticket|circle-dot", казино: "dices|dice|coins|spade|club|cherry", кости: "dice", кубик: "dice", карты: "spade", ставки: "coins", лотерея: "ticket", игра: "gamepad", игры: "gamepad", пазл: "puzzle",
  деньги: "coins", монета: "coins", банк: "landmark", крипта: "bitcoin", биткоин: "bitcoin", кошелёк: "wallet", кошелек: "wallet", карта: "credit-card", чек: "receipt", налог: "receipt",
  дом: "house", квартира: "building", кухня: "cooking-pot", еда: "utensils", рецепт: "chef-hat", готовка: "chef-hat", напиток: "cup-soda", вино: "wine", пиво: "beer", пицца: "pizza", фрукт: "apple", яблоко: "apple", вишня: "cherry", торт: "cake", кофе: "coffee", чай: "coffee",
  спорт: "dumbbell", зал: "dumbbell", бег: "footprints", велосипед: "bike", вело: "bike", мяч: "volleyball", футбол: "volleyball", плавание: "waves", йога: "flower", здоровье: "heart-pulse", врач: "stethoscope", лекарство: "pill", таблетки: "pill", сон: "bed",
  работа: "briefcase", офис: "building-2", учёба: "graduation-cap", учеба: "graduation-cap", школа: "school", книга: "book", книги: "library", чтение: "book-open", письмо: "mail", почта: "mail", телефон: "phone", звонок: "phone",
  музыка: "music", гитара: "guitar", кино: "clapperboard", фильм: "film", сериал: "tv", аниме: "tv", фото: "camera", видео: "video", микрофон: "mic", подкаст: "podcast", рисование: "palette", искусство: "palette",
  путешествия: "plane", поездка: "luggage", отпуск: "palmtree", море: "waves", горы: "mountain", лес: "trees", природа: "leaf", растения: "sprout", сад: "flower-2", погода: "cloud-sun", машина: "car", авто: "car", поезд: "train-front", автобус: "bus", карта_мест: "map",
  животные: "paw-print", кот: "cat", кошка: "cat", собака: "dog", птица: "bird", рыба: "fish",
  друзья: "users", семья: "users", люди: "users", любовь: "heart", подарок: "gift", праздник: "party-popper", день_рождения: "cake",
  код: "code", программирование: "code", компьютер: "monitor", ноутбук: "laptop", сервер: "server", бот: "bot", ии: "brain", нейросеть: "brain", идея: "lightbulb", цель: "target", план: "list-checks", задачи: "list-todo", заметки: "notebook", дневник: "notebook-pen", папка: "folder", архив: "archive", звезда: "star", огонь: "flame", молния: "zap", ракета: "rocket", флаг: "flag", замок: "lock", ключ: "key", безопасность: "shield", инструменты: "wrench", ремонт: "hammer", покупки: "shopping-cart", магазин: "store", календарь: "calendar", время: "clock", будильник: "alarm-clock", настроение: "smile",
};
const kebab = n => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
function searchIcons(lib, q) {
  q = q.trim().toLowerCase(); if (!lib || !q) return [];
  const terms = new Set([q.replace(/\s+/g, "-")]);
  for (const [ru, en] of Object.entries(RU)) if (ru.replace(/_/g, " ").startsWith(q) || (q.length >= 3 && ru.includes(q))) en.split("|").forEach(t => terms.add(t));
  const out = [];
  for (const name of Object.keys(lib)) {
    const k = kebab(name);
    if ([...terms].some(t => k.includes(t))) out.push(name);
    if (out.length >= 160) break;
  }
  return out;
}
const EMOJI = "👕👗👟🧥🎰🎲🃏♠️💰💸🪙💳🏠🍳🍕🍎🍒☕🍷🏋️🚴⚽🏊🧘💊❤️‍🩹😴💼🎓📚📖✉️📞🎵🎸🎬📺📷🎙️🎨✈️🧳🏖️🌊⛰️🌲🌿🌸🌦️🚗🚆🐱🐶🐦🐟👥❤️🎁🎉🎂💻🖥️🤖🧠💡🎯✅📝📓📁⭐🔥⚡🚀🚩🔒🔑🛡️🔧🛒📅⏰😊🎮🧩🍿🎧".match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*\uFE0F?/gu);

let open = null; const subs = new Set();
const set = v => { open = v; subs.forEach(f => f()); };
export const pickIcon = (coll, x) => set({ coll, id: x.id, icon: x.icon || "", color: x.color || "", name: x.name || x.title || "" });

export function IconPickerHost() {
  const cur = useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => open);
  const save = f => { update(cur.coll, cur.id, f); set({ ...cur, ...f }); };
  return (
    <Dialog open={!!cur} onOpenChange={o => !o && set(null)}>
      {cur && (
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="truncate pr-6">Иконка и цвет{cur.name ? ` · ${cur.name}` : ""}</DialogTitle>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => save({ color: "" })} aria-label="Без цвета"
              className={cn("grid size-8 place-items-center rounded-full border text-xs text-muted-foreground", !cur.color && "ring-2 ring-ring ring-offset-2 ring-offset-background")}>—</button>
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => save({ color: c })} aria-label={"Цвет " + c} style={{ background: c }}
                className={cn("size-8 rounded-full transition-transform hover:scale-110", cur.color === c && "ring-2 ring-ring ring-offset-2 ring-offset-background")} />
            ))}
          </div>
          <IconGrid cur={cur} save={save} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function IconGrid({ cur, save }) {
  const [tab, setTab] = useState(cur.icon?.startsWith("e:") ? "emoji" : "icons");
  const [q, setQ] = useState("");
  const lib = useAll(true);
  const found = searchIcons(lib, q);
  const cell = on => cn("grid aspect-square place-items-center rounded-lg hover:bg-accent", on && "bg-accent ring-2 ring-ring/50");
  const tint = cur.color ? { color: cur.color } : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-sm">
        {[["icons", "Иконки"], ["emoji", "Эмодзи"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("h-8 flex-1 rounded-md font-medium", tab === k ? "bg-background shadow-sm" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {tab === "icons" ? <>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск: одежда, рулетка, shirt…" autoFocus
          className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" />
        <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto">
          {!q && <button type="button" onClick={() => save({ icon: "" })} title="Обычная"
            className={cn("grid aspect-square place-items-center rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-accent", !cur.icon && "bg-accent ring-2 ring-ring/50")}>auto</button>}
          {!q && Object.entries(ICONS).map(([k, Icon]) => (
            <button key={k} type="button" onClick={() => save({ icon: k })} aria-label={k} className={cell(cur.icon === k)}><Icon className="size-5" style={tint} /></button>
          ))}
          {q && found.map(name => { const Icon = lib[name]; return (
            <button key={name} type="button" onClick={() => save({ icon: "l:" + name })} title={kebab(name)} aria-label={name} className={cell(cur.icon === "l:" + name)}><Icon className="size-5" style={tint} /></button>
          ); })}
          {q && !lib && <p className="col-span-8 py-3 text-center text-sm text-muted-foreground">Загружаю иконки…</p>}
          {q && lib && !found.length && <p className="col-span-8 py-3 text-center text-sm text-muted-foreground">Не нашлось. Попробуй по-английски или выбери эмодзи.</p>}
        </div>
      </> : <>
        <input placeholder="Вставь или набери любой эмодзи" maxLength={16}
          onChange={e => { const m = e.target.value.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*\uFE0F?/u); if (m) { save({ icon: "e:" + m[0] }); e.target.value = ""; } }}
          className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" />
        <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto">
          {EMOJI.map(em => <button key={em} type="button" onClick={() => save({ icon: "e:" + em })} className={cn(cell(cur.icon === "e:" + em), "text-xl")}>{em}</button>)}
        </div>
      </>}
    </div>
  );
}
