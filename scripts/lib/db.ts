/**
 * Shared bootstrap for tsx data scripts.
 *
 * Loads the CANONICAL root `.env` via dotenv using an explicit project-root
 * path (resolved from this file's location), so scripts behave identically no
 * matter which working directory they are started from. This runs before any
 * module that reads env (env.ts validation, the service-role admin client).
 *
 * A single `.env` at the repo root is the source of truth. An optional
 * `.env.local` is still honored if present (it does not override values already
 * set in `.env`), but it is not required.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// scripts/lib/db.ts -> repo root is two levels up.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Canonical file first, then an optional local override (never overriding
// values that the canonical file already set).
loadEnv({ path: resolve(ROOT, ".env") });
loadEnv({ path: resolve(ROOT, ".env.local"), override: false });

const { createAdminClient } = await import("@/lib/supabase/admin");

/** Service-role Supabase client for scripts. */
export const db = createAdminClient();
