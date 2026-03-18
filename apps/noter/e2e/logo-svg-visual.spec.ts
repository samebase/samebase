import { expect, test } from "@playwright/test";

test("logo svg parity fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto("/visual-fixture.html?mode=logo-svg-parity", {
    waitUntil: "domcontentloaded",
  });

  const fixture = page.getByTestId("logo-svg-visual-fixture");
  const reference = page.getByTestId("logo-svg-parity-reference");
  const image = page.getByTestId("logo-svg-parity-svg");

  await expect(fixture).toBeVisible();
  await expect(reference).toBeVisible();
  await expect(image).toBeVisible();

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(fixture).toHaveScreenshot("logo-svg-parity.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
