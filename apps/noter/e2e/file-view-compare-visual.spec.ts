import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "file-view-compare-sidebar",
    snapshotName: "file-view-compare-sidebar.png",
  },
  {
    mode: "file-view-compare-loading",
    snapshotName: "file-view-compare-loading.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`file view compare fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("file-view-compare-visual-fixture");
    // The dense read-only diff surface picks up small Chromium rasterization
    // differences between local macOS previews and Linux CI builds.
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
      timeout: 15_000,
    });
  });
}
