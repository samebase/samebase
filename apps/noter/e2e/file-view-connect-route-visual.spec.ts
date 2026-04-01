import { expect, test } from "@playwright/test";

const connectRouteSnapshotDiffRatio =
  process.platform === "linux" ? 0.03 : 0.01;

const CONNECT_ROUTE_FIXTURES = [
  {
    mode: "file-view-connect-repository",
    snapshotName: `file-view-connect-route-${process.platform}.png`,
  },
  {
    mode: "file-view-connect-github",
    snapshotName: `file-view-connect-github-${process.platform}.png`,
  },
] as const;

for (const fixtureConfig of CONNECT_ROUTE_FIXTURES) {
  test(`file view connect route visual fixture: ${fixtureConfig.mode}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture.html?mode=${fixtureConfig.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("file-view-connect-route-visual-fixture");
    await expect(fixture).toHaveScreenshot(fixtureConfig.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: connectRouteSnapshotDiffRatio,
    });
  });
}
