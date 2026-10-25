"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appNav, isItemActive } from "@/config/nav";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavLinksProps {
  collapsed: boolean;
  /** Called after a link is chosen (used to close the mobile drawer). */
  onNavigate?: () => void;
}

/**
 * The grouped navigation links. Shared by the desktop sidebar and the mobile
 * drawer. When `collapsed`, labels are hidden and tooltips show on hover/focus.
 */
export function NavLinks({ collapsed, onNavigate }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4" aria-label="Application">
      {appNav.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          {!collapsed ? (
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          ) : (
            <div className="mx-auto my-1 h-px w-6 bg-border" aria-hidden="true" />
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isItemActive(item, pathname);
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!collapsed ? <span className="truncate">{item.title}</span> : null}
                  {collapsed ? <span className="sr-only">{item.title}</span> : null}
                </Link>
              );

              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">
                        {item.title}
                        {item.description ? (
                          <span className="block text-[10px] opacity-80">
                            {item.description}
                          </span>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
