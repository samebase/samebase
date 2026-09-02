import { expect, test } from "./visualFixtureTest";

test("repository sync status fixture", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 720 });
  await page.goto("/visual-fixture?mode=repository-sync-status-states", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("repository-sync-status-visual-fixture");
  await expect(fixture).toHaveScreenshot("repository-sync-status-states.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
