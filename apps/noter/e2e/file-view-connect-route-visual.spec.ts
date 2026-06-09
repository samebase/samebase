import { expect, test } from "./visualFixtureTest";

const CONNECT_ROUTE_FIXTURES = [
  {
    mode: "file-view-connect-repository",
    snapshotName: "file-view-connect-route.png",
  },
  {
    mode: "file-view-connect-github",
    snapshotName: "file-view-connect-github.png",
  },
] as const;

for (const fixtureConfig of CONNECT_ROUTE_FIXTURES) {
  test(`file view connect route visual fixture: ${fixtureConfig.mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture?mode=${fixtureConfig.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("file-view-connect-route-visual-fixture");
    await expect(fixture).toHaveScreenshot(fixtureConfig.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    });
  });
}
