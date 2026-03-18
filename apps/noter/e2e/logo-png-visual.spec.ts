import { expect, test } from "@playwright/test";

test("logo png parity fixture", async ({ page }) => {
  await page.setViewportSize({ width: 2800, height: 1600 });
  await page.goto("/visual-fixture.html?mode=logo-png-parity", {
    waitUntil: "domcontentloaded",
  });

  const fixture = page.getByTestId("logo-png-visual-fixture");
  const reference = page.getByTestId("logo-png-parity-reference");
  const image = page.getByTestId("logo-png-parity-image");

  await expect(fixture).toBeVisible();
  await expect(reference).toBeVisible();
  await expect(image).toBeVisible();

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(reference).toHaveScreenshot("logo-pixel-surface.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixels: 0,
  });

  await expect(image).toHaveScreenshot("logo-pixel-surface.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixels: 0,
  });

  await expect(fixture).toHaveScreenshot("logo-pixel-parity.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
