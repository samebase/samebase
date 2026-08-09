import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test.setTimeout(120_000);

const CARPET_FRAME_PADDING = 1.12;
const EXPECTED_MOVE_FROM = "1,0";
const EXPECTED_MOVE_TO = "1,1";
const SCREENSHOT_OPTIONS = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.01,
  scale: "css",
  timeout: 60_000,
} as const;

type UnitPoint = readonly [number, number];

async function readNumberAttribute(locator: Locator, name: string): Promise<number> {
  const value = await locator.getAttribute(name);
  if (value === null) {
    throw new Error(`The carpet hover scene must expose ${name}.`);
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`The carpet hover scene must expose a numeric ${name}.`);
  }

  return number;
}

async function readCoordinateAttribute(locator: Locator, name: string): Promise<UnitPoint> {
  const value = await locator.getAttribute(name);
  if (value === null) {
    throw new Error(`The carpet hover scene must expose ${name}.`);
  }

  const [xValue = "", yValue = "", extraValue] = value.split(",");
  const x = Number(xValue);
  const y = Number(yValue);
  if (extraValue !== undefined || xValue.trim() === "" || yValue.trim() === "") {
    throw new Error(`The carpet hover scene must expose one coordinate pair in ${name}.`);
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`The carpet hover scene must expose a numeric coordinate pair in ${name}.`);
  }

  return [x, y];
}

async function readUnitAlphaSamples(canvas: Locator, points: readonly UnitPoint[]) {
  return canvas.evaluate(
    (element, { framePadding, unitPoints }) => {
      if (!(element instanceof HTMLCanvasElement)) {
        throw new Error("The carpet hover scene must render a canvas.");
      }

      const context = element.getContext("2d", { willReadFrequently: true });
      if (!context || element.clientWidth <= 0 || element.clientHeight <= 0) {
        throw new Error("The carpet hover canvas must have a readable drawing surface.");
      }

      const frameSide = Math.min(element.clientWidth, element.clientHeight) / framePadding;
      const frameOriginX = (element.clientWidth - frameSide) / 2;
      const frameOriginY = (element.clientHeight - frameSide) / 2;
      const backingScaleX = element.width / element.clientWidth;
      const backingScaleY = element.height / element.clientHeight;

      return unitPoints.map(([unitX, unitY]) => {
        const x = Math.min(
          Math.max(Math.floor((frameOriginX + unitX * frameSide) * backingScaleX), 0),
          element.width - 1,
        );
        const y = Math.min(
          Math.max(Math.floor((frameOriginY + unitY * frameSide) * backingScaleY), 0),
          element.height - 1,
        );

        return context.getImageData(x, y, 1, 1).data[3] ?? 0;
      });
    },
    { framePadding: CARPET_FRAME_PADDING, unitPoints: points },
  );
}

async function movePointerToUnitPoint(
  page: Page,
  canvas: Locator,
  [unitX, unitY]: UnitPoint,
): Promise<void> {
  const clientPoint = await canvas.evaluate(
    (element, { framePadding, point }) => {
      if (!(element instanceof HTMLCanvasElement)) {
        throw new Error("The carpet hover scene must render a canvas.");
      }

      const bounds = element.getBoundingClientRect();
      const frameSide = Math.min(bounds.width, bounds.height) / framePadding;

      return {
        x: bounds.left + (bounds.width - frameSide) / 2 + point[0] * frameSide,
        y: bounds.top + (bounds.height - frameSide) / 2 + point[1] * frameSide,
      };
    },
    { framePadding: CARPET_FRAME_PADDING, point: [unitX, unitY] },
  );

  await page.mouse.move(clientPoint.x, clientPoint.y);
}

async function advanceToFirstMove(page: Page, scene: Locator): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    await page.clock.runFor(25);
    if ((await scene.getAttribute("data-carpet-shuffle-phase")) === "moving") {
      return;
    }
  }

  throw new Error("The deterministic carpet shuffle move did not start.");
}

async function advanceToMoveMidpoint(page: Page, scene: Locator): Promise<void> {
  for (let step = 0; step < 100; step += 1) {
    const progress = await readNumberAttribute(scene, "data-carpet-shuffle-move-progress");
    if (progress >= 0.475 && progress <= 0.49) {
      return;
    }
    await page.clock.runFor(25);
  }

  throw new Error("The deterministic carpet shuffle move did not reach its midpoint.");
}

async function advanceToNearDock(page: Page, scene: Locator): Promise<void> {
  for (let step = 0; step < 100; step += 1) {
    const progress = await readNumberAttribute(scene, "data-carpet-shuffle-move-progress");
    if (progress >= 0.98 && progress < 1) {
      return;
    }
    await page.clock.runFor(25);
  }

  throw new Error("The deterministic carpet shuffle move did not approach its destination.");
}

async function advanceToFirstDock(page: Page, scene: Locator): Promise<void> {
  for (let step = 0; step < 20; step += 1) {
    await page.clock.runFor(25);
    const completedMoveCount = await readNumberAttribute(
      scene,
      "data-carpet-shuffle-completed-move-count",
    );
    if (completedMoveCount === 1) {
      return;
    }
  }

  throw new Error("The deterministic carpet shuffle move did not dock.");
}

async function leaveCarpetPointer(page: Page): Promise<void> {
  await page.locator("html").dispatchEvent("pointerleave");
  await page.clock.runFor(25);
}

test("carpet shuffle stays recursive through hover and docking", async ({ page }) => {
  await page.clock.install({ time: 1_000 });
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/logo/hover/carpet?auto-shuffle&depth=3&shuffleMoves=1&dev");

  const scene = page.getByTestId("logo-carpet-hover-scene");
  const canvas = scene.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("logo-carpet-hover-page")).toHaveAttribute("data-mechanic", "grow");
  await expect(scene).toHaveAttribute("data-carpet-ready", "true");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await leaveCarpetPointer(page);

  const rootCellCenters = [1 / 6, 0.5, 5 / 6].flatMap((unitY) =>
    [1 / 6, 0.5, 5 / 6].map((unitX): UnitPoint => [unitX, unitY]),
  );
  await expect(scene).toHaveAttribute("data-carpet-shuffle-phase", "resting");
  await expect(scene).toHaveAttribute("data-carpet-shuffle-current-hole", "1,1");
  const sourceAlphas = await readUnitAlphaSamples(canvas, rootCellCenters);
  expect(sourceAlphas[4]).toBeLessThanOrEqual(5);
  for (const [index, alpha] of sourceAlphas.entries()) {
    if (index !== 4) {
      expect(alpha).toBeGreaterThanOrEqual(250);
    }
  }
  await expect(scene).toHaveScreenshot("logo-carpet-shuffle-source.png", SCREENSHOT_OPTIONS);

  await advanceToFirstMove(page, scene);
  await expect(scene).toHaveAttribute("data-carpet-shuffle-move-from", EXPECTED_MOVE_FROM);
  await expect(scene).toHaveAttribute("data-carpet-shuffle-move-to", EXPECTED_MOVE_TO);
  await advanceToMoveMidpoint(page, scene);
  await expect(scene).toHaveAttribute("data-carpet-hover-visible-depths", "1");

  const [sourceOpeningAlpha, movingTileAlpha, destinationOpeningAlpha] = await readUnitAlphaSamples(
    canvas,
    [
      [0.5, 1 / 12],
      [0.5, 1 / 3],
      [0.5, 7 / 12],
    ],
  );
  expect(sourceOpeningAlpha).toBeLessThanOrEqual(5);
  expect(movingTileAlpha).toBeGreaterThanOrEqual(250);
  expect(destinationOpeningAlpha).toBeLessThanOrEqual(5);
  await expect(scene).toHaveScreenshot("logo-carpet-shuffle-midpoint-root.png", SCREENSHOT_OPTIONS);

  const movingRootPositionBeforeHover = await readCoordinateAttribute(
    scene,
    "data-carpet-shuffle-moving-tile-position",
  );
  await movePointerToUnitPoint(page, canvas, [
    (movingRootPositionBeforeHover[0] + 0.5) / 3,
    (movingRootPositionBeforeHover[1] + 0.5) / 3,
  ]);
  await page.clock.runFor(16);

  const movingRootPosition = await readCoordinateAttribute(
    scene,
    "data-carpet-shuffle-moving-tile-position",
  );
  const travelProgress = await readNumberAttribute(
    scene,
    "data-carpet-shuffle-move-travel-progress",
  );
  const moveProgress = await readNumberAttribute(scene, "data-carpet-shuffle-move-progress");
  expect(moveProgress).toBeGreaterThanOrEqual(0.48);
  expect(moveProgress).toBeLessThanOrEqual(0.52);
  const moveFrom = await readCoordinateAttribute(scene, "data-carpet-shuffle-move-from");
  const moveTo = await readCoordinateAttribute(scene, "data-carpet-shuffle-move-to");
  const moveDelta: UnitPoint = [moveTo[0] - moveFrom[0], moveTo[1] - moveFrom[1]];
  expect(movingRootPosition[0]).toBeCloseTo(moveFrom[0] + moveDelta[0] * travelProgress, 5);
  expect(movingRootPosition[1]).toBeCloseTo(moveFrom[1] + moveDelta[1] * travelProgress, 5);
  await movePointerToUnitPoint(page, canvas, [
    (movingRootPosition[0] + 0.5) / 3,
    (movingRootPosition[1] + 0.5) / 3,
  ]);

  await expect(scene).toHaveAttribute("data-carpet-hover-visible-depths", "1,2,3");
  await expect(scene).toHaveAttribute("data-carpet-settled", "true");

  const movingRootSide = 1 / 3;
  const nestedCellSide = movingRootSide / 3;
  const movingRootOrigin: UnitPoint = [
    movingRootPosition[0] * movingRootSide,
    movingRootPosition[1] * movingRootSide,
  ];
  const nestedMoverPosition: UnitPoint = [
    moveFrom[0] + moveDelta[0] * travelProgress,
    moveFrom[1] + moveDelta[1] * travelProgress,
  ];
  const nestedSourceOpening: UnitPoint = [
    movingRootOrigin[0] + (moveFrom[0] + 0.5 - moveDelta[0] * 0.25) * nestedCellSide,
    movingRootOrigin[1] + (moveFrom[1] + 0.5 - moveDelta[1] * 0.25) * nestedCellSide,
  ];
  // The top-left child stays outside the mover's depth-three source and destination openings.
  const nestedMoverSolidPoint: UnitPoint = [
    movingRootOrigin[0] + (nestedMoverPosition[0] + 1 / 6) * nestedCellSide,
    movingRootOrigin[1] + (nestedMoverPosition[1] + 1 / 6) * nestedCellSide,
  ];
  const nestedDestinationOpening: UnitPoint = [
    movingRootOrigin[0] + (moveTo[0] + 0.5 + moveDelta[0] * 0.25) * nestedCellSide,
    movingRootOrigin[1] + (moveTo[1] + 0.5 + moveDelta[1] * 0.25) * nestedCellSide,
  ];
  const [nestedSourceAlpha, nestedMoverAlpha, nestedDestinationAlpha] = await readUnitAlphaSamples(
    canvas,
    [nestedSourceOpening, nestedMoverSolidPoint, nestedDestinationOpening],
  );
  expect(nestedSourceAlpha).toBeLessThanOrEqual(5);
  expect(nestedMoverAlpha).toBeGreaterThanOrEqual(250);
  expect(nestedDestinationAlpha).toBeLessThanOrEqual(5);
  await expect(scene).toHaveScreenshot(
    "logo-carpet-shuffle-hover-midpoint.png",
    SCREENSHOT_OPTIONS,
  );

  await leaveCarpetPointer(page);
  await expect(scene).toHaveAttribute("data-carpet-hover-visible-depths", "1");
  await advanceToNearDock(page, scene);

  const beforeDockAlphas = await readUnitAlphaSamples(canvas, rootCellCenters);
  expect(beforeDockAlphas[1]).toBeLessThanOrEqual(5);
  for (const [index, alpha] of beforeDockAlphas.entries()) {
    if (index !== 1) {
      expect(alpha).toBeGreaterThanOrEqual(250);
    }
  }

  await advanceToFirstDock(page, scene);
  await expect(scene).toHaveAttribute(
    "data-carpet-shuffle-last-completed-move-from",
    EXPECTED_MOVE_FROM,
  );
  await expect(scene).toHaveAttribute(
    "data-carpet-shuffle-last-completed-move-to",
    EXPECTED_MOVE_TO,
  );
  const afterDockAlphas = await readUnitAlphaSamples(canvas, rootCellCenters);
  expect(afterDockAlphas).toEqual(beforeDockAlphas);
  await expect(scene).toHaveScreenshot("logo-carpet-shuffle-post-dock.png", SCREENSHOT_OPTIONS);
});
