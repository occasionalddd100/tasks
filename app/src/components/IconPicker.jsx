import { useSyncExternalStore } from "react";
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

// the icon a sidebar item shows: its own if chosen, else the default for its kind
export function ItemIcon({ x, fallback: Fallback, className }) {
  const Icon = ICONS[x.icon] || Fallback;
  return <Icon className={cn("size-4 shrink-0", !x.color && "text-muted-foreground", className)} style={x.color ? { color: x.color } : undefined} />;
}

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
          <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto">
            <button type="button" onClick={() => save({ icon: "" })} title="Обычная"
              className={cn("grid aspect-square place-items-center rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-accent", !cur.icon && "bg-accent ring-2 ring-ring/50")}>auto</button>
            {Object.entries(ICONS).map(([k, Icon]) => (
              <button key={k} type="button" onClick={() => save({ icon: k })} aria-label={k}
                className={cn("grid aspect-square place-items-center rounded-lg hover:bg-accent", cur.icon === k && "bg-accent ring-2 ring-ring/50")}>
                <Icon className="size-5" style={cur.color ? { color: cur.color } : undefined} />
              </button>
            ))}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
