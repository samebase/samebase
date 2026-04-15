import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "private-file-share-ssr",
    snapshotName: "private-file-share-ssr.png",
  },
  {
    mode: "private-file-share-spa",
    snapshotName: "private-file-share-spa.png",
  },
  {
    mode: "private-file-share-progressive",
    snapshotName: "private-file-share-progressive.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`private file share fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("private-file-share-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
