import { expect, test } from "@playwright/test";
import { FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES } from "../src/components/fileViewPushActionsVisualModes";

const SCENARIOS = FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES.map((mode) => ({
  mode,
  snapshotName: `${mode}.png`,
}));

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
