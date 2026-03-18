import { expect, test } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

test("landing copy default and editable render identically", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture.html?mode=landing-copy-parity", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("landing-copy-visual-fixture");
  await expect(fixture).toHaveScreenshot("landing-copy-parity-fixture.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  const defaultCopy = page.getByTestId("landing-copy-default");
  const editableCopy = page.getByTestId("landing-copy-editable");

  const [defaultScreenshot, editableScreenshot] = await Promise.all([
    takeStableScreenshot(defaultCopy),
    takeStableScreenshot(editableCopy),
  ]);

  await expectScreenshotsToMatch({
    actual: defaultScreenshot,
    expected: editableScreenshot,
    artifactPrefix: "landing-copy-parity",
    maxDiffPixelRatio: 0,
    testInfo,
  });
});
