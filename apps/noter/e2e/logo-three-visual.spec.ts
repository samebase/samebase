import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// The striped face adds high-frequency antialiased edges. Keep this below the
// transparent-gap regression count so hidden back faces cannot show through.
const MAX_PARITY_MISMATCH_PIXELS = 30_000;

test("logo three reference fixture", async ({ page }) => {
  await page.setViewportSize({ width: 3400, height: 2600 });
  await page.goto("/visual-fixture?mode=logo-three-reference", {
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

  await expect
    .poll(async () => {
      const textContent = await mismatchCount.textContent();
      const mismatchMatch = textContent?.match(/([\d,]+) mismatched pixels/);
      if (!mismatchMatch) {
        return null;
      }

      return Number(mismatchMatch[1].replaceAll(",", ""));
    })
    .toBeLessThanOrEqual(MAX_PARITY_MISMATCH_PIXELS);

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
