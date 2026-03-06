import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "simple-repository-config",
    snapshotName: "simple-view-repository-config.png",
  },
  {
    mode: "simple-missing-config",
    snapshotName: "simple-view-missing-config.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`simple view fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("simple-view-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
