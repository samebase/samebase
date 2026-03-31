import { expect, test, type Page } from "@playwright/test";

/**
 * Wait for app fonts plus two paint frames so the visual fixture settles
 * before the screenshot capture compares Linux and macOS text layout.
 */
async function waitForStableFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });
}

test("machine connect fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 2600 });
  await page.goto("/visual-fixture.html?mode=machine-connect", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("machine-connect-visual-fixture");
  await expect(fixture).toBeVisible();
  await waitForStableFonts(page);
  await expect(fixture).toHaveScreenshot("machine-connect-page.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
