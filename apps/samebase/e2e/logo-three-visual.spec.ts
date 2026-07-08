import { expect, test, type Locator, type Page } from "./visualFixtureTest";

test.use({ serviceWorkers: "block" });
test.setTimeout(120_000);

// The striped face adds high-frequency antialiased edges. Keep this below the
// transparent-gap regression count so hidden back faces cannot show through.
const MAX_PARITY_MISMATCH_PIXELS = 30_000;
const MAX_PARITY_RENDER_ATTEMPTS = 3;

async function waitForLogoThreeReferenceFixture(page: Page): Promise<void> {
  const fixture = page.locator('[data-testid="logo-three-visual-fixture"]');
  const reference = page.locator('[data-testid="logo-three-parity-reference"]');
  const referenceCanvas = reference.locator("canvas");
  const image = page.locator('[data-testid="logo-three-parity-svg"]');
  const diffCanvas = page.locator('[data-testid="logo-three-parity-diff"]');

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
}

async function readMismatchPixels(mismatchCount: Locator): Promise<number | null> {
  const textContent = await mismatchCount.textContent();
  const mismatchMatch = textContent?.match(/([\d,]+) mismatched pixels/);
  if (!mismatchMatch) {
    return null;
  }

  return Number(mismatchMatch[1].replaceAll(",", ""));
}

async function waitForMismatchPixels(mismatchCount: Locator): Promise<number> {
  await expect.poll(async () => readMismatchPixels(mismatchCount)).not.toBeNull();

  const mismatchPixels = await readMismatchPixels(mismatchCount);
  if (mismatchPixels === null) {
    throw new Error("Missing logo parity mismatch count.");
  }

  return mismatchPixels;
}

test("logo three reference fixture", async ({ page }) => {
  await page.setViewportSize({ width: 3400, height: 2600 });
  await page.goto("/visual-fixture?mode=logo-three-reference", {
    waitUntil: "domcontentloaded",
  });

  const fixture = page.locator('[data-testid="logo-three-visual-fixture"]');
  const diffCanvas = page.locator('[data-testid="logo-three-parity-diff"]');
  const mismatchCount = page.locator('[data-testid="logo-three-parity-mismatch-count"]');

  await waitForLogoThreeReferenceFixture(page);

  let mismatchPixels = await waitForMismatchPixels(mismatchCount);
  for (
    let attempt = 1;
    mismatchPixels > MAX_PARITY_MISMATCH_PIXELS && attempt < MAX_PARITY_RENDER_ATTEMPTS;
    attempt += 1
  ) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLogoThreeReferenceFixture(page);
    mismatchPixels = await waitForMismatchPixels(mismatchCount);
  }

  expect(mismatchPixels).toBeLessThanOrEqual(MAX_PARITY_MISMATCH_PIXELS);

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
