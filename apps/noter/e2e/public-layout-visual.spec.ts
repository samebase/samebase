import { expect, test } from "@playwright/test";

const publicLayoutSnapshotSuffix = process.platform;

test("public landing route uses the left sidebar shell", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveScreenshot(
    `public-layout-landing-${publicLayoutSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});
