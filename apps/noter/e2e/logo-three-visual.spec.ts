import { expect, test } from "@playwright/test";

test("logo three reference fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto("/visual-fixture.html?mode=logo-three-reference", {
    waitUntil: "domcontentloaded",
  });

  const fixture = page.getByTestId("logo-three-visual-fixture");
  const reference = page.getByTestId("logo-three-parity-reference");
  const referenceCanvas = reference.locator("canvas");
  const image = page.getByTestId("logo-three-parity-svg");

  await expect(fixture).toBeVisible();
  await expect(reference).toBeVisible();
  await expect(referenceCanvas).toBeVisible();
  await expect(image).toBeVisible();

  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });

  await expect(fixture).toHaveScreenshot("logo-three-reference.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
