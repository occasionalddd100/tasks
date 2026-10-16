import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { getDb, members as loadMembers, share, unshare } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NO_USER = "Нет пользователя с такой почтой";

// who has access to a board or folder; the owner adds or removes people, a member can leave
export default function ShareDialog({ open, onOpenChange, coll, target, name, isOwner }) {
  const [list, setList] = useState(null), [email, setEmail] = useState("");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const me = getDb().me;
  const refresh = () => loadMembers(coll, target).then(setList).catch(e => setErr(e.message));

  useEffect(() => { if (open) { setList(null); setErr(""); setEmail(""); refresh(); } }, [open, coll, target]);

  const run = async f => {
    setBusy(true); setErr("");
    try { await f(); } catch (e) {
      setErr(e.message === NO_USER ? "Такого пользователя нет. Сначала создай ему аккаунт в Supabase: Authentication → Users → Add user." : e.message);
    }
    setBusy(false);
  };
  const submit = e => { e.preventDefault(); run(async () => { await share(coll, target, email); setEmail(""); await refresh(); }); };

  const what = coll === "boards" ? "вкладкой" : "папкой";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isOwner ? `Поделиться ${what}` : "Участники"}</DialogTitle>
          <DialogDescription>
            «{name}». {isOwner ? "У всех участников полные права: смотреть, добавлять, менять и удалять содержимое." : "У всех участников полные права на содержимое."}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {!list && <li className="text-sm text-muted-foreground">Загружаю…</li>}
          {list?.slice().sort((a, b) => b.is_owner - a.is_owner).map(m => (
            <li key={m.user_id} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60">
              <span className="truncate">{m.email}</span>
              <span className="text-muted-foreground">{m.is_owner ? "владелец" : m.user_id === me ? "ты" : ""}</span>
              {isOwner && !m.is_owner && (
                <Button variant="ghost" size="iconSm" className="ml-auto" title="Убрать доступ" aria-label={"Убрать доступ: " + m.email}
                  disabled={busy} onClick={() => run(async () => { await unshare(coll, target, m.user_id); await refresh(); })}>
                  <XIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {isOwner ? (
          <form onSubmit={submit} className="flex gap-2">
            <Input type="email" required placeholder="Почта" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
            <Button disabled={busy}>Добавить</Button>
          </form>
        ) : (
          <Button variant="outline" className="text-destructive" disabled={busy}
            onClick={() => run(async () => { await unshare(coll, target, me); onOpenChange(false); })}>
            Выйти из {coll === "boards" ? "вкладки" : "папки"}
          </Button>
        )}
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </DialogContent>
    </Dialog>
  );
}
