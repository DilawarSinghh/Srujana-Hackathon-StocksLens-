/**
 * Local-only test-authentication configuration and SAFETY GUARD.
 *
 * This harness establishes a REAL Supabase session for a dedicated test user so
 * Playwright can exercise authenticated pages. It is strictly for local
 * verification and is designed so it CANNOT touch production:
 *
 *  - It only runs against a LOCAL Supabase stack (127.0.0.1 / localhost). The
 *    guard below hard-fails for any non-local Supabase URL, so it can never
 *    authenticate against — or mutate — the hosted production project.
 *  - It uses a real GoTrue `signInWithPassword` sign-in. No token is forged and
 *    no service-role key is ever placed in the browser or a fixture.
 *  - It is disabled by default: the authenticated specs skip unless the
 *    storage-state file produced by the setup exists.
 *
 * Required env (names only; values come from your LOCAL `supabase start`
 * output and a throwaway test password — never commit real values):
 *
 *   E2E_SUPABASE_URL           e.g. http://127.0.0.1:54321   (MUST be local)
 *   E2E_SUPABASE_ANON_KEY      the local anon key from `supabase status`
 *   E2E_SUPABASE_SERVICE_ROLE  the local service-role key (seed script only;
 *                              never shipped to the browser)
 *   E2E_TEST_EMAIL             e.g. e2e-test@example.com
 *   E2E_TEST_PASSWORD          a throwaway password for the local test user
 */

import path from "node:path";

/** Where the signed-in browser state is written (gitignored). */
export const STORAGE_STATE = path.join(
  process.cwd(),
  "e2e/.auth/user.json",
);

export interface TestAuthEnv {
  url: string;
  anonKey: string;
  serviceRole: string;
  email: string;
  password: string;
}

/** True only for a local Supabase host. Everything else is treated as prod. */
export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "127.0.0.1" ||
      u.hostname === "localhost" ||
      u.hostname === "0.0.0.0" ||
      u.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Read + validate the test-auth env. Returns null when the harness is not
 * configured (so callers can skip cleanly). THROWS if a URL is configured but
 * is not local — a loud failure is the correct response to any attempt to point
 * this at a non-local (production) Supabase.
 */
export function readTestAuthEnv(): TestAuthEnv | null {
  const url = process.env.E2E_SUPABASE_URL?.trim();
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY?.trim();
  const serviceRole = process.env.E2E_SUPABASE_SERVICE_ROLE?.trim();
  const email = process.env.E2E_TEST_EMAIL?.trim();
  const password = process.env.E2E_TEST_PASSWORD;

  if (!url || !anonKey || !serviceRole || !email || !password) {
    return null; // not configured → authenticated specs skip
  }

  if (!isLocalSupabaseUrl(url)) {
    throw new Error(
      `[test-auth] REFUSING TO RUN: E2E_SUPABASE_URL (${url}) is not a local ` +
        `Supabase host. This harness only ever targets a local, isolated ` +
        `Supabase stack — it must never authenticate against or mutate a ` +
        `hosted/production project.`,
    );
  }

  return { url, anonKey, serviceRole, email, password };
}
