import { expect, test } from "./visualFixtureTest";

test("organization memberships and connection choices", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/visual-fixture?mode=organizations-page", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("organizations-page")).toHaveScreenshot("organizations-page.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.001,
    scale: "css",
  });
});
