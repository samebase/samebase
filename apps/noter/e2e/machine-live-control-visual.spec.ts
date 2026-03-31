import { expect, test } from "@playwright/test";

test("machine live-control fixture", async ({ page }) => {
  await page.goto("/visual-fixture.html?mode=machine-live-control", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("machine-live-control-visual-fixture");
  await expect(fixture).toHaveScreenshot("machine-live-control-page.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
