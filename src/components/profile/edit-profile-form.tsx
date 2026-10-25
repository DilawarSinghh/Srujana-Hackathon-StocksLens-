"use client";

import * as React from "react";
import { updateProfile, type ProfileActionResult } from "@/app/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EditProfileFormProps {
  initial: {
    fullName: string | null;
    username: string | null;
    bio: string | null;
  };
}

const BIO_MAX = 300;

/** Edit the supported profile fields (display name, username, bio). */
export function EditProfileForm({ initial }: EditProfileFormProps) {
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState<ProfileActionResult | null>(null);
  const [bio, setBio] = React.useState(initial.bio ?? "");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    const res = await updateProfile(new FormData(e.currentTarget));
    setResult(res);
    setSaving(false);
  }

  const fieldErrors = result?.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className="text-sm font-medium">
          Display name
        </label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={initial.fullName ?? ""}
          maxLength={80}
          placeholder="e.g. Asha Patel"
          aria-invalid={!!fieldErrors.fullName}
          aria-describedby={fieldErrors.fullName ? "fullName-err" : undefined}
        />
        {fieldErrors.fullName ? (
          <p id="fullName-err" className="text-xs text-destructive">
            {fieldErrors.fullName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          Username
        </label>
        <Input
          id="username"
          name="username"
          defaultValue={initial.username ?? ""}
          maxLength={30}
          placeholder="e.g. asha_invests"
          aria-invalid={!!fieldErrors.username}
          aria-describedby={fieldErrors.username ? "username-err" : "username-hint"}
        />
        {fieldErrors.username ? (
          <p id="username-err" className="text-xs text-destructive">
            {fieldErrors.username}
          </p>
        ) : (
          <p id="username-hint" className="text-xs text-muted-foreground">
            Letters, numbers, dots or underscores. Leave blank to clear.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className="text-sm font-medium">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          rows={3}
          placeholder="A short description about you (optional)."
          className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-invalid={!!fieldErrors.bio}
        />
        <span className="self-end text-[10px] tabular-nums text-muted-foreground">
          {bio.length}/{BIO_MAX}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {result?.ok ? (
          <span role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            Saved.
          </span>
        ) : result && !result.ok && !result.fieldErrors ? (
          <span role="alert" className="text-sm text-destructive">
            {result.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
