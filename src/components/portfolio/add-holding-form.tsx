"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import { upsertHolding } from "@/app/portfolio/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Form to add/update a holding: symbol search + quantity + avg buy price. */
export function AddHoldingForm() {
  const router = useRouter();
  const [symbol, setSymbol] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (res.ok) {
        const data = (await res.json()) as { results: SearchResult[] };
        setResults(data.results);
        setOpen(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function action(formData: FormData) {
    setPending(true);
    formData.set("symbol", symbol);
    const result = await upsertHolding(formData);
    setPending(false);
    if (result.ok) {
      toast.success("Holding saved.");
      formRef.current?.reset();
      setSymbol("");
      setQuery("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not save.");
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="relative flex-1">
        <label className="mb-1 block text-xs text-muted-foreground">Stock</label>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSymbol(e.target.value.toUpperCase());
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search symbol or name…"
          autoComplete="off"
          aria-label="Stock symbol"
          required
        />
        {open && results.length > 0 ? (
          <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
            {results.map((r) => (
              <li key={r.symbol}>
                <button
                  type="button"
                  onClick={() => {
                    setSymbol(r.symbol);
                    setQuery(r.symbol);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col rounded-sm px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium">{r.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="w-full sm:w-28">
        <label className="mb-1 block text-xs text-muted-foreground">Quantity</label>
        <Input name="quantity" type="number" min="0" step="any" required aria-label="Quantity" />
      </div>

      <div className="w-full sm:w-36">
        <label className="mb-1 block text-xs text-muted-foreground">Avg buy price (₹)</label>
        <Input name="avgBuyPrice" type="number" min="0" step="any" required aria-label="Average buy price" />
      </div>

      <Button type="submit" disabled={pending} className="gap-1.5">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add
      </Button>
    </form>
  );
}
