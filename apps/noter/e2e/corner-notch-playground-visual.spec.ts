import { expect, test } from "@playwright/test";

test("corner notch playground fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1800 });
  await page.goto(
    "/visual-fixture.html?mode=corner-notch-playground&type=2&borderWidth=3&zoom=16&surface=dark",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByTestId("corner-notch-playground-product"),
  ).toHaveScreenshot("corner-notch-playground-product.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0,
  });

  await expect(
    page.getByTestId("corner-notch-playground-detail"),
  ).toHaveScreenshot("corner-notch-playground-detail.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0,
  });
});
