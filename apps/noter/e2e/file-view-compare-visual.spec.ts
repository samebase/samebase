import { expect, test } from "@playwright/test";

test("file view compare fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture.html?mode=file-view-compare-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("file-view-compare-visual-fixture");
  // The dense read-only diff surface picks up small Chromium rasterization
  // differences between local macOS previews and Linux CI builds.
  await expect(fixture).toHaveScreenshot("file-view-compare-sidebar.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.02,
  });
});
