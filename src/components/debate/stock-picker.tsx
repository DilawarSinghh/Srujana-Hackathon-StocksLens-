"use client";

import * as React from "react";
import { Search, Loader2 } from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface StockPickerProps {
  onSelect: (stock: SearchResult) => void;
  className?: string;
}

/**
 * Stock autocomplete that calls back with the selected stock instead of
 * navigating. Reuses /api/search (the same debounced, keyboard-navigable
 * pattern as the global SearchBar) so results come only from StockLens records.
 */
export function StockPicker({ onSelect, className }: StockPickerProps) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { results: SearchResult[] };
          setResults(data.results);
          setOpen(true);
          setActive(-1);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(stock: SearchResult) {
    setOpen(false);
    setQ(`${stock.name} (${stock.symbol})`);
    onSelect(stock);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const choice = results[active] ?? results[0];
      if (choice) pick(choice);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="debate-stock-listbox"
          aria-label="Search for a stock to debate"
          autoComplete="off"
          value={q}
          placeholder="Search a stock by name or symbol…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="pl-9 pr-9"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open ? (
        <ul
          id="debate-stock-listbox"
          role="listbox"
          className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No matching StockLens records.
            </li>
          ) : (
            results.map((r, i) => (
              <li key={r.symbol} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm",
                    i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent",
                  )}
                >
                  <span className="min-w-0">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.symbol}
                      {r.exchange ? ` · ${r.exchange}` : ""}
                      {r.sector ? ` · ${r.sector}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
