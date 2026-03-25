import { expect, test } from "@playwright/test";

test("file view mobile history controls fixture", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-mobile-history", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  await expect(fixture).toHaveScreenshot("fileview-layout-mobile-history.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
