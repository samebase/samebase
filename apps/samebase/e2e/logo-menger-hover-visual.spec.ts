import { expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { signInIfNeeded } from "./liveHelpers";
import { measureScreenshotForegroundBounds } from "./visualDiff";

test.setTimeout(120_000);

const SCREENSHOT_OPTIONS = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.001,
  scale: "css",
  timeout: 15_000,
} as const;

type HoleSize = {
  height: number;
  width: number;
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
    rotationDegrees,
  }: {
    elevationDegrees: string;
    rotationDegrees: string;
  },
): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(
    page,
    `/logo/hover/menger?elev=${elevationDegrees}&rot=${rotationDegrees}&top=red-400`,
  );

  const hoverPage = page.getByTestId("logo-menger-hover-page");
  const controls = page.getByTestId("logo-menger-hover-controls");
  const scene = page.getByTestId("logo-menger-hover-scene");

  await expect(controls).toBeVisible();
  await expect(scene.locator("canvas")).toBeVisible();
  await expect(hoverPage).toHaveAttribute("data-menger-research-mode", "hover");
  await expect(scene).toHaveAttribute("data-logo-elevation-degrees", elevationDegrees);
  await expect(scene).toHaveAttribute("data-logo-rotation-degrees", rotationDegrees);
  await expect(scene).toHaveAttribute("data-hover-settled", "true");

  return scene;
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

test("Menger hover rests at depth one in the face-on view", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    rotationDegrees: "0",
  });

  await expect(scene).not.toHaveAttribute("data-hover-coordinate-x", /.+/);
  await waitForPaint(page);
  await expect(scene).toHaveScreenshot("logo-menger-hover-face-on-resting.png", SCREENSHOT_OPTIONS);
});

test("Menger hover keeps depth-two and depth-three openings at distinct sizes", async ({
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
      timeout: 15_000,
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

  expect(
    hasDepthTwoHole,
    `Expected a depth-two opening near one third of the depth-one size. Observed ${JSON.stringify(holeSizes.slice(0, 24))}.`,
  ).toBe(true);
  expect(hasDepthThreeHole).toBe(true);

  await expect(scene).toHaveScreenshot(
    "logo-menger-hover-face-on-depth-hierarchy.png",
    SCREENSHOT_OPTIONS,
  );
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
