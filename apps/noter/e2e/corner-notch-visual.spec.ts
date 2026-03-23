import { expect, test } from "@playwright/test";

test("corner notch fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture.html?mode=corner-notch", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("corner-notch-visual-fixture");
  await expect(fixture).toHaveScreenshot("corner-notch.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0,
  });
});
