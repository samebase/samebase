import { expect, test, type Page } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

test.use({ serviceWorkers: "block" });

const MAX_CODE_EDITOR_DIFF_PIXEL_RATIO = 0.018;

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

test("file view code parity fixture keeps ProseMark close to Monaco", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/visual-fixture.html?mode=file-view-code-parity", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("file-view-code-parity-visual-fixture");
  const monacoSurface = page.getByTestId("file-view-code-parity-monaco");
  const prosemarkSurface = page.getByTestId("file-view-code-parity-prosemark");

  await expect(fixture).toBeVisible();
  await expect(monacoSurface).toHaveAttribute("data-editor-ready", "true");
  await expect(prosemarkSurface).toHaveAttribute("data-language-ready", "true");
  await expect(monacoSurface.locator(".monaco-editor")).toBeVisible();
  await expect(prosemarkSurface.locator(".cm-editor")).toBeVisible();
  await waitForStableFonts(page);

  const monacoScreenshot = await takeStableScreenshot(monacoSurface);
  const prosemarkScreenshot = await takeStableScreenshot(prosemarkSurface);

  await expectScreenshotsToMatch({
    actual: prosemarkScreenshot,
    expected: monacoScreenshot,
    artifactPrefix: "file-view-code-parity",
    maxDiffPixelRatio: MAX_CODE_EDITOR_DIFF_PIXEL_RATIO,
    // Monaco and CodeMirror still rasterize identical glyphs a little
    // differently, so keep the overall mismatch ratio tight while relaxing the
    // per-pixel sensitivity enough to focus this check on layout and palette.
    pixelmatchOptions: {
      includeAA: false,
      threshold: 0.7,
    },
    testInfo,
  });
});
