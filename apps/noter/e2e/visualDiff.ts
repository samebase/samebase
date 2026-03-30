import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, type Locator, type TestInfo } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

type StableScreenshotOptions = {
  scale?: "css" | "device";
};

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
  diffVisualization?:
    | "directional-mask"
    | "directional-weighted"
    | "weighted-red";
  maxDiffPixelRatio: number;
  pixelmatchOptions?: {
    aaColor?: [number, number, number];
    alpha?: number;
    diffColor?: [number, number, number];
    diffColorAlt?: [number, number, number];
    diffMask?: boolean;
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

export type ScreenshotForegroundBounds = {
  height: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
};

const DEFAULT_FOREGROUND_BACKGROUND_CHANNEL_THRESHOLD = 245;
const MAX_RGBA_DELTA_DISTANCE = Math.hypot(255, 255, 255, 255);

export function measureScreenshotForegroundBounds(
  screenshot: Buffer,
  options?: {
    backgroundChannelThreshold?: number;
    ignoreEdgeInsetPx?: number;
  },
): ScreenshotForegroundBounds | null {
  const png = PNG.sync.read(screenshot);
  const backgroundChannelThreshold =
    options?.backgroundChannelThreshold ??
    DEFAULT_FOREGROUND_BACKGROUND_CHANNEL_THRESHOLD;
  const ignoreEdgeInsetPx = options?.ignoreEdgeInsetPx ?? 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = ignoreEdgeInsetPx; y < png.height - ignoreEdgeInsetPx; y += 1) {
    for (let x = ignoreEdgeInsetPx; x < png.width - ignoreEdgeInsetPx; x += 1) {
      const index = (y * png.width + x) * 4;
      const r = png.data[index];
      const g = png.data[index + 1];
      const b = png.data[index + 2];
      const a = png.data[index + 3];
      const isBackground =
        a === 0 ||
        (r >= backgroundChannelThreshold &&
          g >= backgroundChannelThreshold &&
          b >= backgroundChannelThreshold);

      if (isBackground) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    height: png.height,
    maxX,
    maxY,
    minX,
    minY,
    width: png.width,
  };
}

export function measureScreenshotForegroundBoundsDelta(args: {
  actual: Buffer;
  actualLabel: string;
  backgroundChannelThreshold?: number;
  expected: Buffer;
  expectedLabel: string;
  ignoreEdgeInsetPx?: number;
}) {
  const actualBounds = measureScreenshotForegroundBounds(args.actual, {
    backgroundChannelThreshold: args.backgroundChannelThreshold,
    ignoreEdgeInsetPx: args.ignoreEdgeInsetPx,
  });
  const expectedBounds = measureScreenshotForegroundBounds(args.expected, {
    backgroundChannelThreshold: args.backgroundChannelThreshold,
    ignoreEdgeInsetPx: args.ignoreEdgeInsetPx,
  });

  if (!actualBounds || !expectedBounds) {
    return null;
  }

  return {
    actual: {
      bounds: actualBounds,
      label: args.actualLabel,
    },
    deltaX: actualBounds.minX - expectedBounds.minX,
    deltaY: actualBounds.minY - expectedBounds.minY,
    expected: {
      bounds: expectedBounds,
      label: args.expectedLabel,
    },
  };
}

function getVisualizedPixelDiffIntensity(args: {
  actualPng: PNG;
  expectedPng: PNG;
  index: number;
}) {
  const redDelta = Math.abs(
    args.expectedPng.data[args.index] - args.actualPng.data[args.index],
  );
  const greenDelta = Math.abs(
    args.expectedPng.data[args.index + 1] - args.actualPng.data[args.index + 1],
  );
  const blueDelta = Math.abs(
    args.expectedPng.data[args.index + 2] - args.actualPng.data[args.index + 2],
  );
  const alphaDelta = Math.abs(
    args.expectedPng.data[args.index + 3] - args.actualPng.data[args.index + 3],
  );
  const normalizedDelta =
    Math.hypot(redDelta, greenDelta, blueDelta, alphaDelta) /
    MAX_RGBA_DELTA_DISTANCE;

  return normalizedDelta === 0 ? 0 : Math.sqrt(normalizedDelta);
}

function blendDiffChannel(baseChannel: number, intensity: number) {
  return Math.round(255 - (255 - baseChannel) * intensity);
}

function buildWeightedRedDiffPng(expectedPng: PNG, actualPng: PNG): PNG {
  const diffPng = new PNG({
    width: expectedPng.width,
    height: expectedPng.height,
  });

  for (let index = 0; index < expectedPng.data.length; index += 4) {
    const intensity = getVisualizedPixelDiffIntensity({
      actualPng,
      expectedPng,
      index,
    });
    const fadedChannel = blendDiffChannel(0, intensity);

    diffPng.data[index] = 255;
    diffPng.data[index + 1] = fadedChannel;
    diffPng.data[index + 2] = fadedChannel;
    diffPng.data[index + 3] = 255;
  }

  return diffPng;
}

function buildDirectionalMaskDiffPng(args: {
  actualPng: PNG;
  expectedPng: PNG;
  pixelmatchOptions: NonNullable<ScreenshotDiffParams["pixelmatchOptions"]>;
  weighted: boolean;
}) {
  const diffMaskPng = new PNG({
    width: args.expectedPng.width,
    height: args.expectedPng.height,
  });
  pixelmatch(
    args.expectedPng.data,
    args.actualPng.data,
    diffMaskPng.data,
    args.expectedPng.width,
    args.expectedPng.height,
    {
      ...args.pixelmatchOptions,
      diffMask: true,
    },
  );

  const displayPng = new PNG({
    width: args.expectedPng.width,
    height: args.expectedPng.height,
  });

  for (let index = 0; index < diffMaskPng.data.length; index += 4) {
    const hasDiff =
      diffMaskPng.data[index] !== 0 ||
      diffMaskPng.data[index + 1] !== 0 ||
      diffMaskPng.data[index + 2] !== 0 ||
      diffMaskPng.data[index + 3] !== 0;

    if (!hasDiff) {
      displayPng.data[index] = 255;
      displayPng.data[index + 1] = 255;
      displayPng.data[index + 2] = 255;
      displayPng.data[index + 3] = 255;
      continue;
    }

    const intensity = args.weighted
      ? getVisualizedPixelDiffIntensity({
          actualPng: args.actualPng,
          expectedPng: args.expectedPng,
          index,
        })
      : 1;

    displayPng.data[index] = blendDiffChannel(
      diffMaskPng.data[index],
      intensity,
    );
    displayPng.data[index + 1] = blendDiffChannel(
      diffMaskPng.data[index + 1],
      intensity,
    );
    displayPng.data[index + 2] = blendDiffChannel(
      diffMaskPng.data[index + 2],
      intensity,
    );
    displayPng.data[index + 3] = 255;
  }

  return {
    diffMaskPng,
    displayPng,
  };
}

export async function takeStableScreenshot(
  locator: Locator,
  options?: StableScreenshotOptions,
): Promise<Buffer> {
  return locator.screenshot({
    ...STABLE_SCREENSHOT_OPTIONS,
    scale: options?.scale ?? STABLE_SCREENSHOT_OPTIONS.scale,
  });
}

export async function expectScreenshotsToMatch({
  actual,
  expected,
  artifactPrefix,
  artifactWritePaths,
  diffVisualization = "weighted-red",
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
  const diffVisualizationResult =
    diffVisualization === "directional-mask"
      ? buildDirectionalMaskDiffPng({
          actualPng,
          expectedPng,
          pixelmatchOptions: pixelmatchOptions ?? {},
          weighted: false,
        })
      : diffVisualization === "directional-weighted"
        ? buildDirectionalMaskDiffPng({
            actualPng,
            expectedPng,
            pixelmatchOptions: pixelmatchOptions ?? {},
            weighted: true,
          })
        : {
            diffMaskPng: diffPng,
            displayPng: buildWeightedRedDiffPng(expectedPng, actualPng),
          };
  const weightedDiffBuffer = PNG.sync.write(diffVisualizationResult.displayPng);
  const diffMaskBuffer = PNG.sync.write(diffVisualizationResult.diffMaskPng);

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
