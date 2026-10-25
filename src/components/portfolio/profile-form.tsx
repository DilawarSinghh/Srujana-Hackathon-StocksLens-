"use client";

import * as React from "react";
import { saveProfile } from "@/app/portfolio/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProfileFormProps {
  initial: {
    riskTolerance: "conservative" | "moderate" | "aggressive";
    horizonYears: number;
    liquidityNeedPct: number;
  } | null;
}

/** Short investor-profile form driving goal-conflict warnings. */
export function ProfileForm({ initial }: ProfileFormProps) {
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await saveProfile(new FormData(e.currentTarget));
    setMsg(res.ok ? "Saved." : res.error ?? "Could not save.");
    setSaving(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Risk tolerance</span>
        <select
          name="riskTolerance"
          defaultValue={initial?.riskTolerance ?? "moderate"}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="conservative">Conservative</option>
          <option value="moderate">Moderate</option>
          <option value="aggressive">Aggressive</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Horizon (years)</span>
        <Input
          name="horizonYears"
          type="number"
          min="1"
          max="40"
          defaultValue={initial?.horizonYears ?? 5}
          className="w-24"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">
          Money needed within 12 months (%)
        </span>
        <Input
          name="liquidityNeedPct"
          type="number"
          min="0"
          max="100"
          defaultValue={initial?.liquidityNeedPct ?? 0}
          className="w-24"
        />
      </label>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </Button>
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </form>
  );
}
