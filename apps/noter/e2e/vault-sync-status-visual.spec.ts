import { expect, test } from "@playwright/test";

test("vault sync status fixture", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 720 });
  await page.goto("/visual-fixture.html?mode=vault-sync-status-states", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-sync-status-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-sync-status-states.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
