import { useEffect, useRef, useState } from "react";
import { ImageIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useDb } from "@/lib/db";
import { useMe, saveProfile, avatarFromFile } from "@/lib/people";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Avatar from "@/components/Avatar";

export default function ProfileDialog({ open, onOpenChange }) {
  const db = useDb(), me = useMe();
  const [name, setName] = useState(""), [avatar, setAvatar] = useState(""), [busy, setBusy] = useState(false);
  const file = useRef(null);
  useEffect(() => { if (open && me) { setName(me.name); setAvatar(me.avatar); } }, [open, me]);

  const pick = async e => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try { setAvatar(await avatarFromFile(f)); } catch (err) { toast.error(err.message); }
  };
  const save = async e => {
    e.preventDefault(); setBusy(true);
    try { await saveProfile(name, avatar); onOpenChange(false); toast.success("Профиль сохранён"); }
    catch (err) { toast.error("Не сохранилось: " + err.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Профиль</DialogTitle>
            <DialogDescription>Имя и аватарку видят участники твоих общих проектов.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => file.current?.click()} aria-label="Выбрать аватарку" className="rounded-full focus-visible:ring-2 focus-visible:ring-ring/50">
              <Avatar person={{ name: name || db.email, avatar, user_id: db.me }} className="size-16 text-2xl" />
            </button>
            <div className="flex flex-col items-start gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}><ImageIcon />{avatar ? "Сменить фото" : "Загрузить фото"}</Button>
              {avatar && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAvatar("")}><Trash2Icon />Убрать</Button>}
            </div>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Имя</span>
            <Input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={db.email.split("@")[0]} />
          </label>
          <DialogFooter><Button disabled={busy}>Сохранить</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
