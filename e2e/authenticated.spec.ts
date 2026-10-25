/**
 * Authenticated UI coverage.
 *
 * These specs run ONLY when the local test-auth harness produced a signed-in
 * storage state (e2e/.auth/user.json). Otherwise they skip, so `pnpm e2e`
 * continues to pass with no setup. The storage state is attached via the
 * "authenticated" project in playwright.config.ts (which depends on the
 * "setup" project).
 *
 * They exercise the REAL application backend with a REAL Supabase session —
 * no mocks, no forged tokens. Live AI requests are made sparingly and are
 * individually skippable so routine runs do not burn Groq quota.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { STORAGE_STATE } from "./auth/test-auth.config";

const HAS_AUTH = fs.existsSync(STORAGE_STATE);
test.skip(!HAS_AUTH, "No authenticated storage state — run the setup project against a local Supabase first (see e2e/README.md).");

// --- Dashboard ----------------------------------------------------------
test.describe("Dashboard (authenticated)", () => {
  test("renders the app shell, sidebar, and active nav state", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    // The persistent sidebar is present (desktop).
    await expect(page.getByRole("complementary", { name: /Sidebar/i })).toBeVisible();
    // Welcome header from the shared PageHeader.
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    // Active nav: the Dashboard link is aria-current.
    const dashLink = page.getByRole("link", { name: /^Dashboard$/ });
    await expect(dashLink).toHaveAttribute("aria-current", "page");
  });

  test("quick actions navigate to real destinations", async ({ page }) => {
    await page.goto("/dashboard");
    // Either the empty-state actions or the tool cards link to /debate.
    const debateLink = page.getByRole("link", { name: /AI Debate|Try an AI Debate/i }).first();
    await expect(debateLink).toHaveAttribute("href", "/debate");
  });
});

// --- AI Chat ------------------------------------------------------------
test.describe("AI Chat (authenticated)", () => {
  test("renders the stock picker and chat shell", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: /AI Chat/i })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Search for a stock/i })).toBeVisible();
  });

  test("selecting a stock shows the selected-stock context and composer", async ({ page }) => {
    await page.goto("/chat");
    const search = page.getByRole("combobox", { name: /Search for a stock/i });
    await search.fill("RELIANCE");
    // Pick the first suggestion if the stock is seeded in the local DB.
    const option = page.getByRole("option").first();
    const appeared = await option
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!appeared, "RELIANCE not seeded in the local test DB");
    await option.click();
    // Selected-stock context header + a composer.
    await expect(page.getByText(/RELIANCE/).first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Chat message/i })).toBeVisible();
  });

  // Live AI: opt-in only, to avoid burning Groq quota on routine runs.
  test("submits a real question and renders a grounded answer", async ({ page }) => {
    test.skip(process.env.RUN_LIVE_AI !== "1", "Set RUN_LIVE_AI=1 to make a live Groq chat request.");
    await page.goto("/chat");
    const search = page.getByRole("combobox", { name: /Search for a stock/i });
    await search.fill("RELIANCE");
    const option = page.getByRole("option").first();
    const appeared = await option.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
    test.skip(!appeared, "RELIANCE not seeded in the local test DB");
    await option.click();

    const composer = page.getByRole("textbox", { name: /Chat message/i });
    await composer.fill("In one sentence, what sector is this company in?");
    await composer.press("Enter");
    // A non-empty assistant message should stream in (allow up to 30s).
    await expect(page.getByText(/Educational analysis/i).first()).toBeVisible({ timeout: 30_000 });
  });
});

// --- AI Debate ----------------------------------------------------------
test.describe("AI Debate (authenticated)", () => {
  test("renders the setup form with all controls", async ({ page }) => {
    await page.goto("/debate");
    await expect(page.getByRole("heading", { name: /AI Investment Debate/i })).toBeVisible();
    await expect(page.getByText(/Set up the debate/i)).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Search for a stock|Debate focus/i }).first()).toBeVisible();
    // Start is disabled until a stock is chosen (form validation).
    await expect(page.getByRole("button", { name: /Start debate/i })).toBeDisabled();
  });

  test("a failed debate request does not render a fabricated verdict", async ({ page }) => {
    await page.goto("/debate");
    // Force the backend to fail by intercepting the debate API with a 500.
    await page.route("**/api/debate", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Simulated failure" }) }),
    );
    const search = page.getByRole("combobox", { name: /Search for a stock/i }).first();
    await search.fill("RELIANCE");
    const option = page.getByRole("option").first();
    const appeared = await option.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
    test.skip(!appeared, "RELIANCE not seeded in the local test DB");
    await option.click();
    await page.getByRole("button", { name: /Start debate/i }).click();
    // An error is shown; no Judge verdict appears.
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(/Judge'?s Verdict/i)).toHaveCount(0);
  });
});

// --- Portfolio / Risk Lab ----------------------------------------------
test.describe("Portfolio (authenticated)", () => {
  test("renders protected content and the add-holding form", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page).toHaveURL(/\/portfolio/);
    await expect(page.getByRole("heading", { name: /My Portfolio/i })).toBeVisible();
    await expect(page.getByText(/Add a holding/i)).toBeVisible();
    // No horizontal overflow on the authenticated page.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// --- Documents ----------------------------------------------------------
test("Documents page renders for an authorized user", async ({ page }) => {
  await page.goto("/documents");
  await expect(page).toHaveURL(/\/documents/);
  await expect(page.getByRole("heading", { name: /My documents/i })).toBeVisible();
});
