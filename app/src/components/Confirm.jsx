import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

let show = () => {};
// await confirmAction({title, description, action}) → true when confirmed
export const confirmAction = opts => new Promise(resolve => show({ ...opts, resolve }));

export function ConfirmHost() {
  const [s, setS] = useState(null);
  show = setS;
  const close = ok => { s?.resolve(ok); setS(null); };
  return (
    <Dialog open={!!s} onOpenChange={o => !o && close(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{s?.title}</DialogTitle>
          {s?.description && <DialogDescription>{s.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Отмена</Button>
          <Button variant="destructive" onClick={() => close(true)} autoFocus>{s?.action || "Удалить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
