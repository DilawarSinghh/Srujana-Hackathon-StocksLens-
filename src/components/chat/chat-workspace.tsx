"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, Building2, ExternalLink, X } from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import { StockPicker } from "@/components/debate/stock-picker";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SUGGESTIONS = [
  "Technology",
  "Banking",
  "Automobile",
  "Pharma",
  "Energy",
];

/**
 * Standalone AI Chat workspace: pick a company, then chat about it. Reuses the
 * existing ChatPanel (Stock Analysis / Filings / Web tabs) and the shared
 * search endpoint — no backend or provider change. The selected-stock context
 * is preserved for the whole conversation.
 */
export function ChatWorkspace({ webEnabled }: { webEnabled: boolean }) {
  const [stock, setStock] = React.useState<SearchResult | null>(null);

  // Picker state: show the chooser card when no stock is selected.
  if (!stock) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center sm:p-12">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageSquare className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Ask about any company</h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Pick a supported NSE/BSE stock to open a grounded chat about its
              fundamentals, score, risks, and filings.
            </p>
          </div>
          <div className="w-full max-w-md">
            <StockPicker onSelect={setStock} />
          </div>
          <p className="text-xs text-muted-foreground">
            Answers come from StockLens data and, when indexed, company filings.
            Not investment advice.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Selected-stock context header. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{stock.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-normal">
                  {stock.symbol}
                </Badge>
                {stock.exchange ? <span>{stock.exchange}</span> : null}
                {stock.sector ? <span>· {stock.sector}</span> : null}
                <span>· Delayed data</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/stocks/${encodeURIComponent(stock.symbol)}`}>
                Stock page
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStock(null)}
              aria-label="Choose a different company"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Change
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Immersive conversation. The fill prop lets the panel own the height. */}
      <div className="mx-auto h-[calc(100vh-17rem)] min-h-[28rem] w-full max-w-3xl">
        <ChatPanel
          key={stock.symbol}
          symbol={stock.symbol}
          name={stock.name}
          webEnabled={webEnabled}
          fill
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Browse by sector on the{" "}
        <Link href="/" className="underline underline-offset-2 hover:text-foreground">
          Stock Explorer
        </Link>
        :{" "}
        {SUGGESTIONS.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 ? ", " : ""}
            {s}
          </React.Fragment>
        ))}
        .
      </p>
    </div>
  );
}
