import { expect, test } from "./visualFixtureTest";

const SCENARIOS = [
  {
    mode: "file-view-developer-tools-collapsed",
    snapshotName: "file-view-developer-tools-collapsed.png",
  },
  {
    mode: "file-view-developer-tools-codemirror",
    snapshotName: "file-view-developer-tools-codemirror.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`file view developer tools fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.locator('[data-sidebar-layout-part="root"]').filter({
      has: page.getByRole("button", { name: "Developer tools", exact: true }),
    });
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
