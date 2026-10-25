"use client";

import * as React from "react";
import { Swords, Loader2 } from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import { DEBATE_FOCUSES, DEBATE_FOCUS_LABELS, type DebateFocus } from "@/lib/debate/schema";
import { StockPicker } from "@/components/debate/stock-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MAX_THESIS = 500;

interface DebateSetupProps {
  onStart: (params: {
    stock: SearchResult;
    thesis: string;
    focus: DebateFocus;
  }) => void;
  running: boolean;
}

/** Debate setup: pick a stock, optionally enter a thesis + focus, start. */
export function DebateSetup({ onStart, running }: DebateSetupProps) {
  const [stock, setStock] = React.useState<SearchResult | null>(null);
  const [thesis, setThesis] = React.useState("");
  const [focus, setFocus] = React.useState<DebateFocus>("overall");

  function start() {
    if (!stock || running) return;
    onStart({ stock, thesis: thesis.trim(), focus });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Swords className="h-5 w-5" aria-hidden="true" />
          Set up the debate
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="debate-stock">
            Stock (NSE/BSE, from StockLens coverage)
          </label>
          <StockPicker onSelect={setStock} />
          {stock ? (
            <p className="text-xs text-muted-foreground">
              Selected: <span className="font-medium">{stock.name}</span> ·{" "}
              {stock.symbol}
              {stock.exchange ? ` · ${stock.exchange}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only stocks supported by StockLens can be debated.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="debate-focus">
              Debate focus
            </label>
            <Select
              value={focus}
              onValueChange={(v) => setFocus(v as DebateFocus)}
            >
              <SelectTrigger id="debate-focus" aria-label="Debate focus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEBATE_FOCUSES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {DEBATE_FOCUS_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="debate-thesis">
              Your thesis (optional)
            </label>
            <textarea
              id="debate-thesis"
              value={thesis}
              onChange={(e) => setThesis(e.target.value.slice(0, MAX_THESIS))}
              rows={2}
              placeholder="e.g. Strong moat and consistent cash flow justify the valuation."
              className="min-h-[2.5rem] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="self-end text-[10px] tabular-nums text-muted-foreground">
              {thesis.length}/{MAX_THESIS}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            The agents argue the evidence; they never tell you to buy or sell.
          </p>
          <Button onClick={start} disabled={!stock || running}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Swords className="mr-2 h-4 w-4" />
                Start debate
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
