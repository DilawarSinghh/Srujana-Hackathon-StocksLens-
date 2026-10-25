"use client";

import * as React from "react";
import {
  TrendingUp,
  ShieldAlert,
  Scale,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import type {
  AgentResult,
  BullOutput,
  DevilOutput,
} from "@/lib/debate/schema";
import type { DebateCitation } from "@/components/debate/types";
import { EvidenceList } from "@/components/debate/evidence-list";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Side = "bull" | "devil";

const META: Record<Side, { title: string; icon: typeof TrendingUp; accent: string }> = {
  bull: { title: "Bull Case", icon: TrendingUp, accent: "text-emerald-600 dark:text-emerald-400" },
  devil: { title: "Devil's Advocate", icon: ShieldAlert, accent: "text-rose-600 dark:text-rose-400" },
};

const SEVERITY_LABEL: Record<string, string> = {
  verified_risk: "Verified risk",
  hypothesis: "Hypothesis",
  unverified: "Unverified",
};

function StatusIndicator({
  state,
  error,
}: {
  state: "pending" | "running" | "ok" | "failed";
  error?: string | null;
}) {
  if (state === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
      </span>
    );
  }
  if (state === "pending") {
    return <span className="text-xs text-muted-foreground">Waiting…</span>;
  }
  if (state === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive" title={error ?? undefined}>
        <XCircle className="h-3.5 w-3.5" /> Incomplete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5" /> Done
    </span>
  );
}

interface AgentPanelProps {
  side: Side;
  state: "pending" | "running" | "ok" | "failed";
  result: AgentResult<BullOutput | DevilOutput> | null;
  citations: DebateCitation[];
  onCite: (c: DebateCitation) => void;
}

/** Bull or Devil panel: summary + expandable claims/counterarguments. */
export function AgentPanel({ side, state, result, citations, onCite }: AgentPanelProps) {
  const meta = META[side];
  const Icon = meta.icon;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={cn("flex items-center gap-2 text-base", meta.accent)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {meta.title}
          </CardTitle>
          <StatusIndicator state={state} error={result?.error} />
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm">
        {state === "pending" || state === "running" ? (
          <p className="text-sm text-muted-foreground">
            {state === "running"
              ? "Building the argument from available evidence…"
              : side === "devil"
                ? "Waiting for the bull case to challenge."
                : "Waiting to start."}
          </p>
        ) : state === "failed" ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {result?.error ??
              "This part of the debate could not be completed. The verdict below reflects that."}
          </p>
        ) : result?.output ? (
          <AgentBody side={side} output={result.output} citations={citations} onCite={onCite} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function AgentBody({
  side,
  output,
  citations,
  onCite,
}: {
  side: Side;
  output: BullOutput | DevilOutput;
  citations: DebateCitation[];
  onCite: (c: DebateCitation) => void;
}) {
  const items =
    side === "bull"
      ? (output as BullOutput).claims
      : (output as DevilOutput).counterarguments;

  return (
    <>
      <p className="text-sm">{output.summary}</p>

      <div className="space-y-2">
        {items.map((item) => {
          const isBull = side === "bull";
          const title = isBull
            ? (item as BullOutput["claims"][number]).claim
            : (item as DevilOutput["counterarguments"][number]).counter;
          const counter = !isBull
            ? (item as DevilOutput["counterarguments"][number])
            : null;
          return (
            <details
              key={item.id}
              className="group rounded-md border border-border bg-muted/40 px-3 py-2"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-2 text-sm font-medium">
                <span className="flex-1">
                  <span className="mr-1 text-xs text-muted-foreground">{item.id}.</span>
                  {title}
                </span>
                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="mt-2 space-y-2">
                {counter ? (
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge
                      variant={counter.severity === "verified_risk" ? "destructive" : "outline"}
                      className="font-normal"
                    >
                      {SEVERITY_LABEL[counter.severity] ?? counter.severity}
                    </Badge>
                    {counter.targetsClaimId ? (
                      <span className="text-muted-foreground">
                        challenges {counter.targetsClaimId}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {item.reasoning ? (
                  <p className="text-xs text-muted-foreground">{item.reasoning}</p>
                ) : null}

                <EvidenceList evidence={item.evidence} citations={citations} onCite={onCite} />

                {isBull && (item as BullOutput["claims"][number]).limitations ? (
                  <p className="text-xs italic text-muted-foreground">
                    Limitation: {(item as BullOutput["claims"][number]).limitations}
                  </p>
                ) : null}
                {counter?.resolvesWith ? (
                  <p className="text-xs italic text-muted-foreground">
                    Resolves with: {counter.resolvesWith}
                  </p>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>

      {output.dataGaps.length > 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Data gaps noted</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
            {output.dataGaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/** Judge verdict panel. */
export function JudgePanel({
  state,
  result,
  assessmentLabel,
}: {
  state: "pending" | "running" | "ok" | "failed";
  result: AgentResult<import("@/lib/debate/schema").JudgeOutput> | null;
  assessmentLabel: string | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base text-indigo-600 dark:text-indigo-400">
            <Scale className="h-4 w-4" aria-hidden="true" />
            Judge&apos;s Verdict
          </CardTitle>
          <StatusIndicator state={state} error={result?.error} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state === "pending" || state === "running" ? (
          <p className="text-sm text-muted-foreground">
            {state === "running"
              ? "Weighing both sides against the evidence…"
              : "Waiting for both arguments."}
          </p>
        ) : state === "failed" ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {result?.error ??
              "No verdict could be produced because the debate was incomplete. This is not a completed three-agent evaluation."}
          </p>
        ) : result?.output ? (
          <JudgeBody output={result.output} assessmentLabel={assessmentLabel} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function JudgeBody({
  output,
  assessmentLabel,
}: {
  output: import("@/lib/debate/schema").JudgeOutput;
  assessmentLabel: string | null;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="font-normal">{assessmentLabel ?? output.assessment}</Badge>
        <Badge variant="outline" className="font-normal" title="Qualitative confidence in the assessment given the available evidence — not a probability of investment success.">
          Confidence in assessment: {output.confidence}
        </Badge>
      </div>

      <p className="text-sm">{output.conclusion}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <VerdictList title="Bull points that held up" items={output.survivingBullPoints} />
        <VerdictList title="Substantiated counterarguments" items={output.substantiatedCounters} />
        <VerdictList title="Unresolved" items={output.unresolved} />
        <VerdictList title="Key data gaps" items={output.dataGaps} />
      </div>

      {output.strongestSupport || output.strongestCounter ? (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {output.strongestSupport ? (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <span className="font-medium">Strongest support:</span> {output.strongestSupport}
            </p>
          ) : null}
          {output.strongestCounter ? (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2">
              <span className="font-medium">Strongest counter:</span> {output.strongestCounter}
            </p>
          ) : null}
        </div>
      ) : null}

      {output.whatWouldChange.length > 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            What could change this verdict
          </p>
          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
            {output.whatWouldChange.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function VerdictList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="mt-1 list-disc pl-4 text-xs">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
