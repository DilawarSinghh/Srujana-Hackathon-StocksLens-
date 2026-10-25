import { test, expect } from "@playwright/test";

/**
 * Smoke test:
 *  1. Home loads and shows the ranked heading.
 *  2. A stock page renders a score (or a graceful empty/not-found state when
 *     data has not been seeded).
 */

test("home (public landing) loads for signed-out visitors", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Research stocks through their official filings/i }),
  ).toBeVisible();
  // Get-started / sign-in actions are present.
  await expect(page.getByRole("link", { name: /Get started/i }).first()).toBeVisible();
  // Legal disclaimer is present on every page.
  await expect(page.getByText(/Not investment advice/i).first()).toBeVisible();
});

test("public landing no longer carries the stock explorer listing", async ({
  page,
}) => {
  await page.goto("/");
  // The ranked listing and its category filters now live in the authenticated
  // Stock Explorer (/stocks), not on the public landing page.
  await expect(
    page.getByRole("heading", { name: /Top-scored by fundamentals/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: /Stock categories/i })).toHaveCount(0);
});

test("Stock Explorer is private — signed-out users are redirected to /login", async ({
  page,
}) => {
  await page.goto("/stocks");
  await page.waitForURL(/\/login/);
  expect(page.url()).toContain("/login");
  // The return-to path is preserved for post-login redirect.
  expect(decodeURIComponent(page.url())).toContain("/stocks");
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

test("a populated stock (RELIANCE) renders a real price and score", async ({
  page,
}) => {
  const res = await page.goto("/stocks/RELIANCE");
  const status = res?.status() ?? 0;
  // Only assert real-data rendering when the stock exists and is served.
  test.skip(status === 404, "RELIANCE not seeded in this environment");

  // Company name heading.
  await expect(page.getByRole("heading", { name: /Reliance/i })).toBeVisible();
  // A real rupee price is shown (₹ followed by digits).
  await expect(page.getByText(/₹\s?[\d,]+/).first()).toBeVisible();
  // The fundamental-score section renders.
  await expect(page.getByText(/Fundamental score/i).first()).toBeVisible();
});

test("search surfaces an imported stock via the search API", async ({
  page,
}) => {
  await page.goto("/");
  const resp = await page.request.get("/api/search?q=infosys");
  expect(resp.ok()).toBeTruthy();
  const body = (await resp.json()) as { results: { symbol: string }[] };
  expect(body.results.some((r) => r.symbol === "INFY")).toBeTruthy();
});

test("stock page shows the chat panel (signed-out prompt, no filings error)", async ({
  page,
}) => {
  const res = await page.goto("/stocks/RELIANCE");
  const status = res?.status() ?? 0;
  test.skip(status === 404, "RELIANCE not seeded in this environment");

  // The chat card is present on the detail page (desktop column or mobile).
  await expect(page.getByText(/Ask about/i).first()).toBeVisible();
  // Signed-out users are invited to sign in — they must NOT see a raw
  // "no filings / run the ingestion script" error in place of the chat.
  await expect(page.getByText(/Sign in with Google to chat/i).first()).toBeVisible();
  await expect(page.getByText(/run the ingestion script/i)).toHaveCount(0);
});

// --- Community (public feed + signed-out composer prompt) -----------------
test("community feed loads for a signed-out visitor with its tabs", async ({
  page,
}) => {
  await page.goto("/community");
  await expect(page.getByRole("heading", { name: /^Community$/ })).toBeVisible();
  // The standing user-generated-content notice is present.
  await expect(page.getByText(/user-generated opinions/i).first()).toBeVisible();
  // Posting now happens via the floating "+" action, which routes a signed-out
  // user into the sign-in flow (asserted in the dedicated composer test below).
  await expect(
    page.getByRole("link", { name: /sign in to create a post/i }),
  ).toBeVisible();
  // Feed tabs are present.
  await expect(page.getByRole("tab", { name: /For You/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Latest/i })).toBeVisible();
});

test("community nav item links to the feed", async ({ page }) => {
  await page.goto("/");
  // Community appears in the primary nav (desktop) or mobile drawer; the link
  // target is what matters.
  const link = page.getByRole("link", { name: /^Community$/ }).first();
  await expect(link).toHaveAttribute("href", "/community");
});

test("community guidelines page renders", async ({ page }) => {
  await page.goto("/community/guidelines");
  await expect(page.getByRole("heading", { name: /Community guidelines/i })).toBeVisible();
  await expect(page.getByText(/official StockLens rating/i).first()).toBeVisible();
});

test("community feed has no permanently-expanded composer; a floating action is present", async ({
  page,
}) => {
  await page.goto("/community");
  // The old inline "Post text" composer must NOT be mounted in the feed.
  await expect(page.getByLabel(/^Post text$/)).toHaveCount(0);
  // Signed-out visitors get a create action that routes into the sign-in flow
  // (a link, never a broken dialog).
  const create = page.getByRole("link", { name: /create a post|sign in to create a post/i });
  await expect(create.first()).toBeVisible();
  await expect(create.first()).toHaveAttribute("href", /\/login/);
});

test("community content-type filter exposes only real post types", async ({ page }) => {
  await page.goto("/community");
  const group = page.getByRole("group", { name: /Filter by post type/i });
  await expect(group).toBeVisible();
  // Real types only — no fabricated "Questions" category.
  await expect(group.getByRole("link", { name: /^Portfolios$/ })).toBeVisible();
  await expect(group.getByRole("link", { name: /^Questions$/ })).toHaveCount(0);
});

// Private community sub-routes require auth (enforced in-page via redirect).
for (const path of ["/community/bookmarks", "/community/notifications", "/community/portfolio/new"]) {
  test(`community route ${path} redirects signed-out users to /login`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
    expect(decodeURIComponent(page.url())).toContain(path);
  });
}

// --- Authorization guard (no credentials needed) --------------------------
// These verify server-side route protection: a signed-out user is redirected
// to /login for every private route. This exercises middleware auth in a real
// browser. Full authenticated-workflow coverage (dashboard/portfolio/Risk Lab/
// PDF) requires a test account and is tracked separately as blocked on OAuth.
for (const path of ["/dashboard", "/portfolio", "/documents"]) {
  test(`protected route ${path} redirects signed-out users to /login`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
    // The return-to path is preserved for post-login redirect.
    expect(decodeURIComponent(page.url())).toContain(path);
  });
}
