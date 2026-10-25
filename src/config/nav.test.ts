import { describe, it, expect } from "vitest";
import {
  appNav,
  appNavItems,
  isAppShellPath,
  isItemActive,
  APP_SHELL_PREFIXES,
  type NavItem,
} from "@/config/nav";
import { Compass, Wallet, ShieldAlert } from "lucide-react";

describe("app navigation config", () => {
  it("only references real, non-empty destinations", () => {
    for (const item of appNavItems) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("has unique hrefs within each group", () => {
    for (const group of appNav) {
      const hrefs = group.items.map((i) => i.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it("exposes the expected groups", () => {
    expect(appNav.map((g) => g.label)).toEqual([
      "Overview",
      "Research",
      "Portfolio",
      "Community",
    ]);
  });
});

describe("isAppShellPath", () => {
  it("returns true for app-shell routes and their sub-paths", () => {
    expect(isAppShellPath("/dashboard")).toBe(true);
    expect(isAppShellPath("/portfolio")).toBe(true);
    expect(isAppShellPath("/debate")).toBe(true);
    expect(isAppShellPath("/chat")).toBe(true);
    expect(isAppShellPath("/documents")).toBe(true);
    expect(isAppShellPath("/community")).toBe(true);
    expect(isAppShellPath("/community/post/abc")).toBe(true);
  });

  it("returns true for the Stock Explorer (exact) but not its detail sub-paths", () => {
    // The explorer is authenticated and shell-wrapped.
    expect(isAppShellPath("/stocks")).toBe(true);
    // Public stock detail pages keep the top-header chrome.
    expect(isAppShellPath("/stocks/RELIANCE")).toBe(false);
  });

  it("returns false for public / marketing routes", () => {
    // The landing page and marketing pages keep the top-header chrome.
    expect(isAppShellPath("/")).toBe(false);
    expect(isAppShellPath("/methodology")).toBe(false);
    expect(isAppShellPath("/login")).toBe(false);
  });

  it("does not match a prefix that is only a partial segment", () => {
    // "/chatroom" must not match the "/chat" prefix.
    expect(isAppShellPath("/chatroom")).toBe(false);
  });

  it("covers every declared prefix", () => {
    for (const p of APP_SHELL_PREFIXES) {
      expect(isAppShellPath(p)).toBe(true);
    }
  });
});

describe("isItemActive", () => {
  const explorer: NavItem = { title: "Stock Explorer", href: "/stocks", icon: Compass, match: "exact" };
  const portfolio: NavItem = { title: "My Portfolio", href: "/portfolio", icon: Wallet, match: "exact" };
  const riskLab: NavItem = { title: "Risk Lab", href: "/portfolio#risk-lab", icon: ShieldAlert };

  it("exact match only lights up on the exact path", () => {
    expect(isItemActive(explorer, "/stocks")).toBe(true);
    expect(isItemActive(explorer, "/dashboard")).toBe(false);
    // The explorer stays inactive on public stock detail pages.
    expect(isItemActive(explorer, "/stocks/RELIANCE")).toBe(false);
    expect(isItemActive(portfolio, "/portfolio")).toBe(true);
    expect(isItemActive(portfolio, "/portfolio/extra")).toBe(false);
  });

  it("prefix match lights up on the base and sub-paths, ignoring the hash", () => {
    expect(isItemActive(riskLab, "/portfolio")).toBe(true);
    expect(isItemActive(riskLab, "/portfolio/anything")).toBe(true);
    expect(isItemActive(riskLab, "/dashboard")).toBe(false);
  });

  it("stays correct after direct navigation / refresh (path-only, no client state)", () => {
    // Simulates landing directly on a deep route.
    const chat: NavItem = { title: "AI Chat", href: "/chat", icon: Compass };
    expect(isItemActive(chat, "/chat")).toBe(true);
  });
});
