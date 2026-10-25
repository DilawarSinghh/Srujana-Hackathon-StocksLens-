"use client";

import { usePathname } from "next/navigation";
import { isAppShellPath } from "@/config/nav";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SidebarProvider } from "@/components/shell/sidebar-context";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import { AppTopbar } from "@/components/shell/app-topbar";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Chooses the chrome for the current route:
 *  - App routes (dashboard, portfolio, chat, debate, documents, community) get
 *    the persistent sidebar shell with its own topbar.
 *  - Public / marketing routes (home, methodology, login, stock detail) keep
 *    the classic top header + footer.
 *
 * Doing this in a client wrapper (rather than physically moving page files)
 * keeps every existing URL, direct link, and refresh behavior working while
 * still delivering a real persistent sidebar on the app surface.
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAppShellPath(pathname)) {
    return (
      <SidebarProvider>
        <TooltipProvider delayDuration={200}>
          <a
            href="#main-content"
            className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
          >
            Skip to main content
          </a>
          <div className="flex min-h-screen w-full">
            <AppSidebar />
            <MobileSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <AppTopbar />
              <main id="main-content" className="flex-1">
                {children}
              </main>
            </div>
          </div>
        </TooltipProvider>
      </SidebarProvider>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
