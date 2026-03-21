import { expect, test } from "@playwright/test";

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

test("button visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 2200 });
  await page.goto("/visual-fixture.html?mode=button", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("button-visual-variants")).toHaveScreenshot(
    "button-variants.png",
    strictScreenshotOptions,
  );

  await expect(page.getByTestId("button-visual-sizes")).toHaveScreenshot(
    "button-sizes.png",
    strictScreenshotOptions,
  );

  await expect(page.getByTestId("button-visual-states")).toHaveScreenshot(
    "button-states.png",
    strictScreenshotOptions,
  );

  await expect(page.getByTestId("button-visual-overrides")).toHaveScreenshot(
    "button-overrides.png",
    strictScreenshotOptions,
  );
});
