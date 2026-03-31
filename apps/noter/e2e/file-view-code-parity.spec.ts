import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  expectScreenshotsToMatch,
  measureScreenshotForegroundBoundsDelta,
  takeStableScreenshot,
} from "./visualDiff";

test.use({ serviceWorkers: "block" });
test.setTimeout(90_000);

const MAX_CODE_EDITOR_DIFF_PIXEL_RATIO = 0.018;
const PARITY_CAPTURE_DEVICE_SCALE_FACTOR = 2;
const PARITY_DIFF_COLOR_MONACO = [255, 59, 48] as const;
const PARITY_DIFF_COLOR_PROSEMARK = [0, 122, 255] as const;
const PARITY_PIXEL_DIFF_OUTPUT_PATH = fileURLToPath(
  new URL(
    "../public/visual-fixtures/file-view-code-parity-pixel-diff.png",
    import.meta.url,
  ),
);
const PARITY_METRICS_OUTPUT_PATH = fileURLToPath(
  new URL(
    "../public/visual-fixtures/file-view-code-parity-metrics.json",
    import.meta.url,
  ),
);

test.use({ deviceScaleFactor: PARITY_CAPTURE_DEVICE_SCALE_FACTOR });

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

/**
 * The parity page can refresh its live diff in memory at any time, but the
 * checked-in artifact files should only move during an explicit snapshot update
 * run so regular verification stays read-only.
 */
function shouldWriteParityArtifacts(testInfo: TestInfo) {
  return (
    testInfo.config.updateSnapshots === "all" ||
    testInfo.config.updateSnapshots === "changed"
  );
}

function scaleForegroundBoundsMetricsToCssPixels(
  metrics: ReturnType<typeof measureScreenshotForegroundBoundsDelta>,
) {
  if (!metrics) {
    return null;
  }

  const scale = PARITY_CAPTURE_DEVICE_SCALE_FACTOR;

  return {
    actual: {
      bounds: {
        height: metrics.actual.bounds.height / scale,
        maxX: metrics.actual.bounds.maxX / scale,
        maxY: metrics.actual.bounds.maxY / scale,
        minX: metrics.actual.bounds.minX / scale,
        minY: metrics.actual.bounds.minY / scale,
        width: metrics.actual.bounds.width / scale,
      },
      label: metrics.actual.label,
    },
    captureScale: scale,
    deltaX: metrics.deltaX / scale,
    deltaY: metrics.deltaY / scale,
    expected: {
      bounds: {
        height: metrics.expected.bounds.height / scale,
        maxX: metrics.expected.bounds.maxX / scale,
        maxY: metrics.expected.bounds.maxY / scale,
        minX: metrics.expected.bounds.minX / scale,
        minY: metrics.expected.bounds.minY / scale,
        width: metrics.expected.bounds.width / scale,
      },
      label: metrics.expected.label,
    },
  };
}

test("file view code parity fixture keeps ProseMark close to Monaco", async ({
  page,
}, testInfo) => {
  const shouldWriteRecordedArtifacts = shouldWriteParityArtifacts(testInfo);

  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/visual-fixture.html?mode=file-view-code-parity", {
    waitUntil: "domcontentloaded",
  });

  const fixture = page.getByTestId("file-view-code-parity-visual-fixture");
  const editorPanels = page.getByTestId("file-view-code-parity-editor-panels");
  const monacoSurface = page.getByTestId("file-view-code-parity-monaco");
  const monacoCapture = page.getByTestId(
    "file-view-code-parity-monaco-capture",
  );
  const prosemarkSurface = page.getByTestId("file-view-code-parity-prosemark");
  const prosemarkCapture = page.getByTestId(
    "file-view-code-parity-prosemark-capture",
  );
  const diffSurface = page.getByTestId("file-view-code-parity-diff");
  const boundsDelta = page.getByTestId("file-view-code-parity-bounds-delta");
  const resolutionScaleSlider = page.getByRole("slider", {
    name: "Parity resolution scale",
  });
  const mismatchCount = page.getByTestId(
    "file-view-code-parity-mismatch-count",
  );
  const diffPreview = page.getByTestId("file-view-code-parity-diff-preview");

  await expect(fixture).toBeVisible();
  await expect(editorPanels).toBeVisible();
  await expect(monacoSurface).toBeVisible();
  await expect(monacoCapture).toBeVisible();
  await expect(prosemarkSurface).toBeVisible();
  await expect(prosemarkCapture).toBeVisible();
  await expect(diffSurface).toBeVisible();
  await expect(diffPreview).toBeVisible();
  await waitForParityEditors(page);

  const monacoScreenshot = await takeStableScreenshot(monacoCapture, {
    scale: "device",
  });
  const prosemarkScreenshot = await takeStableScreenshot(prosemarkCapture, {
    scale: "device",
  });
  const foregroundBoundsDelta = scaleForegroundBoundsMetricsToCssPixels(
    measureScreenshotForegroundBoundsDelta({
      actual: prosemarkScreenshot,
      actualLabel: "ProseMark",
      expected: monacoScreenshot,
      expectedLabel: "Monaco",
    }),
  );

  if (shouldWriteRecordedArtifacts) {
    await mkdir(dirname(PARITY_METRICS_OUTPUT_PATH), { recursive: true });
    await writeFile(
      PARITY_METRICS_OUTPUT_PATH,
      JSON.stringify(foregroundBoundsDelta, null, 2),
    );
  }

  await expectScreenshotsToMatch({
    actual: prosemarkScreenshot,
    expected: monacoScreenshot,
    artifactPrefix: "file-view-code-parity",
    artifactWritePaths: {
      diff: PARITY_PIXEL_DIFF_OUTPUT_PATH,
    },
    diffVisualization: "directional-weighted",
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
    window.dispatchEvent(
      new CustomEvent("file-view-code-parity-refresh-artifacts"),
    );
  });
  await expect(mismatchCount).not.toHaveText("Rendering live diff...");
  await expect(diffSurface).toHaveAttribute("data-preview-ready", "true");
  await expect(boundsDelta).not.toHaveText("Foreground bounds pending");
  const diffImage = diffSurface.getByAltText("Live parity pixel diff");
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

  // This fixture exists to compare Monaco and ProseMark in the same runtime.
  // Baseline screenshots across macOS and Linux add a second, unrelated source
  // of glyph-antialiasing drift, so rely on the environment-local screenshot
  // diff above instead of checked-in panel snapshots here.

  const initialDiffNaturalWidth = await diffImage.evaluate((image) => {
    return image.naturalWidth;
  });
  await resolutionScaleSlider.press("ArrowRight");
  await expect(diffSurface).toHaveAttribute("data-preview-ready", "true");
  await expect(
    page.getByText("Live diff captured at 2x resolution."),
  ).toBeVisible();
  await expect
    .poll(async () => {
      return diffImage.evaluate((image) => image.naturalWidth);
    })
    .toBeGreaterThan(initialDiffNaturalWidth);
});
