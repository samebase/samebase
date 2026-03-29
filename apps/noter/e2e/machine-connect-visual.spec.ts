import { expect, test } from "@playwright/test";

test("machine connect fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/visual-fixture.html?mode=machine-connect", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("machine-connect-visual-fixture");
  await expect(fixture).toHaveScreenshot("machine-connect-page.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
