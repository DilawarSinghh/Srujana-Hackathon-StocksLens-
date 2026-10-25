import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Compass,
  MessageSquare,
  Swords,
  FileText,
  Wallet,
  ShieldAlert,
  Users,
  UserCircle,
} from "lucide-react";

/**
 * Sidebar navigation model for the authenticated app shell.
 *
 * Only routes that actually exist in the app are listed — no dead links. The
 * "match" field controls active-state detection:
 *  - "exact": active only on the exact path.
 *  - "prefix" (default): active on the path and any sub-path.
 */
export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  match?: "exact" | "prefix";
  /** Short tooltip/description shown when the sidebar is collapsed. */
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const appNav: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        match: "exact",
        description: "Portfolio and risk overview",
      },
    ],
  },
  {
    label: "Research",
    items: [
      {
        title: "Stock Explorer",
        href: "/stocks",
        icon: Compass,
        match: "exact",
        description: "Browse and rank stocks",
      },
      {
        title: "AI Chat",
        href: "/chat",
        icon: MessageSquare,
        description: "Ask about a company",
      },
      {
        title: "AI Debate",
        href: "/debate",
        icon: Swords,
        description: "Bull vs Devil's Advocate vs Judge",
      },
      {
        title: "Documents",
        href: "/documents",
        icon: FileText,
        description: "Your private filings",
      },
    ],
  },
  {
    label: "Portfolio",
    items: [
      {
        title: "My Portfolio",
        href: "/portfolio",
        icon: Wallet,
        match: "exact",
        description: "Holdings and allocation",
      },
      {
        title: "Risk Lab",
        href: "/portfolio#risk-lab",
        icon: ShieldAlert,
        match: "prefix",
        description: "Concentration, correlation, scenarios",
      },
    ],
  },
  {
    label: "Community",
    items: [
      {
        title: "Community",
        href: "/community",
        icon: Users,
        description: "Shared research and discussion",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        title: "Profile",
        href: "/profile",
        icon: UserCircle,
        match: "exact",
        description: "Your account, activity and preferences",
      },
    ],
  },
];

/** Flattened list of real destinations (used by tests and the mobile drawer). */
export const appNavItems: NavItem[] = appNav.flatMap((g) => g.items);

/**
 * Prefixes where the authenticated sidebar shell should render (the prefix and
 * every sub-path). Public / marketing routes ("/", "/methodology", "/login")
 * keep the top-header chrome instead.
 */
export const APP_SHELL_PREFIXES = [
  "/dashboard",
  "/chat",
  "/debate",
  "/documents",
  "/portfolio",
  "/community",
  "/profile",
] as const;

/**
 * Exact paths that use the sidebar shell but whose sub-paths do NOT. The Stock
 * Explorer (/stocks) is authenticated and shell-wrapped, while the public stock
 * detail pages (/stocks/[symbol]) keep the top-header chrome so they remain
 * shareable to signed-out visitors.
 */
export const APP_SHELL_EXACT = ["/stocks"] as const;

/** True when a pathname should use the sidebar app shell. */
export function isAppShellPath(pathname: string): boolean {
  if (APP_SHELL_EXACT.some((p) => pathname === p)) return true;
  return APP_SHELL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * True when a nav item is the active route for the current pathname.
 * Hash targets (e.g. /portfolio#risk-lab) match on their base path since the
 * server never sees the hash.
 */
export function isItemActive(item: NavItem, pathname: string): boolean {
  const base = item.href.split("#")[0];
  if (item.match === "exact") return pathname === base;
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}
