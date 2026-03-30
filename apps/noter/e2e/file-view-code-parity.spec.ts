import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

test.use({ serviceWorkers: "block" });
test.setTimeout(90_000);

const MAX_CODE_EDITOR_DIFF_PIXEL_RATIO = 0.018;
const PARITY_DIFF_COLOR_MONACO = [255, 59, 48] as const;
const PARITY_DIFF_COLOR_PROSEMARK = [0, 122, 255] as const;
const PARITY_PIXEL_DIFF_OUTPUT_PATH = fileURLToPath(
  new URL(
    "../public/visual-fixtures/file-view-code-parity-pixel-diff.png",
    import.meta.url,
  ),
);

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

async function waitForParityEditors(page: Page) {
  const monacoSurface = page.getByTestId("file-view-code-parity-monaco");
  const prosemarkSurface = page.getByTestId("file-view-code-parity-prosemark");

  await expect(monacoSurface).toHaveAttribute("data-editor-ready", "true", {
    timeout: 15_000,
  });
  await expect(monacoSurface).not.toContainText("Loading...", {
    timeout: 15_000,
  });
  await expect(prosemarkSurface).toHaveAttribute(
    "data-language-ready",
    "true",
    {
      timeout: 15_000,
    },
  );
  await waitForStableFonts(page);
}

test("file view code parity fixture keeps ProseMark close to Monaco", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/visual-fixture.html?mode=file-view-code-parity", {
    waitUntil: "domcontentloaded",
  });

  const fixture = page.getByTestId("file-view-code-parity-visual-fixture");
  const monacoSurface = page.getByTestId("file-view-code-parity-monaco");
  const prosemarkSurface = page.getByTestId("file-view-code-parity-prosemark");
  const diffSurface = page.getByTestId("file-view-code-parity-diff");
  const mismatchCount = page.getByTestId(
    "file-view-code-parity-mismatch-count",
  );

  await expect(fixture).toBeVisible();
  await expect(monacoSurface).toBeVisible();
  await expect(prosemarkSurface).toBeVisible();
  await expect(diffSurface).toBeVisible();
  await waitForParityEditors(page);

  const monacoScreenshot = await takeStableScreenshot(monacoSurface);
  const prosemarkScreenshot = await takeStableScreenshot(prosemarkSurface);

  await expectScreenshotsToMatch({
    actual: prosemarkScreenshot,
    expected: monacoScreenshot,
    artifactPrefix: "file-view-code-parity",
    artifactWritePaths: {
      diff: PARITY_PIXEL_DIFF_OUTPUT_PATH,
    },
    diffVisualization: "directional-mask",
    maxDiffPixelRatio: MAX_CODE_EDITOR_DIFF_PIXEL_RATIO,
    // Monaco and CodeMirror still rasterize identical glyphs a little
    // differently, so keep the overall mismatch ratio tight while relaxing the
    // per-pixel sensitivity enough to focus this check on layout and palette.
    pixelmatchOptions: {
      diffColor: PARITY_DIFF_COLOR_MONACO,
      diffColorAlt: PARITY_DIFF_COLOR_PROSEMARK,
      includeAA: false,
      threshold: 0.7,
    },
    testInfo,
  });

  await page.evaluate(() => {
    const diffImage = document.querySelector(
      '[data-testid="file-view-code-parity-diff"] img',
    );
    if (!(diffImage instanceof HTMLImageElement)) {
      return;
    }

    diffImage.src = `/visual-fixtures/file-view-code-parity-pixel-diff.png?t=${Date.now()}`;
  });
  await expect(mismatchCount).toHaveText("Latest recorded pixel diff");
  const diffImage = diffSurface.getByAltText(
    "Latest recorded parity pixel diff",
  );
  await expect(diffImage).toBeVisible();
  await expect
    .poll(async () => {
      return diffImage.evaluate((image) => {
        return image.complete && image.naturalWidth > 0;
      });
    })
    .toBe(true);
  await waitForParityEditors(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });

  await expect(fixture).toHaveScreenshot("file-view-code-parity-fixture.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  await expect(diffSurface).toHaveScreenshot("file-view-code-parity-diff.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
