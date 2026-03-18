import { expect, type Locator, type TestInfo } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

type ScreenshotDiffParams = {
  actual: Buffer;
  expected: Buffer;
  artifactPrefix: string;
  maxDiffPixelRatio: number;
  testInfo: TestInfo;
};

const STABLE_SCREENSHOT_OPTIONS = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
} as const;

export async function takeStableScreenshot(
  locator: Locator,
): Promise<Buffer<ArrayBufferLike>> {
  return locator.screenshot(STABLE_SCREENSHOT_OPTIONS);
}

export async function expectScreenshotsToMatch({
  actual,
  expected,
  artifactPrefix,
  maxDiffPixelRatio,
  testInfo,
}: ScreenshotDiffParams) {
  const expectedPng = PNG.sync.read(expected);
  const actualPng = PNG.sync.read(actual);

  expect(actualPng.width).toBe(expectedPng.width);
  expect(actualPng.height).toBe(expectedPng.height);

  const diffPng = new PNG({
    width: expectedPng.width,
    height: expectedPng.height,
  });
  const diffPixels = pixelmatch(
    expectedPng.data,
    actualPng.data,
    diffPng.data,
    expectedPng.width,
    expectedPng.height,
  );
  const diffPixelRatio = diffPixels / (expectedPng.width * expectedPng.height);

  if (diffPixelRatio > maxDiffPixelRatio) {
    await testInfo.attach(`${artifactPrefix}-expected`, {
      body: expected,
      contentType: "image/png",
    });
    await testInfo.attach(`${artifactPrefix}-actual`, {
      body: actual,
      contentType: "image/png",
    });
    await testInfo.attach(`${artifactPrefix}-diff`, {
      body: PNG.sync.write(diffPng),
      contentType: "image/png",
    });
  }

  expect(diffPixelRatio).toBeLessThanOrEqual(maxDiffPixelRatio);

  return {
    diffPixels,
    diffPixelRatio,
  };
}
