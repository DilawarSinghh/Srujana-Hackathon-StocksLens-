"use client";

import { LineChart } from "lucide-react";
import { siteConfig } from "@/config/site";
import { useSidebar } from "@/components/shell/sidebar-context";
import { NavLinks } from "@/components/shell/nav-links";
import { SidebarUser } from "@/components/shell/sidebar-user";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Mobile navigation drawer. Opened from the app topbar; closes automatically
 * after a destination is chosen (NavLinks onNavigate).
 */
export function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="flex w-72 flex-col p-0">
        <SheetHeader className="h-14 justify-center border-b border-border px-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <LineChart className="h-5 w-5 text-primary" aria-hidden="true" />
            {siteConfig.name}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </div>
        <div className="border-t border-border p-2">
          <SidebarUser collapsed={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
