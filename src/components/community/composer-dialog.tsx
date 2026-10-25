"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, X, User as UserIcon } from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import { createPost, createSharePost } from "@/app/community/actions";
import { POST_BODY_MAX, POLL_OPTION_MAX } from "@/lib/community/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type PostType = "discussion" | "thesis" | "analysis" | "poll" | "portfolio";

const TYPES: { value: PostType; label: string }[] = [
  { value: "discussion", label: "Discussion" },
  { value: "thesis", label: "Thesis" },
  { value: "analysis", label: "Analysis" },
  { value: "poll", label: "Poll" },
  { value: "portfolio", label: "Portfolio" },
];

export interface PortfolioOption {
  id: string;
  name: string;
}

/**
 * Dedicated post composer rendered inside a responsive dialog. Opened by the
 * floating "+" button (controlled by `open`/`onOpenChange`). Supports the
 * existing post types plus a Portfolio share that publishes to the feed.
 *
 * Reuses the existing `createPost` server action for normal posts and the
 * `createSharePost` action for portfolio shares — no second post schema.
 */
export function ComposerDialog({
  open,
  onOpenChange,
  userName,
  userAvatar,
  portfolios,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  userAvatar: string | null;
  portfolios: PortfolioOption[];
}) {
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

  // Portfolio-share state.
  const [attachPortfolio, setAttachPortfolio] = React.useState(false);
  const [portfolioId, setPortfolioId] = React.useState(portfolios[0]?.id ?? "");
  const [shareTitle, setShareTitle] = React.useState("");
  const [visibility, setVisibility] = React.useState<"public" | "unlisted">("public");
  const [showHoldings, setShowHoldings] = React.useState(true);
  const [showAllocations, setShowAllocations] = React.useState(true);
  const [showSectors, setShowSectors] = React.useState(true);
  const [showRiskMetrics, setShowRiskMetrics] = React.useState(true);
  const [showQuantities, setShowQuantities] = React.useState(false);
  const [showAmounts, setShowAmounts] = React.useState(false);

  // Ticker search (discussion/thesis/analysis).
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

  const hasPortfolios = portfolios.length > 0;
  const over = body.length > POST_BODY_MAX;

  // Whether the draft has meaningful content worth warning about on close.
  const isDirty =
    body.trim().length > 0 ||
    symbols.length > 0 ||
    pollQuestion.trim().length > 0 ||
    pollOptions.some((o) => o.trim().length > 0) ||
    shareTitle.trim().length > 0 ||
    (type === "portfolio" && attachPortfolio);

  function resetAll() {
    setType("discussion");
    setBody("");
    setSymbols([]);
    setStance("neutral");
    setHorizon("");
    setRisks("");
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollHours(24);
    setAttachPortfolio(false);
    setShareTitle("");
    setVisibility("public");
    setShowHoldings(true);
    setShowAllocations(true);
    setShowSectors(true);
    setShowRiskMetrics(true);
    setShowQuantities(false);
    setShowAmounts(false);
    setQuery("");
    setResults([]);
  }

  function requestClose(next: boolean) {
    if (!next && isDirty && !pending) {
      if (!window.confirm("Discard this draft? Your text and attachments will be lost.")) {
        return;
      }
    }
    if (!next) resetAll();
    onOpenChange(next);
  }

  function addSymbol(sym: string) {
    const s = sym.toUpperCase();
    if (!symbols.includes(s) && symbols.length < 5) setSymbols([...symbols, s]);
    setQuery("");
    setResults([]);
  }

  // Changing type preserves the draft text (we only switch which extra fields
  // are shown). Nothing is cleared here by design.
  function changeType(next: PostType) {
    setType(next);
  }

  async function submit() {
    if (pending) return;
    setPending(true);

    if (type === "portfolio") {
      if (!hasPortfolios) {
        setPending(false);
        toast.error("You don't have a portfolio to share yet.");
        return;
      }
      const res = await createSharePost({
        postBody: body.trim() || undefined,
        title: shareTitle.trim() || "My portfolio",
        visibility,
        isHypothetical: false,
        sourcePortfolioId: portfolioId,
        showHoldings,
        showAllocations: showHoldings && showAllocations,
        showSectors: showHoldings && showSectors,
        showQuantities: showHoldings && showQuantities,
        showAmounts: showHoldings && showAmounts,
        showRiskMetrics,
      });
      setPending(false);
      if (res.ok) {
        toast.success("Portfolio shared to the feed.");
        resetAll();
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not publish the portfolio.");
      }
      return;
    }

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
      resetAll();
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Could not post.");
    }
  }

  const publishDisabled =
    pending ||
    over ||
    (type === "portfolio"
      ? !hasPortfolios || !portfolioId
      : body.trim().length === 0);

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle>Create post</DialogTitle>
          <DialogDescription className="sr-only">
            Write a post, poll, or share a portfolio snapshot with the community.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-4">
          {/* Author identity. */}
          <div className="flex items-center gap-2">
            {userAvatar ? (
              <Image src={userAvatar} alt="" width={36} height={36} className="rounded-full" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <UserIcon className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
            <span className="text-sm font-medium">{userName}</span>
          </div>

          {/* Type selector. */}
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Post type">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={type === t.value}
                onClick={() => changeType(t.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  type === t.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent",
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
                ? "Lay out your thesis. Use $TICKER and #tags."
                : type === "poll"
                  ? "Add context for your poll (optional)."
                  : type === "portfolio"
                    ? "Add a note for reviewers (optional)."
                    : "Share research or start a discussion. Use $TICKER and #tags."
            }
            rows={type === "portfolio" ? 3 : 5}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Post text"
          />
          <div className="-mt-1 flex justify-end">
            <span className={cn("text-[11px] tabular-nums", over ? "text-weak" : "text-muted-foreground")}>
              {body.length}/{POST_BODY_MAX}
            </span>
          </div>

          {/* Stock attachment for discussion/thesis/analysis. */}
          {(type === "analysis" || type === "thesis" || type === "discussion") && (
            <div>
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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

          {/* Portfolio share. */}
          {type === "portfolio" ? (
            <PortfolioShareFields
              hasPortfolios={hasPortfolios}
              portfolios={portfolios}
              portfolioId={portfolioId}
              setPortfolioId={setPortfolioId}
              shareTitle={shareTitle}
              setShareTitle={setShareTitle}
              visibility={visibility}
              setVisibility={setVisibility}
              showHoldings={showHoldings}
              setShowHoldings={setShowHoldings}
              showAllocations={showAllocations}
              setShowAllocations={setShowAllocations}
              showSectors={showSectors}
              setShowSectors={setShowSectors}
              showQuantities={showQuantities}
              setShowQuantities={setShowQuantities}
              showAmounts={showAmounts}
              setShowAmounts={setShowAmounts}
              showRiskMetrics={showRiskMetrics}
              setShowRiskMetrics={setShowRiskMetrics}
            />
          ) : null}
        </div>

        {/* Footer. */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-background px-4 py-3">
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            Opinions only — not investment advice.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => requestClose(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={publishDisabled} className="gap-1.5">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {type === "portfolio" ? "Share" : "Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PortfolioShareFields(props: {
  hasPortfolios: boolean;
  portfolios: PortfolioOption[];
  portfolioId: string;
  setPortfolioId: (v: string) => void;
  shareTitle: string;
  setShareTitle: (v: string) => void;
  visibility: "public" | "unlisted";
  setVisibility: (v: "public" | "unlisted") => void;
  showHoldings: boolean;
  setShowHoldings: (v: boolean) => void;
  showAllocations: boolean;
  setShowAllocations: (v: boolean) => void;
  showSectors: boolean;
  setShowSectors: (v: boolean) => void;
  showQuantities: boolean;
  setShowQuantities: (v: boolean) => void;
  showAmounts: boolean;
  setShowAmounts: (v: boolean) => void;
  showRiskMetrics: boolean;
  setShowRiskMetrics: (v: boolean) => void;
}) {
  const {
    hasPortfolios,
    portfolios,
    portfolioId,
    setPortfolioId,
    shareTitle,
    setShareTitle,
    visibility,
    setVisibility,
    showHoldings,
    setShowHoldings,
    showAllocations,
    setShowAllocations,
    showSectors,
    setShowSectors,
    showQuantities,
    setShowQuantities,
    showAmounts,
    setShowAmounts,
    showRiskMetrics,
    setShowRiskMetrics,
  } = props;

  if (!hasPortfolios) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        You don&apos;t have a portfolio yet.{" "}
        <Link href="/portfolio" className="text-primary hover:underline">
          Add holdings on your portfolio page
        </Link>{" "}
        first, then come back to share a snapshot.
      </div>
    );
  }

  const visible: string[] = [];
  if (showHoldings) visible.push("holdings");
  if (showHoldings && showAllocations) visible.push("allocation %");
  if (showHoldings && showSectors) visible.push("sectors");
  if (showHoldings && showQuantities) visible.push("quantities");
  if (showHoldings && showAmounts) visible.push("invested amounts");
  if (showRiskMetrics) visible.push("risk metrics");

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface/40 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="composer-portfolio" className="text-xs font-medium">
          Portfolio to share
        </label>
        <select
          id="composer-portfolio"
          value={portfolioId}
          onChange={(e) => setPortfolioId(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <Input
        value={shareTitle}
        onChange={(e) => setShareTitle(e.target.value)}
        placeholder="Public title (e.g. My long-term core)"
        maxLength={120}
        aria-label="Share title"
      />

      <div>
        <p className="mb-1 text-xs font-medium">Visibility</p>
        <div className="flex gap-1">
          {(["public", "unlisted"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs capitalize",
                visibility === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium">What to disclose</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <Toggle label="Holdings" checked={showHoldings} onChange={setShowHoldings} />
          <Toggle label="Allocation %" checked={showAllocations} onChange={setShowAllocations} disabled={!showHoldings} />
          <Toggle label="Sectors" checked={showSectors} onChange={setShowSectors} disabled={!showHoldings} />
          <Toggle label="Risk metrics" checked={showRiskMetrics} onChange={setShowRiskMetrics} />
          <Toggle label="Quantities (sensitive)" checked={showQuantities} onChange={setShowQuantities} disabled={!showHoldings} />
          <Toggle label="Invested amounts (sensitive)" checked={showAmounts} onChange={setShowAmounts} disabled={!showHoldings} />
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Others will see:</span>{" "}
        {visible.length > 0 ? visible.join(", ") : "only the title and your note"}. A point-in-time
        snapshot is captured now; it won&apos;t change when your portfolio changes. Quantities and
        invested amounts stay hidden unless you turn them on.
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-2 text-sm", disabled && "opacity-50")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input"
      />
      {label}
    </label>
  );
}
