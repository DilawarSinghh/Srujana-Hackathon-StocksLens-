"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import { createPost } from "@/app/community/actions";
import { POST_BODY_MAX, POLL_OPTION_MAX } from "@/lib/community/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PostType = "discussion" | "thesis" | "analysis" | "poll";

const TYPES: { value: PostType; label: string }[] = [
  { value: "discussion", label: "Discussion" },
  { value: "thesis", label: "Thesis" },
  { value: "analysis", label: "Analysis" },
  { value: "poll", label: "Poll" },
];

/**
 * Post composer supporting Discussion / Thesis / Analysis / Poll. Tickers are
 * resolved against the stock search API and validated again server-side. Plain
 * text only — no HTML. Prevents duplicate submission via a pending guard.
 *
 * (Portfolio-review posts are created from the portfolio-share flow, not here.)
 */
export function Composer({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [type, setType] = React.useState<PostType>("discussion");
  const [body, setBody] = React.useState("");
  const [symbols, setSymbols] = React.useState<string[]>([]);
  const [stance, setStance] = React.useState<"bullish" | "bearish" | "neutral">("neutral");
  const [horizon, setHorizon] = React.useState("");
  const [risks, setRisks] = React.useState("");
  const [pollQuestion, setPollQuestion] = React.useState("");
  const [pollOptions, setPollOptions] = React.useState<string[]>(["", ""]);
  const [pollHours, setPollHours] = React.useState(24);
  const [pending, setPending] = React.useState(false);

  // Ticker search.
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (res.ok) setResults(((await res.json()) as { results: SearchResult[] }).results);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function addSymbol(sym: string) {
    const s = sym.toUpperCase();
    if (!symbols.includes(s) && symbols.length < 5) setSymbols([...symbols, s]);
    setQuery("");
    setResults([]);
  }

  if (!signedIn) {
    return (
      <div className="rounded-xl border border-border bg-surface/40 p-4 text-center text-sm text-muted-foreground">
        <a href="/login?next=/community" className="font-medium text-primary hover:underline">
          Sign in with Google
        </a>{" "}
        to post, comment, and interact.
      </div>
    );
  }

  async function submit() {
    if (pending) return;
    setPending(true);
    const input: Record<string, unknown> = {
      postType: type === "poll" ? "poll" : type,
      body: body.trim(),
      symbols,
    };
    if (type === "thesis") {
      input.stance = stance;
      input.timeHorizon = horizon || undefined;
      input.thesisRisks = risks || undefined;
    }
    if (type === "poll") {
      input.pollQuestion = pollQuestion.trim();
      input.pollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
      input.pollClosesAt = new Date(Date.now() + pollHours * 3_600_000).toISOString();
    }
    const res = await createPost(input);
    setPending(false);
    if (res.ok) {
      toast.success("Posted.");
      setBody("");
      setSymbols([]);
      setHorizon("");
      setRisks("");
      setPollQuestion("");
      setPollOptions(["", ""]);
      router.refresh();
    } else {
      toast.error(res.error ?? "Could not post.");
    }
  }

  const over = body.length > POST_BODY_MAX;

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4">
      <div className="mb-3 flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              type === t.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          type === "thesis"
            ? "Lay out your thesis. Use $TICKER to reference a stock and #tags for topics."
            : type === "poll"
              ? "Add context for your poll (optional). Use $TICKER and #tags."
              : "Share research or start a discussion. Use $TICKER and #tags."
        }
        rows={4}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Post text"
      />
      <div className="mt-1 flex justify-end">
        <span className={cn("text-[11px] tabular-nums", over ? "text-weak" : "text-muted-foreground")}>
          {body.length}/{POST_BODY_MAX}
        </span>
      </div>

      {/* Stock attachment (required for analysis/thesis). */}
      {(type === "analysis" || type === "thesis" || type === "discussion") && (
        <div className="mt-2">
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                type === "analysis"
                  ? "Attach a stock (required)…"
                  : type === "thesis"
                    ? "Reference a stock (required)…"
                    : "Attach a stock (optional)…"
              }
              aria-label="Search stock to attach"
            />
            {results.length > 0 ? (
              <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
                {results.map((r) => (
                  <li key={r.symbol}>
                    <button
                      type="button"
                      onClick={() => addSymbol(r.symbol)}
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
          {symbols.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {symbols.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                  ${s}
                  <button type="button" onClick={() => setSymbols(symbols.filter((x) => x !== s))} aria-label={`Remove ${s}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Thesis extras. */}
      {type === "thesis" ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-1">
            {(["bullish", "bearish", "neutral"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStance(s)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs capitalize",
                  stance === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <Input value={horizon} onChange={(e) => setHorizon(e.target.value)} placeholder="Time horizon (e.g. 2–3 years)" maxLength={60} aria-label="Time horizon" />
          <Input value={risks} onChange={(e) => setRisks(e.target.value)} placeholder="What would invalidate this thesis?" maxLength={2000} aria-label="Thesis risks" />
        </div>
      ) : null}

      {/* Poll extras. */}
      {type === "poll" ? (
        <div className="mt-2 flex flex-col gap-2">
          <Input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Poll question" maxLength={300} aria-label="Poll question" />
          {pollOptions.map((o, i) => (
            <div key={i} className="flex gap-1">
              <Input
                value={o}
                onChange={(e) => setPollOptions(pollOptions.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Option ${i + 1}`}
                maxLength={120}
                aria-label={`Poll option ${i + 1}`}
              />
              {pollOptions.length > 2 ? (
                <Button type="button" variant="ghost" size="icon" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} aria-label="Remove option">
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {pollOptions.length < POLL_OPTION_MAX ? (
            <Button type="button" variant="outline" size="sm" className="self-start gap-1" onClick={() => setPollOptions([...pollOptions, ""])}>
              <Plus className="h-3.5 w-3.5" /> Add option
            </Button>
          ) : null}
          <label className="text-xs text-muted-foreground">
            Closes in
            <select
              value={pollHours}
              onChange={(e) => setPollHours(Number(e.target.value))}
              className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              <option value={6}>6 hours</option>
              <option value={24}>1 day</option>
              <option value={72}>3 days</option>
              <option value={168}>1 week</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Opinions only — not investment advice or official StockLens ratings.
        </p>
        <Button onClick={submit} disabled={pending || over || body.trim().length === 0} className="gap-1.5">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Post
        </Button>
      </div>
    </div>
  );
}
