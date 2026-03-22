import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "file-view-push-ready",
    snapshotName: "file-view-push-ready.png",
  },
  {
    mode: "file-view-open-pr",
    snapshotName: "file-view-open-pr.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`file view push actions fixture (${scenario.mode})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("file-view-push-actions-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
