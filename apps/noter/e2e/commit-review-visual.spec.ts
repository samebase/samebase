import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "inline",
    snapshotName: "commit-review-inline.png",
  },
  {
    mode: "deleted",
    snapshotName: "commit-review-deleted.png",
  },
  {
    mode: "fallback",
    snapshotName: "commit-review-fallback.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`commit review fixture (${scenario.mode})`, async ({ page }) => {
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForLoadState("networkidle");
    const fixture = page.getByTestId("commit-review-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
