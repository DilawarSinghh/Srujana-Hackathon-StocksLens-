import { test, expect } from "@playwright/test";

/**
 * Smoke test:
 *  1. Home loads and shows the ranked heading.
 *  2. A stock page renders a score (or a graceful empty/not-found state when
 *     data has not been seeded).
 */

test("home loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Research stocks through their official filings/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Top-scored by fundamentals/i }),
  ).toBeVisible();
  // Legal disclaimer is present on every page.
  await expect(page.getByText(/Not investment advice/i).first()).toBeVisible();
});

test("a stock page shows a score (or a clean fallback)", async ({ page }) => {
  // Try a seeded symbol; the page should render a score badge when data exists.
  const res = await page.goto("/stocks/RELIANCE");
  const status = res?.status() ?? 0;

  if (status === 404) {
    // No data seeded: the not-found page is an acceptable clean fallback.
    await expect(page.getByText(/Page not found/i)).toBeVisible();
    return;
  }

  // Header shows the symbol; a score badge is present (Strong/Average/Weak or
  // Not scored / Limited data).
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(
    page.getByText(/fundamentals|Not scored|Limited data/i).first(),
  ).toBeVisible();
  await expect(page.getByText(/Not investment advice/i).first()).toBeVisible();
});
