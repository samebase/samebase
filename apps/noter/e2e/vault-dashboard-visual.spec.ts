import { devices, expect, test } from "@playwright/test";

test("vault dashboard fixture (create control)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 420 });
  await page.goto("/visual-fixture.html?mode=vault-create-control", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-create-control.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (sidebar machine links)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 420 });
  await page.goto("/visual-fixture.html?mode=vault-sidebar-machine-links", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-sidebar-machine-links.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (branch PR labels)", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 180 });
  await page.goto("/visual-fixture.html?mode=vault-branch-pr-labels", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-branch-pr-labels.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (mobile list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-dashboard-list-spacing.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (desktop list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 360 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot(
    "vault-dashboard-list-spacing-desktop.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("vault dashboard fixture (list spacing expansion)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("codex/quiet-mobile-frame")).toHaveCount(0);
  await page.getByRole("button", { name: "Show 2 more" }).click();

  await expect(page.getByText("codex/quiet-mobile-frame")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
});

test("vault dashboard fixture (branch filters popover)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto("/visual-fixture.html?mode=vault-branch-filters", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  await expect(page).toHaveScreenshot("vault-branch-filters-popover.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (branch filters mobile sheet)", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for mobile fixture tests.");
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
  });
  const page = await context.newPage();

  await page.goto("/visual-fixture.html?mode=vault-branch-filters", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  await expect(page).toHaveScreenshot("vault-branch-filters-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await context.close();
});

test("vault dashboard fixture (mobile branch alignment)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=vault-branch-mobile-alignment", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-branch-mobile-alignment.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
