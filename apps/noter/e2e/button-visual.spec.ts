import { expect, test } from "@playwright/test";

test("button visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 2200 });
  await page.goto("/visual-fixture.html?mode=button", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("button-visual-variants")).toHaveScreenshot(
    "button-variants.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0,
      maxDiffPixels: 0,
    },
  );

  await expect(page.getByTestId("button-visual-sizes")).toHaveScreenshot(
    "button-sizes.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0,
      maxDiffPixels: 0,
    },
  );

  await expect(page.getByTestId("button-visual-states")).toHaveScreenshot(
    "button-states.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0,
      maxDiffPixels: 0,
    },
  );

  await expect(page.getByTestId("button-visual-overrides")).toHaveScreenshot(
    "button-overrides.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0,
      maxDiffPixels: 0,
    },
  );
});
