/**
 * Shared bootstrap for tsx data scripts.
 *
 * Loads `.env` (then `.env.local`) via dotenv so that env.ts validation and the
 * service-role admin client work when run outside Next.js.
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";

// Also layer in .env.local if present (Next.js convention).
loadEnv({ path: ".env.local", override: false });

import { createAdminClient } from "@/lib/supabase/admin";

/** Service-role Supabase client for scripts. */
export const db = createAdminClient();
