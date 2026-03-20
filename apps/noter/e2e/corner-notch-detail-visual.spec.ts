import { expect, test } from "@playwright/test";

test("corner notch detail fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 2400 });
  await page.goto("/visual-fixture.html?mode=corner-notch-detail", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("corner-notch-detail-raw")).toHaveScreenshot(
    "corner-notch-detail-raw.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );

  await expect(page.getByTestId("corner-notch-detail-zoomed")).toHaveScreenshot(
    "corner-notch-detail-zoomed.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});
