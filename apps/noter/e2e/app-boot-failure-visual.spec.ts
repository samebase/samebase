import { expect, test, type Page } from "@playwright/test";

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.02,
} as const;

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

test("app boot failure visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto("/visual-fixture.html?mode=app-boot-failure", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await waitForStableFonts(page);

  const staleState = page.getByTestId("app-boot-failure-stale");
  await expect(staleState).toBeVisible();
  await expect(staleState).toHaveScreenshot("app-boot-failure-stale.png", {
    ...strictScreenshotOptions,
    mask: [staleState.getByText(/^Build:/)],
  });

  const genericState = page.getByTestId("app-boot-failure-generic");
  await genericState.scrollIntoViewIfNeeded();
  await expect(genericState).toBeVisible();
  await expect(genericState).toHaveScreenshot("app-boot-failure-generic.png", {
    ...strictScreenshotOptions,
    mask: [genericState.getByText(/^Build:/)],
  });
});
