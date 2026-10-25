import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE, readTestAuthEnv } from "./e2e/auth/test-auth.config";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// The authenticated projects are only registered when the local test-auth
// harness is configured (and points at a LOCAL Supabase). Otherwise `pnpm e2e`
// runs just the public "chromium" suite with zero setup — and Playwright never
// tries to read a missing storage-state file.
let authConfigured = false;
try {
  authConfigured = readTestAuthEnv() !== null;
} catch {
  // readTestAuthEnv throws if a NON-local Supabase URL is configured. Treat
  // that as "not configured" for project registration; the setup project would
  // also refuse to run. The guard still protects production.
  authConfigured = false;
}

/**
 * Playwright config.
 *
 * Projects:
 *  - "chromium": the unauthenticated suite (public pages, redirects, responsive
 *    overflow). Runs with no setup. Excludes the auth setup + authenticated
 *    specs so it stays green out of the box.
 *  - "setup": produces a REAL signed-in storage state via a LOCAL Supabase test
 *    user (e2e/auth/auth.setup.ts). Skips itself when the harness is not
 *    configured.
 *  - "authenticated": depends on "setup", attaches the storage state, and runs
 *    the authenticated specs. The specs self-skip when no storage state exists,
 *    so this project is a no-op until a local test session is configured.
 *
 * The webServer builds and starts the production server. For the authenticated
 * project, NEXT_PUBLIC_SUPABASE_URL (and the anon key) MUST point at the LOCAL
 * Supabase stack — see e2e/README.md.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Public/unauthenticated suite only.
      testIgnore: ["**/auth/**", "**/authenticated.spec.ts"],
    },
    // Authenticated projects are added only when the local harness is set up.
    ...(authConfigured
      ? [
          {
            name: "setup",
            testMatch: /auth\/.*\.setup\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
          {
            name: "authenticated",
            testMatch: /authenticated\.spec\.ts/,
            dependencies: ["setup"],
            use: {
              ...devices["Desktop Chrome"],
              storageState: STORAGE_STATE,
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
