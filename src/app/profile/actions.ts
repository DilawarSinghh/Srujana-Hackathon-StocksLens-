"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"fullName" | "username" | "bio", string>>;
}

/**
 * Editable profile fields ONLY. Email, id, role, and any authorization field
 * are deliberately absent — a user can never change those through this form.
 * The update is scoped to the caller's own row (eq id = user.id) and RLS
 * ("profiles update own") enforces the same, so a forged request for another
 * id cannot succeed.
 */
const profileSchema = z.object({
  fullName: z.string().trim().max(80).optional().default(""),
  username: z
    .string()
    .trim()
    .max(30)
    .regex(/^[a-zA-Z0-9_.]*$/, "Use letters, numbers, dots or underscores only.")
    .optional()
    .default(""),
  bio: z.string().trim().max(300).optional().default(""),
});

export async function updateProfile(formData: FormData): Promise<ProfileActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    username: formData.get("username") ?? "",
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: ProfileActionResult["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "fullName" | "username" | "bio";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const { fullName, username, bio } = parsed.data;
  const supabase = await createClient();

  // Normalize empties to null so unique/username semantics are clean.
  const updatePayload = {
    full_name: fullName || null,
    username: username || null,
    bio: bio || null,
  };

  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id); // ownership (RLS also enforces auth.uid() = id)

  if (error) {
    // Unique violation on the case-insensitive username index.
    if (/duplicate key|unique/i.test(error.message)) {
      return {
        ok: false,
        error: "That username is already taken.",
        fieldErrors: { username: "Already taken." },
      };
    }
    return { ok: false, error: "Could not save your profile. Please try again." };
  }

  revalidatePath("/profile");
  return { ok: true };
}
