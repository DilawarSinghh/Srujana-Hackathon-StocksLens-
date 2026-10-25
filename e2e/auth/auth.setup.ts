/**
 * Playwright auth setup (a "setup" project dependency).
 *
 * Produces e2e/.auth/user.json — a signed-in browser state — using a REAL
 * email/password sign-in against a LOCAL Supabase stack. Authenticated specs
 * depend on this project; if the harness is unconfigured it is skipped and the
 * authenticated specs skip too (so `pnpm e2e` keeps working with zero setup).
 *
 * How the session is created (no forgery, no bypass):
 *   1. The local test user is created/confirmed via the LOCAL admin API.
 *   2. The browser loads the app and calls `supabase.auth.signInWithPassword`
 *      through the app's OWN browser client, so the resulting session cookies
 *      are exactly what the real middleware and server components read. The app
 *      server must be running with NEXT_PUBLIC_SUPABASE_URL pointing at the
 *      local stack (see e2e/README.md).
 *   3. We assert a protected route (/dashboard) actually renders for the signed
 *      -in state — proving the session is genuinely valid end-to-end.
 */
import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STORAGE_STATE, readTestAuthEnv } from "./test-auth.config";
import { ensureTestUser } from "./seed-test-user";

setup("authenticate a local test user", async ({ page }) => {
  const env = readTestAuthEnv();
  setup.skip(
    !env,
    "Test-auth harness not configured (set E2E_SUPABASE_* and E2E_TEST_* against a LOCAL Supabase). See e2e/README.md.",
  );
  if (!env) return;

  // 1. Seed the dedicated local test user (confirmed email/password).
  await ensureTestUser(env);

  // 2. Sign in through the app's own browser client so cookies match prod.
  await page.goto("/login");
  const result = await page.evaluate(
    async ([url, anonKey, email, password]) => {
      // Import the same SSR browser client the app uses, from the page bundle.
      const mod = await import("@supabase/ssr");
      const client = mod.createBrowserClient(url, anonKey);
      const { error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false, message: error.message } : { ok: true };
    },
    [env.url, env.anonKey, env.email, env.password] as const,
  );
  expect(result.ok, `sign-in failed: ${result.message ?? ""}`).toBeTruthy();

  // 3. Prove the session is genuinely valid: a protected route must render,
  //    not redirect to /login.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();

  // 4. Persist the signed-in browser state for the authenticated specs.
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
