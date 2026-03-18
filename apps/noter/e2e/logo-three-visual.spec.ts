import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("logo three reference fixture", async ({ page }) => {
  await page.setViewportSize({ width: 3400, height: 2600 });
  await page.goto("/visual-fixture.html?mode=logo-three-reference", {
    waitUntil: "domcontentloaded",
  });

  const fixture = page.getByTestId("logo-three-visual-fixture");
  const reference = page.getByTestId("logo-three-parity-reference");
  const referenceCanvas = reference.locator("canvas");
  const image = page.getByTestId("logo-three-parity-svg");
  const diffCanvas = page.getByTestId("logo-three-parity-diff");
  const mismatchCount = page.getByTestId("logo-three-parity-mismatch-count");

  await expect(fixture).toBeVisible();
  await expect(reference).toBeVisible();
  await expect(referenceCanvas).toBeVisible();
  await expect(image).toBeVisible();
  await expect(diffCanvas).toBeVisible();

  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });

  await expect(mismatchCount).toContainText("mismatched pixels");

  await expect(fixture).toHaveScreenshot("logo-three-reference.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  await expect(diffCanvas).toHaveScreenshot("logo-three-diff.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
