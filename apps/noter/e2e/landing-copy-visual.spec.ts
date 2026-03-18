import { expect, test } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

test("landing copy and prosemark render identically", async ({
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

  const landingCopy = page.getByTestId("landing-copy-tailwind");
  const prosemarkCopy = page.getByTestId("landing-copy-prosemark");

  const [landingScreenshot, prosemarkScreenshot] = await Promise.all([
    takeStableScreenshot(landingCopy),
    takeStableScreenshot(prosemarkCopy),
  ]);

  await expectScreenshotsToMatch({
    actual: landingScreenshot,
    expected: prosemarkScreenshot,
    artifactPrefix: "landing-copy-parity",
    maxDiffPixelRatio: 0,
    testInfo,
  });
});
