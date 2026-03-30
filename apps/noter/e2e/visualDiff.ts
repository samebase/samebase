import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, type Locator, type TestInfo } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

type ScreenshotDiffParams = {
  actual: Buffer;
  expected: Buffer;
  artifactPrefix: string;
  artifactWritePaths?: {
    actual?: string;
    diff?: string;
    diffMask?: string;
    expected?: string;
  };
  maxDiffPixelRatio: number;
  pixelmatchOptions?: {
    includeAA?: boolean;
    threshold?: number;
  };
  testInfo: TestInfo;
};

const STABLE_SCREENSHOT_OPTIONS = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
} as const;

function buildWeightedRedDiffPng(expectedPng: PNG, actualPng: PNG): PNG {
  const diffPng = new PNG({
    width: expectedPng.width,
    height: expectedPng.height,
  });

  for (let index = 0; index < expectedPng.data.length; index += 4) {
    const redDelta = Math.abs(expectedPng.data[index] - actualPng.data[index]);
    const greenDelta = Math.abs(
      expectedPng.data[index + 1] - actualPng.data[index + 1],
    );
    const blueDelta = Math.abs(
      expectedPng.data[index + 2] - actualPng.data[index + 2],
    );
    const alphaDelta = Math.abs(
      expectedPng.data[index + 3] - actualPng.data[index + 3],
    );
    const normalizedDelta =
      Math.max(redDelta, greenDelta, blueDelta, alphaDelta) / 255;
    const intensity = normalizedDelta === 0 ? 0 : Math.sqrt(normalizedDelta);
    const fadedChannel = Math.round(255 * (1 - intensity));

    diffPng.data[index] = 255;
    diffPng.data[index + 1] = fadedChannel;
    diffPng.data[index + 2] = fadedChannel;
    diffPng.data[index + 3] = 255;
  }

  return diffPng;
}

export async function takeStableScreenshot(locator: Locator): Promise<Buffer> {
  return locator.screenshot(STABLE_SCREENSHOT_OPTIONS);
}

export async function expectScreenshotsToMatch({
  actual,
  expected,
  artifactPrefix,
  artifactWritePaths,
  maxDiffPixelRatio,
  pixelmatchOptions,
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
    pixelmatchOptions,
  );
  const diffPixelRatio = diffPixels / (expectedPng.width * expectedPng.height);
  const weightedDiffPng = buildWeightedRedDiffPng(expectedPng, actualPng);
  const weightedDiffBuffer = PNG.sync.write(weightedDiffPng);
  const diffMaskBuffer = PNG.sync.write(diffPng);

  if (artifactWritePaths) {
    const artifactWrites = [
      artifactWritePaths.actual
        ? {
            body: actual,
            path: artifactWritePaths.actual,
          }
        : null,
      artifactWritePaths.diff
        ? {
            body: weightedDiffBuffer,
            path: artifactWritePaths.diff,
          }
        : null,
      artifactWritePaths.diffMask
        ? {
            body: diffMaskBuffer,
            path: artifactWritePaths.diffMask,
          }
        : null,
      artifactWritePaths.expected
        ? {
            body: expected,
            path: artifactWritePaths.expected,
          }
        : null,
    ].filter((artifactWrite) => artifactWrite !== null);

    await Promise.all(
      artifactWrites.map(async (artifactWrite) => {
        await mkdir(dirname(artifactWrite.path), { recursive: true });
        await writeFile(artifactWrite.path, artifactWrite.body);
      }),
    );
  }

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
      body: weightedDiffBuffer,
      contentType: "image/png",
    });
    await testInfo.attach(`${artifactPrefix}-diff-mask`, {
      body: diffMaskBuffer,
      contentType: "image/png",
    });
  }

  expect(diffPixelRatio).toBeLessThanOrEqual(maxDiffPixelRatio);

  return {
    diffPixels,
    diffPixelRatio,
  };
}
