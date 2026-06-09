import { expect, test } from "./visualFixtureTest";

test("vault last updated status fixture", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 220 });
  await page.goto("/visual-fixture?mode=vault-last-updated-status", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-last-updated-status.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault last updated status fixture refreshes on click", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 220 });
  await page.goto("/visual-fixture?mode=vault-last-updated-status", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveAttribute("data-refresh-count", "0");

  await page.getByRole("button", { name: "Refresh noter-md/noter now" }).click();

  await expect(fixture).toHaveAttribute("data-refresh-count", "1");
});
