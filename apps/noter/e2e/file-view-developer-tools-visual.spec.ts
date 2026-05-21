import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "file-view-developer-tools-collapsed",
    snapshotName: "file-view-developer-tools-collapsed.png",
  },
  {
    mode: "file-view-developer-tools-codemirror",
    snapshotName: "file-view-developer-tools-codemirror.png",
  },
  {
    mode: "file-view-developer-tools-graph",
    snapshotName: "file-view-developer-tools-graph.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`file view developer tools fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("file-view-developer-tools-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
