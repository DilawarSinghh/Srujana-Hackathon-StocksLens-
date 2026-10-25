"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface ChatSlotProps {
  symbol: string;
  name: string;
  webEnabled?: boolean;
}

/**
 * Responsive chat placement:
 *  - Desktop (lg+): sticky panel in the right column.
 *  - Mobile: a floating "Ask AI" button opening a bottom sheet.
 */
export function ChatSlot({ symbol, name, webEnabled = false }: ChatSlotProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block lg:sticky lg:top-20">
        <ChatPanel symbol={symbol} name={name} webEnabled={webEnabled} />
      </div>

      {/* Mobile floating button + bottom sheet */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              className="fixed bottom-4 right-4 z-40 gap-2 shadow-lg"
              aria-label="Ask AI about this stock"
            >
              <MessageSquare className="h-4 w-4" />
              Ask AI
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] p-0">
            <SheetTitle className="sr-only">Ask about {name}</SheetTitle>
            <div className="h-full p-3">
              <ChatPanel symbol={symbol} name={name} webEnabled={webEnabled} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
