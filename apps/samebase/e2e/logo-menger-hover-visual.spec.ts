import { expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { signInIfNeeded } from "./liveHelpers";
import { measureScreenshotForegroundBounds } from "./visualDiff";

test.setTimeout(120_000);
// Depth-four WebGL screenshots share the Linux software renderer, so keep one GPU-heavy page active at a time.
test.describe.configure({ mode: "serial" });

const SCREENSHOT_OPTIONS = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.001,
  scale: "css",
  timeout: 60_000,
} as const;

type HoleSize = {
  height: number;
  width: number;
};

type NormalizedFacePoint = {
  name: string;
  x: number;
  y: number;
};

async function waitForPaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });
}

async function openMengerHoverCase(
  page: Page,
  {
    elevationDegrees,
    maximumDepth = "4",
    rotationDegrees,
  }: {
    elevationDegrees: string;
    maximumDepth?: string;
    rotationDegrees: string;
  },
): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(
    page,
    `/logo/hover/menger?elev=${elevationDegrees}&rot=${rotationDegrees}&top=red-400${
      maximumDepth === "4" ? "" : `&depth=${maximumDepth}`
    }`,
  );

  const hoverPage = page.locator('[data-testid="logo-menger-hover-page"]');
  const controls = page.locator('[data-testid="logo-menger-hover-controls"]');
  const scene = page.locator('[data-testid="logo-menger-hover-scene"]');

  await expect(controls).toBeVisible({ timeout: 30_000 });
  await expect(scene.locator("canvas")).toBeVisible();
  await expect(hoverPage).toHaveAttribute("data-menger-research-mode", "hover");
  await expect(scene).toHaveAttribute("data-menger-maximum-depth", maximumDepth);
  await expect(scene).toHaveAttribute("data-logo-elevation-degrees", elevationDegrees);
  await expect(scene).toHaveAttribute("data-logo-rotation-degrees", rotationDegrees);
  await expect(scene).toHaveAttribute("data-hover-settled", "true");

  return scene;
}

async function readNumberAttribute(locator: Locator, attribute: string): Promise<number> {
  const value = await locator.getAttribute(attribute);
  if (value === null) {
    throw new Error(`The Menger hover scene must expose ${attribute}.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`The Menger hover scene must expose a numeric ${attribute}.`);
  }
  return number;
}

async function movePointerRelativeToScene(
  page: Page,
  scene: Locator,
  {
    expectedProbe,
    x,
    y,
  }: {
    expectedProbe: readonly [string | RegExp, string | RegExp, string | RegExp];
    x: number;
    y: number;
  },
): Promise<void> {
  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The Menger hover scene must have a bounding box.");
  }

  await page.mouse.move(sceneBox.x + sceneBox.width * x, sceneBox.y + sceneBox.height * y);
  await expect(scene).toHaveAttribute("data-hover-coordinate-x", expectedProbe[0]);
  await expect(scene).toHaveAttribute("data-hover-coordinate-y", expectedProbe[1]);
  await expect(scene).toHaveAttribute("data-hover-coordinate-z", expectedProbe[2]);
  await expect(scene).toHaveAttribute("data-hover-settled", "true");
  await waitForPaint(page);
}

function readFaceOnHoleSizes(screenshot: Buffer): HoleSize[] {
  const png = PNG.sync.read(screenshot);
  const faceBounds = measureScreenshotForegroundBounds(screenshot);
  if (!faceBounds) {
    throw new Error("The face-on Menger screenshot must contain the cube face.");
  }

  const isLightPixel = (x: number, y: number): boolean => {
    const index = (y * png.width + x) * 4;
    const red = png.data[index];
    const green = png.data[index + 1];
    const blue = png.data[index + 2];
    const alpha = png.data[index + 3];

    return red >= 245 && green >= 245 && blue >= 245 && alpha > 0;
  };
  const visited = new Uint8Array(png.width * png.height);
  const holeSizes: HoleSize[] = [];
  const neighborOffsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;

  for (let startY = faceBounds.minY + 1; startY < faceBounds.maxY; startY += 1) {
    for (let startX = faceBounds.minX + 1; startX < faceBounds.maxX; startX += 1) {
      const startIndex = startY * png.width + startX;
      if (visited[startIndex] || !isLightPixel(startX, startY)) {
        continue;
      }

      const queue: Array<readonly [number, number]> = [[startX, startY]];
      visited[startIndex] = 1;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      let pixelCount = 0;
      let touchesFaceEdge = false;

      for (const [x, y] of queue) {
        pixelCount += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (
          x === faceBounds.minX + 1 ||
          x === faceBounds.maxX - 1 ||
          y === faceBounds.minY + 1 ||
          y === faceBounds.maxY - 1
        ) {
          touchesFaceEdge = true;
        }

        for (const [offsetX, offsetY] of neighborOffsets) {
          const neighborX = x + offsetX;
          const neighborY = y + offsetY;
          const neighborIndex = neighborY * png.width + neighborX;
          if (
            neighborX > faceBounds.minX &&
            neighborX < faceBounds.maxX &&
            neighborY > faceBounds.minY &&
            neighborY < faceBounds.maxY &&
            !visited[neighborIndex] &&
            isLightPixel(neighborX, neighborY)
          ) {
            visited[neighborIndex] = 1;
            queue.push([neighborX, neighborY]);
          }
        }
      }

      if (!touchesFaceEdge && pixelCount > 4) {
        holeSizes.push({
          height: maxY - minY + 1,
          width: maxX - minX + 1,
        });
      }
    }
  }

  return holeSizes.sort((left, right) => right.width * right.height - left.width * left.height);
}

function countLightPixelsNearFacePoint(screenshot: Buffer, point: NormalizedFacePoint): number {
  const png = PNG.sync.read(screenshot);
  const faceBounds = measureScreenshotForegroundBounds(screenshot);
  if (!faceBounds) {
    throw new Error("The face-on Menger screenshot must contain the cube face.");
  }

  const faceWidth = faceBounds.maxX - faceBounds.minX + 1;
  const faceHeight = faceBounds.maxY - faceBounds.minY + 1;
  const centerX = Math.round(faceBounds.minX + faceWidth * point.x);
  const centerY = Math.round(faceBounds.minY + faceHeight * point.y);
  let lightPixelCount = 0;

  for (let y = centerY - 2; y <= centerY + 2; y += 1) {
    for (let x = centerX - 2; x <= centerX + 2; x += 1) {
      const index = (y * png.width + x) * 4;
      const red = png.data[index];
      const green = png.data[index + 1];
      const blue = png.data[index + 2];
      const alpha = png.data[index + 3];
      if (red >= 220 && green >= 220 && blue >= 220 && alpha > 0) {
        lightPixelCount += 1;
      }
    }
  }

  return lightPixelCount;
}

test("Menger hover rests at depth one in the face-on view", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    rotationDegrees: "0",
  });

  await expect(scene).not.toHaveAttribute("data-hover-coordinate-x", /.+/);
  await waitForPaint(page);
  await expect(scene).toHaveScreenshot("logo-menger-hover-face-on-resting.png", SCREENSHOT_OPTIONS);
});

test("Menger hover controls reveal depth from one through five", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    rotationDegrees: "180",
  });
  const controls = page.locator('[data-testid="logo-menger-hover-controls"]');
  const depthSlider = controls.getByRole("slider", { name: "Reveal depth" });

  await expect(depthSlider).toHaveAttribute("min", "1");
  await expect(depthSlider).toHaveAttribute("max", "5");
  await expect(depthSlider).toHaveValue("4");

  await depthSlider.focus();
  await depthSlider.press("Home");
  await depthSlider.press("Tab");
  await expect(depthSlider).toHaveValue("1");
  await expect(scene).toHaveAttribute("data-menger-maximum-depth", "1");
  await expect(scene).toHaveAttribute("data-hover-channel-count", "0");
  await expect(scene).toHaveAttribute("data-hover-visible-instance-count", "20");
  await expect(page).toHaveURL(/(?:\?|&)depth=1(?:&|$)/);

  await depthSlider.focus();
  await depthSlider.press("ArrowRight");
  await depthSlider.press("Tab");
  await expect(depthSlider).toHaveValue("2");
  await expect(scene).toHaveAttribute("data-menger-maximum-depth", "2");
  await expect(page).toHaveURL(/(?:\?|&)depth=2(?:&|$)/);
});

test("Menger hover extends every visible face plane beyond the canvas", async ({ page }) => {
  const cases = [
    {
      elevationDegrees: "0",
      expectedAxis: "0",
      expectedCoordinate: "x",
      expectedCoordinateValue: 0,
      expectedSign: "-1",
      expectedUnboundedCoordinate: "z",
      expectedUnboundedDirection: "negative",
      rotationDegrees: "180",
      visibleFaceCount: "1",
    },
    {
      elevationDegrees: "0",
      expectedAxis: "2",
      expectedCoordinate: "z",
      expectedCoordinateValue: 0,
      expectedSign: "-1",
      expectedUnboundedCoordinate: "x",
      expectedUnboundedDirection: "positive",
      rotationDegrees: "225",
      visibleFaceCount: "2",
    },
    {
      elevationDegrees: "23",
      expectedAxis: "2",
      expectedCoordinate: "z",
      expectedCoordinateValue: 1,
      expectedSign: "1",
      expectedUnboundedCoordinate: "x",
      expectedUnboundedDirection: "negative",
      rotationDegrees: "29.3",
      visibleFaceCount: "3",
    },
  ] as const;

  for (const hoverCase of cases) {
    await test.step(`${hoverCase.visibleFaceCount} visible face planes`, async () => {
      const scene = await openMengerHoverCase(page, hoverCase);
      const canvasBox = await scene.locator("canvas").boundingBox();
      if (!canvasBox) {
        throw new Error("The Menger hover canvas must have a bounding box.");
      }
      const outsideX = canvasBox.x - 24;
      expect(outsideX).toBeGreaterThanOrEqual(0);

      await page.mouse.move(outsideX, canvasBox.y + canvasBox.height * 0.5);
      await expect(scene).toHaveAttribute(
        `data-hover-coordinate-${hoverCase.expectedCoordinate}`,
        hoverCase.expectedCoordinateValue.toFixed(3),
      );
      const unboundedCoordinate = await readNumberAttribute(
        scene,
        `data-hover-coordinate-${hoverCase.expectedUnboundedCoordinate}`,
      );
      if (hoverCase.expectedUnboundedDirection === "negative") {
        expect(unboundedCoordinate).toBeLessThan(0);
      } else {
        expect(unboundedCoordinate).toBeGreaterThan(1);
      }
      await expect(scene).toHaveAttribute("data-hover-face-axis", hoverCase.expectedAxis);
      await expect(scene).toHaveAttribute("data-hover-face-sign", hoverCase.expectedSign);
      await expect(scene).toHaveAttribute(
        "data-hover-visible-face-count",
        hoverCase.visibleFaceCount,
      );
      await expect(scene).toHaveAttribute("data-hover-settled", "true");

      if (hoverCase.visibleFaceCount === "1") {
        const outsideY = canvasBox.y - 1;
        expect(outsideY).toBeGreaterThanOrEqual(0);
        await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, outsideY);
        await expect(scene).toHaveAttribute("data-hover-coordinate-y", /^1\.[0-9]+$/);
        await expect
          .poll(() => readNumberAttribute(scene, "data-hover-maximum-openness"))
          .toBeGreaterThan(0);
        await expect(scene).toHaveAttribute("data-hover-settled", "true");
      }
    });
  }
});

test("Menger hover keeps deterministic depth-four work inside the research budgets", async ({
  page,
}) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    rotationDegrees: "180",
  });

  expect(await readNumberAttribute(scene, "data-hover-channel-count")).toBe(2_457);
  expect(await readNumberAttribute(scene, "data-hover-dynamic-upload-bytes")).toBe(40_000);
  expect(await readNumberAttribute(scene, "data-hover-visible-instance-count")).toBe(50_540);
  expect(await readNumberAttribute(scene, "data-hover-triangle-count")).toBe(1_600_800);
});

test("Menger hover keeps depth-two, depth-three, and depth-four openings distinct", async ({
  page,
}) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    rotationDegrees: "180",
  });
  await movePointerRelativeToScene(page, scene, {
    expectedProbe: [/-?0\.000/, "0.400", "0.345"],
    x: 0.42,
    y: 0.55,
  });

  const holeSizes = readFaceOnHoleSizes(
    await scene.screenshot({
      animations: "disabled",
      caret: "hide",
      scale: "css",
      timeout: 60_000,
    }),
  );
  const depthOneHole = holeSizes[0];
  if (!depthOneHole) {
    throw new Error("The face-on Menger screenshot must contain the depth-one opening.");
  }
  const hasDepthTwoHole = holeSizes.some(
    (hole) =>
      hole.width >= depthOneHole.width * 0.28 &&
      hole.width <= depthOneHole.width * 0.38 &&
      hole.height >= depthOneHole.height * 0.28 &&
      hole.height <= depthOneHole.height * 0.38,
  );
  const hasDepthThreeHole = holeSizes.some(
    (hole) =>
      hole.width >= depthOneHole.width * 0.08 &&
      hole.width <= depthOneHole.width * 0.14 &&
      hole.height >= depthOneHole.height * 0.08 &&
      hole.height <= depthOneHole.height * 0.14,
  );
  const hasDepthFourHole = holeSizes.some(
    (hole) =>
      hole.width >= depthOneHole.width * 0.025 &&
      hole.width <= depthOneHole.width * 0.055 &&
      hole.height >= depthOneHole.height * 0.025 &&
      hole.height <= depthOneHole.height * 0.055,
  );

  expect(
    hasDepthTwoHole,
    `Expected a depth-two opening near one third of the depth-one size. Observed ${JSON.stringify(holeSizes.slice(0, 24))}.`,
  ).toBe(true);
  expect(hasDepthThreeHole).toBe(true);
  expect(hasDepthFourHole).toBe(true);

  await expect(scene).toHaveScreenshot(
    "logo-menger-hover-face-on-depth-hierarchy.png",
    SCREENSHOT_OPTIONS,
  );
});

test("Menger hover clears depth-four blocker links at texture row boundaries", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    rotationDegrees: "0",
  });
  const restingScreenshot = await scene.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
    timeout: 60_000,
  });
  const faceBounds = measureScreenshotForegroundBounds(restingScreenshot);
  const sceneBox = await scene.boundingBox();
  if (!faceBounds || !sceneBox) {
    throw new Error("The face-on Menger scene must expose its face and scene bounds.");
  }

  const faceWidth = faceBounds.maxX - faceBounds.minX + 1;
  const faceHeight = faceBounds.maxY - faceBounds.minY + 1;
  await page.mouse.move(
    sceneBox.x + faceBounds.minX + (faceWidth * 5) / 6,
    sceneBox.y + faceBounds.minY + faceHeight / 2,
  );
  await expect(scene).toHaveAttribute("data-hover-coordinate-x", "1.000");
  await expect(scene).toHaveAttribute("data-hover-coordinate-y", /^0\.49[0-9]$|^0\.50[0-9]$/);
  await expect(scene).toHaveAttribute("data-hover-coordinate-z", /^0\.16[0-9]$/);
  await expect(scene).toHaveAttribute("data-hover-settled", "true");
  await waitForPaint(page);

  const revealedScreenshot = await scene.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
    timeout: 60_000,
  });
  const paths = [
    { name: "E-W-SE", x: 20.5 / 27, y: 14.5 / 27 },
    { name: "E-S-NW", x: 21.5 / 27, y: 15.5 / 27 },
  ] satisfies NormalizedFacePoint[];

  for (const path of paths) {
    expect(
      countLightPixelsNearFacePoint(revealedScreenshot, path),
      `${path.name} must stay open through the full sponge.`,
    ).toBeGreaterThanOrEqual(10);
  }
});

test("Menger hover keeps the three visible faces and internal tunnels aligned", async ({
  page,
}) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "23",
    rotationDegrees: "29.3",
  });
  await movePointerRelativeToScene(page, scene, {
    expectedProbe: ["0.795", "1.000", "0.710"],
    x: 0.48,
    y: 0.34,
  });

  await expect(scene).toHaveScreenshot("logo-menger-hover-three-face-edge.png", SCREENSHOT_OPTIONS);
});
