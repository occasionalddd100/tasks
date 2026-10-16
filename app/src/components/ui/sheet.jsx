import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

function SheetContent({ className, children, ...props }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <SheetPrimitive.Content
        className={cn("fixed inset-y-0 left-0 z-50 flex h-full w-[85%] max-w-xs flex-col border-r bg-sidebar shadow-lg", className)}
        {...props}
      >
        <SheetPrimitive.Title className="sr-only">Меню</SheetPrimitive.Title>
        <SheetPrimitive.Description className="sr-only">Заметки и задачи</SheetPrimitive.Description>
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetContent };
