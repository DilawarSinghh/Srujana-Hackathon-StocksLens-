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
 *   2. We run the app's EXACT cookie library (@supabase/ssr createBrowserClient)
 *      in Node, wired to a cookie adapter, and call signInWithPassword. The SSR
 *      client itself writes the correctly named / base64url-encoded / chunked
 *      `sb-<ref>-auth-token` cookies — byte-identical to what the app writes in
 *      the browser — so the real middleware and server components accept them.
 *      Nothing is forged and no chunk format is hand-rolled.
 *   3. Those cookies are seeded into the Playwright browser context.
 *   4. We assert a protected route (/dashboard) actually renders for that
 *      session — proving it is genuinely valid end-to-end — then save state.
 */
import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createBrowserClient } from "@supabase/ssr";
import type { Cookie } from "@playwright/test";
import { STORAGE_STATE, readTestAuthEnv, type TestAuthEnv } from "./test-auth.config";
import { ensureTestUser } from "./seed-test-user";

/** Base URL the app under test is served from (matches playwright webServer). */
const APP_PORT = 3100;

interface StoredCookie {
  name: string;
  value: string;
  options?: { maxAge?: number; expires?: number; path?: string };
}

/**
 * Sign in with @supabase/ssr in Node using an in-memory cookie jar, so the
 * library produces the real auth cookies. Returns them for the Playwright
 * context. Never forges a token — this is a genuine GoTrue sign-in.
 */
async function signInAndCollectCookies(env: TestAuthEnv): Promise<StoredCookie[]> {
  const jar = new Map<string, string>();
  const client = createBrowserClient(env.url, env.anonKey, {
    cookieEncoding: "base64url",
    cookies: {
      getAll: () =>
        [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const c of cookies) jar.set(c.name, c.value);
      },
    },
    // In Node there is no window; disable auto-refresh/URL detection so the
    // call is deterministic and completes without a browser.
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
  });

  const { error } = await client.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (error) {
    throw new Error(`[test-auth] signInWithPassword failed: ${error.message}`);
  }

  const out: StoredCookie[] = [];
  jar.forEach((value, name) => out.push({ name, value }));
  if (out.length === 0) {
    throw new Error(
      "[test-auth] sign-in produced no auth cookies — check the local anon key / URL.",
    );
  }
  return out;
}

setup("authenticate a local test user", async ({ page, context }) => {
  const env = readTestAuthEnv();
  setup.skip(
    !env,
    "Test-auth harness not configured (set E2E_SUPABASE_* and E2E_TEST_* against a LOCAL Supabase). See e2e/README.md.",
  );
  if (!env) return;

  // 1. Seed the dedicated local test user (confirmed email/password).
  await ensureTestUser(env);

  // 2. Genuine sign-in via the app's cookie library; collect the real cookies.
  const supabaseCookies = await signInAndCollectCookies(env);

  // 3. Seed them into the Playwright context for localhost (the app host).
  const playwrightCookies: Cookie[] = supabaseCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: "localhost",
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 60 * 60, // 1h is plenty for a run
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));
  await context.addCookies(playwrightCookies);

  // 4. Prove the session is genuinely valid: a protected route must render,
  //    not redirect to /login.
  await page.goto(`http://localhost:${APP_PORT}/dashboard`);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();

  // 5. Persist the signed-in browser state for the authenticated specs.
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
