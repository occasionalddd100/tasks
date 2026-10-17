import { cn } from "@/lib/utils";
import { personName } from "@/lib/people";

const COLORS = ["bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-pink-500", "bg-teal-500", "bg-orange-500"];
const hash = s => [...(s || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);

export default function Avatar({ person, className }) {
  const name = personName(person);
  if (person?.avatar) return <img src={person.avatar} alt={name} title={name} className={cn("size-6 shrink-0 rounded-full object-cover", className)} />;
  return (
    <span title={name} aria-label={name}
      className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white uppercase select-none", COLORS[Math.abs(hash(person?.user_id || name)) % COLORS.length], className)}>
      {name.slice(0, 1)}
    </span>
  );
}
