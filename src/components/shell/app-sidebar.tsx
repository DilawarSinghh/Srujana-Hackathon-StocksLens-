"use client";

import Link from "next/link";
import { LineChart, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { siteConfig } from "@/config/site";
import { useSidebar } from "@/components/shell/sidebar-context";
import { NavLinks } from "@/components/shell/nav-links";
import { SidebarUser } from "@/components/shell/sidebar-user";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Persistent desktop sidebar (hidden on mobile; the drawer covers small
 * screens). Collapsible to an icon rail; the collapsed state persists via the
 * SidebarProvider cookie.
 */
export function AppSidebar() {
  const { collapsed, toggleCollapsed } = useSidebar();

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface/60 md:flex",
        collapsed ? "w-16" : "w-60",
      )}
      aria-label="Sidebar"
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-border px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          aria-label={`${siteConfig.name} dashboard`}
        >
          <LineChart className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          {!collapsed ? <span>{siteConfig.name}</span> : null}
        </Link>
        {!collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        <NavLinks collapsed={collapsed} />
      </div>

      {collapsed ? (
        <div className="flex justify-center border-t border-border p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      <div className="border-t border-border p-2">
        <SidebarUser collapsed={collapsed} />
      </div>
    </aside>
  );
}
