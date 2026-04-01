import { expect, test } from "@playwright/test";

test("file view connect route visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture.html?mode=file-view-connect-repository", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("file-view-connect-route-visual-fixture");
  await expect(fixture).toHaveScreenshot("file-view-connect-route.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
