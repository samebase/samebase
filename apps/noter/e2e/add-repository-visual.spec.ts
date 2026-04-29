import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "add-repository-loading-more",
    snapshotName: "add-repository-loading-more.png",
    loadingIndicatorCount: 1,
  },
  {
    mode: "add-repository-background-error",
    snapshotName: "add-repository-background-error.png",
    loadingIndicatorCount: 0,
  },
  {
    mode: "add-repository-retrying",
    snapshotName: "add-repository-retrying.png",
    loadingIndicatorCount: 2,
  },
  {
    mode: "add-repository-empty-final",
    snapshotName: "add-repository-empty-final.png",
    loadingIndicatorCount: 0,
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`add repository fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("add-repository-visual-fixture");
    await expect(fixture.locator(".animate-spin")).toHaveCount(
      scenario.loadingIndicatorCount,
    );
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
