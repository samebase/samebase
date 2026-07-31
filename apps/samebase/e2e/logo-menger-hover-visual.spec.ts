import { expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { signInIfNeeded } from "./liveHelpers";
import { expectLogoMobilePaneEscapeLanes, exposeMobileMainPane } from "./logoMobilePane";
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
    extraSearch = "",
    maximumDepth = "4",
    pointerTiltEnabled = false,
    pointerTiltRadiusScale = "1",
    pointerTiltStrengthScale = "1.67",
    reducedMotion = "reduce",
    rotationDegrees,
  }: {
    elevationDegrees: string;
    extraSearch?: string;
    maximumDepth?: string;
    pointerTiltEnabled?: boolean;
    pointerTiltRadiusScale?: string;
    pointerTiltStrengthScale?: string;
    reducedMotion?: "no-preference" | "reduce";
    rotationDegrees: string;
  },
): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(
    page,
    `/logo/hover/menger?elev=${elevationDegrees}&rot=${rotationDegrees}&top=red-400${
      maximumDepth === "4" ? "" : `&depth=${maximumDepth}`
    }${pointerTiltEnabled ? "&tilt" : ""}${
      pointerTiltRadiusScale === "1" ? "" : `&tiltRadius=${pointerTiltRadiusScale}`
    }${
      pointerTiltStrengthScale === "1.67" ? "" : `&tiltStrength=${pointerTiltStrengthScale}`
    }${extraSearch}`,
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
  await expect(scene).toHaveAttribute(
    "data-menger-pointer-tilt",
    pointerTiltEnabled ? "landing" : "off",
  );
  await expect(scene).toHaveAttribute(
    "data-menger-pointer-tilt-radius-scale",
    pointerTiltRadiusScale,
  );
  await expect(scene).toHaveAttribute(
    "data-menger-pointer-tilt-strength-scale",
    pointerTiltStrengthScale,
  );
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

test("Menger hover keeps automatic-probe controls shareable in route search", async ({ page }) => {
  await openMengerHoverCase(page, {
    elevationDegrees: "0",
    extraSearch: "&probeLoop=60",
    rotationDegrees: "180",
  });
  const controls = page.locator('[data-testid="logo-menger-hover-controls"]');
  const playCheckbox = controls.getByRole("checkbox", { name: "Play" });
  const showPathCheckbox = controls.getByRole("checkbox", { name: "Show path" });
  const pathSelect = controls.getByRole("combobox", { name: "Automatic probe path" });
  const startEndSlider = controls.getByRole("slider", {
    name: "Automatic probe start and end point",
  });
  const heightSlider = controls.getByRole("slider", { name: "Automatic probe path height" });
  const offsetSlider = controls.getByRole("slider", {
    name: "Automatic probe path vertical shift",
  });
  const widthSlider = controls.getByRole("slider", { name: "Automatic probe path width" });

  await expect(playCheckbox).toHaveAttribute("aria-checked", "false");
  await expect(showPathCheckbox).toHaveAttribute("aria-checked", "false");
  await expect(pathSelect).toContainText("Vertical 8");
  await expect(startEndSlider).toHaveValue("0.25");
  await expect(heightSlider).toHaveValue("0.55");
  await expect(heightSlider).toHaveAttribute("max", "2.5");
  await expect(offsetSlider).toHaveValue("0");
  await expect(page.locator('[data-testid="logo-menger-automatic-probe-path"]')).toHaveCount(0);

  await pathSelect.click();
  await page.getByRole("option", { name: "Orbit" }).click();
  await expect(pathSelect).toContainText("Orbit");
  await expect(page).toHaveURL(/(?:\?|&)probePath=orbit(?:&|$)/);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await playCheckbox.click();
  await expect(page).toHaveURL(/(?:\?|&)probe(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)probeLoop=60(?:&|$)/);
  await expect(page.getByTestId("logo-menger-hover-scene")).toHaveAttribute(
    "data-automatic-probe-state",
    "playing",
  );
  const progressAfterStarting = await readNumberAttribute(
    page.getByTestId("logo-menger-hover-scene"),
    "data-automatic-probe-progress",
  );
  await expect
    .poll(() =>
      readNumberAttribute(
        page.getByTestId("logo-menger-hover-scene"),
        "data-automatic-probe-progress",
      ),
    )
    .not.toBe(progressAfterStarting);
  const progressBeforeShowingPath = await readNumberAttribute(
    page.getByTestId("logo-menger-hover-scene"),
    "data-automatic-probe-progress",
  );

  await showPathCheckbox.click();
  await expect(page).toHaveURL(/(?:\?|&)probePathVisible(?:&|$)/);
  await expect(page.locator('[data-testid="logo-menger-automatic-probe-path"]')).toBeVisible();
  await expect(page.getByTestId("logo-menger-automatic-probe-start-end")).toBeVisible();
  expect(
    await readNumberAttribute(
      page.getByTestId("logo-menger-hover-scene"),
      "data-automatic-probe-progress",
    ),
  ).toBeGreaterThanOrEqual(progressBeforeShowingPath);

  const urlBeforeStartEndDraft = page.url();
  await startEndSlider.fill("0.6");
  expect(page.url()).toBe(urlBeforeStartEndDraft);
  await startEndSlider.blur();
  await expect(page).toHaveURL(/(?:\?|&)probeStart=0\.6(?:&|$)/);

  const urlBeforeHeightDraft = page.url();
  await heightSlider.fill("1.35");
  expect(page.url()).toBe(urlBeforeHeightDraft);
  await heightSlider.blur();
  await expect(page).toHaveURL(/(?:\?|&)probeHeight=1\.35(?:&|$)/);

  const urlBeforeOffsetDraft = page.url();
  await offsetSlider.fill("-0.4");
  expect(page.url()).toBe(urlBeforeOffsetDraft);
  await offsetSlider.blur();
  await expect(page).toHaveURL(/(?:\?|&)probeOffset=-0\.4(?:&|$)/);

  const urlBeforeWidthDraft = page.url();
  await widthSlider.fill("0.4");
  expect(page.url()).toBe(urlBeforeWidthDraft);
  await widthSlider.blur();
  await expect(page).toHaveURL(/(?:\?|&)probeWidth=0\.4(?:&|$)/);
});

test("Menger automatic probe has a deterministic reduced-motion research view", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrated|Minified React error #418/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    extraSearch:
      "&probe&probeHeight=1.35&probeLanding&probeOffset=0.25&probePathVisible&probeWidth=0.4",
    maximumDepth: "3",
    pointerTiltEnabled: true,
    reducedMotion: "reduce",
    rotationDegrees: "180",
  });
  const controls = page.locator('[data-testid="logo-menger-hover-controls"]');
  const frame = page.locator('[data-testid="logo-menger-hover-scene-frame"]');
  const mainPane = page.locator('[data-testid="logo-menger-hover-page"]');
  const frameBox = await frame.boundingBox();
  if (!frameBox) {
    throw new Error("The landing-size Menger research scene must have a bounding box.");
  }

  expect(Math.abs(frameBox.width - frameBox.height)).toBeLessThanOrEqual(1);
  expect(frameBox.width).toBeLessThanOrEqual(352);
  await expect(scene).toHaveAttribute("data-automatic-probe-state", "reduced-motion");
  await expect(scene).toHaveAttribute("data-automatic-probe-progress", "0.0000");
  await expect(scene).toHaveAttribute("data-presentation-horizontal-degrees", "0.000");
  await expect(scene).toHaveAttribute("data-presentation-vertical-degrees", "0.000");
  const path = page.locator('[data-testid="logo-menger-automatic-probe-path"]');
  await expect(path).toBeVisible();
  const pathPoints = await path.locator("polyline").getAttribute("points");
  if (pathPoints === null) {
    throw new Error("The automatic probe path must expose its polyline points.");
  }
  const yCoordinates = pathPoints
    .trim()
    .split(/\s+/)
    .map((point) => Number(point.split(",")[1]));
  expect(Math.max(...yCoordinates)).toBeGreaterThan(1);
  expect(hydrationErrors).toEqual([]);
  await expect(controls).toHaveScreenshot(
    "logo-menger-hover-controls-automatic-probe.png",
    SCREENSHOT_OPTIONS,
  );
  await expect(frame).toHaveScreenshot(
    "logo-menger-hover-automatic-probe-path.png",
    SCREENSHOT_OPTIONS,
  );
  await expect(mainPane).toHaveScreenshot(
    "logo-menger-hover-automatic-probe-main-pane.png",
    SCREENSHOT_OPTIONS,
  );
});

test("Menger automatic probe rests at its marked start and end point", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    extraSearch:
      "&probe&probeLoop=0.1&probePath=orbit&probePathVisible&probeRest=1&probeStart=0.25",
    maximumDepth: "2",
    reducedMotion: "no-preference",
    rotationDegrees: "180",
  });
  const marker = page.getByTestId("logo-menger-automatic-probe-start-end");
  const sceneBox = await scene.boundingBox();
  if (sceneBox === null) {
    throw new Error("Expected a visible Menger scene.");
  }

  await expect(marker).toBeVisible();
  await expect(scene).toHaveAttribute("data-automatic-probe-state", "resting");
  await expect(scene).toHaveAttribute("data-automatic-probe-progress", "1.0000");
  const markerX = Number(await marker.getAttribute("cx"));
  const markerY = Number(await marker.getAttribute("cy"));
  expect(await readNumberAttribute(scene, "data-automatic-probe-client-x")).toBeCloseTo(
    sceneBox.x + markerX * sceneBox.width,
    0,
  );
  expect(await readNumberAttribute(scene, "data-automatic-probe-client-y")).toBeCloseTo(
    sceneBox.y + markerY * sceneBox.height,
    0,
  );
});

test("Menger automatic probe suspends frames while its scene is offscreen", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    extraSearch: "&probe&probeLoop=1000000",
    maximumDepth: "2",
    reducedMotion: "reduce",
    rotationDegrees: "180",
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(scene).toHaveAttribute("data-automatic-probe-state", "playing");

  await scene.evaluate((element) => {
    element.style.display = "none";
  });
  await expect(scene).toHaveAttribute("data-automatic-probe-state", "suspended");
  const renderCount = await readNumberAttribute(scene, "data-hover-render-count");

  await page.mouse.move(20, 20);
  await page.waitForTimeout(250);
  await expect(scene).toHaveAttribute("data-hover-render-count", String(renderCount));

  await scene.evaluate((element) => {
    element.style.display = "";
  });
  await expect(scene).toHaveAttribute("data-automatic-probe-state", "playing");
  await expect(scene).toHaveAttribute("data-automatic-probe-progress", "0.0000");
});

test("Menger automatic probe does not loop frames at depth one without tilt", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    extraSearch: "&probe",
    maximumDepth: "1",
    reducedMotion: "no-preference",
    rotationDegrees: "180",
  });
  await expect(scene).toHaveAttribute("data-automatic-probe-state", "playing");
  await expect(scene).toHaveAttribute("data-hover-settled", "true");
  await expect(scene).toHaveAttribute("data-presentation-tilt-settled", "true");
  await page.waitForTimeout(250);
  const renderCount = await readNumberAttribute(scene, "data-hover-render-count");

  await page.waitForTimeout(250);
  await expect(scene).toHaveAttribute("data-hover-render-count", String(renderCount));
});

test("Menger automatic probe fails closed for overflowed finite route settings", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(
    page,
    "/logo/hover/menger?depth=1&elev=0&rot=180&probe&probeHeight=1e308&probePath=orbit",
  );
  const scene = page.getByTestId("logo-menger-hover-scene");
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  const controls = page.getByTestId("logo-menger-hover-controls");
  await expect(controls.locator('output[for="menger-hover-automatic-probe-height"]')).toHaveText(
    "1e+310%",
  );
  await expect(controls.locator('output[for="menger-hover-automatic-probe-width"]')).not.toHaveText(
    /Infinity|NaN/,
  );

  const expectInvalidProbeToStop = async () => {
    await expect(scene).toHaveAttribute("data-automatic-probe-state", "invalid");
    await expect(scene).not.toHaveAttribute("data-automatic-probe-client-x", /.+/);
    await expect(scene).not.toHaveAttribute("data-automatic-probe-client-y", /.+/);
    await expect(scene).not.toHaveAttribute("data-automatic-probe-progress", /.+/);
    const dataAttributeValues = await scene.evaluate((element) =>
      Array.from(element.attributes)
        .filter(({ name }) => name.startsWith("data-"))
        .map(({ value }) => value),
    );
    expect(dataAttributeValues.join(" ")).not.toMatch(/Infinity|NaN/);
    await page.waitForTimeout(250);
    const renderCount = await readNumberAttribute(scene, "data-hover-render-count");
    await page.waitForTimeout(250);
    await expect(scene).toHaveAttribute("data-hover-render-count", String(renderCount));
  };

  await expectInvalidProbeToStop();
  await page.goto(
    "/logo/hover/menger?elev=0&rot=180&probe&probeHeight=3e305&probeLoop=0.1&probeRest=0&probeWidth=3e305&tilt&tiltRadius=0",
    { waitUntil: "domcontentloaded" },
  );
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expectInvalidProbeToStop();
  await page.goto(
    "/logo/hover/menger?depth=1&elev=0&rot=180&probe&probeLoop=1e308&probeRest=1e308",
    { waitUntil: "domcontentloaded" },
  );
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expectInvalidProbeToStop();
});

test("Menger hover composes the optional landing tilt with its stored view", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "30",
    maximumDepth: "2",
    pointerTiltEnabled: true,
    reducedMotion: "no-preference",
    rotationDegrees: "225",
  });
  const controls = page.locator('[data-testid="logo-menger-hover-controls"]');
  const tiltCheckbox = controls.getByRole("checkbox", { name: "Landing tilt" });
  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The Menger hover scene must have a bounding box.");
  }

  await expect(tiltCheckbox).toHaveAttribute("aria-checked", "true");
  await expect(controls).toHaveScreenshot(
    "logo-menger-hover-controls-landing-tilt.png",
    SCREENSHOT_OPTIONS,
  );

  const tiltCenterX = await readNumberAttribute(scene, "data-presentation-tilt-center-x");
  const tiltCenterY = await readNumberAttribute(scene, "data-presentation-tilt-center-y");
  const neutralRadius = await readNumberAttribute(scene, "data-presentation-tilt-neutral-radius");
  const activePointerX = tiltCenterX - neutralRadius - 24;
  expect(activePointerX).toBeGreaterThan(sceneBox.x);
  expect(activePointerX).toBeLessThan(sceneBox.x + sceneBox.width);
  const storedUrl = page.url();
  await page.mouse.move(activePointerX, tiltCenterY);
  await expect
    .poll(() => readNumberAttribute(scene, "data-presentation-horizontal-degrees"))
    .toBeLessThan(-0.1);
  await expect(scene).toHaveAttribute("data-presentation-vertical-degrees", "0.000");
  await expect(scene).toHaveAttribute("data-presentation-tilt-settled", "true");
  await expect(scene).toHaveAttribute("data-logo-elevation-degrees", "30");
  await expect(scene).toHaveAttribute("data-logo-rotation-degrees", "225");
  expect(page.url()).toBe(storedUrl);
  await waitForPaint(page);
  await expect(scene).toHaveScreenshot("logo-menger-hover-depth-two-landing-tilt.png", {
    ...SCREENSHOT_OPTIONS,
    maxDiffPixelRatio: 0,
  });

  await tiltCheckbox.click();
  await expect(tiltCheckbox).toHaveAttribute("aria-checked", "false");
  await expect(page).not.toHaveURL(/(?:\?|&)tilt(?:&|$)/);
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt", "off");
  await expect(scene).toHaveAttribute("data-presentation-horizontal-degrees", "0.000");
  await expect(scene).toHaveAttribute("data-presentation-vertical-degrees", "0.000");
  await expect(scene).toHaveAttribute("data-presentation-tilt-settled", "true");
});

test("Menger hover uses a projected cube radius in every pointer direction", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    maximumDepth: "2",
    pointerTiltEnabled: true,
    reducedMotion: "no-preference",
    rotationDegrees: "180",
  });
  const canvasBox = await scene.locator("canvas").boundingBox();
  if (!canvasBox) {
    throw new Error("The Menger hover canvas must have a bounding box.");
  }

  const centerX = await readNumberAttribute(scene, "data-presentation-tilt-center-x");
  const centerY = await readNumberAttribute(scene, "data-presentation-tilt-center-y");
  const baseRadius = await readNumberAttribute(scene, "data-presentation-tilt-base-radius");
  const neutralRadius = await readNumberAttribute(scene, "data-presentation-tilt-neutral-radius");
  expect(baseRadius).toBeGreaterThan(0);
  expect(neutralRadius).toBeCloseTo(baseRadius, 2);
  const restingScreenshot = await scene.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const foregroundBounds = measureScreenshotForegroundBounds(restingScreenshot);
  if (!foregroundBounds) {
    throw new Error("The resting Menger scene must contain a projected cube.");
  }
  const foregroundCornerRadius = Math.hypot(
    (foregroundBounds.maxX - foregroundBounds.minX + 1) / 2,
    (foregroundBounds.maxY - foregroundBounds.minY + 1) / 2,
  );
  expect(Math.abs(baseRadius - foregroundCornerRadius)).toBeLessThan(2);

  for (const [name, directionX, directionY, targetAttribute, activeSign] of [
    ["east", 1, 0, "data-presentation-horizontal-degrees", 1],
    ["west", -1, 0, "data-presentation-horizontal-degrees", -1],
    ["south", 0, 1, "data-presentation-vertical-degrees", -1],
    ["north", 0, -1, "data-presentation-vertical-degrees", 1],
  ] as const) {
    await test.step(name, async () => {
      await page.mouse.move(
        centerX + directionX * neutralRadius * 0.99,
        centerY + directionY * neutralRadius * 0.99,
      );
      await expect(scene).toHaveAttribute("data-presentation-horizontal-degrees", "0.000");
      await expect(scene).toHaveAttribute("data-presentation-vertical-degrees", "0.000");

      const activeX = centerX + directionX * neutralRadius * 1.01;
      const activeY = centerY + directionY * neutralRadius * 1.01;
      expect(activeX).toBeGreaterThan(canvasBox.x);
      expect(activeX).toBeLessThan(canvasBox.x + canvasBox.width);
      expect(activeY).toBeGreaterThan(canvasBox.y);
      expect(activeY).toBeLessThan(canvasBox.y + canvasBox.height);
      await page.mouse.move(activeX, activeY);
      if (activeSign > 0) {
        await expect.poll(() => readNumberAttribute(scene, targetAttribute)).toBeGreaterThan(0);
      } else {
        await expect.poll(() => readNumberAttribute(scene, targetAttribute)).toBeLessThan(0);
      }
    });
  }
});

test("Menger hover persists its adjustable tilt radius and strength", async ({ page }) => {
  let scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    maximumDepth: "2",
    pointerTiltEnabled: true,
    reducedMotion: "no-preference",
    rotationDegrees: "180",
  });
  const controls = page.locator('[data-testid="logo-menger-hover-controls"]');
  const radiusSlider = controls.getByRole("slider", { name: "Tilt radius" });
  const strengthSlider = controls.getByRole("slider", { name: "Tilt strength" });
  const tiltCheckbox = controls.getByRole("checkbox", { name: "Landing tilt" });

  await expect(radiusSlider).toHaveAttribute("min", "0");
  await expect(radiusSlider).toHaveAttribute("max", "2");
  await expect(radiusSlider).toHaveValue("1");
  await expect(strengthSlider).toHaveAttribute("min", "0");
  await expect(strengthSlider).toHaveAttribute("max", "2");
  await expect(strengthSlider).toHaveValue("1.67");
  await radiusSlider.fill("1.2");
  await radiusSlider.press("Tab");
  await strengthSlider.fill("1.5");
  await strengthSlider.press("Tab");
  await expect(page).toHaveURL(/(?:\?|&)tiltRadius=1\.2(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)tiltStrength=1\.5(?:&|$)/);
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-radius-scale", "1.2");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-strength-scale", "1.5");

  const centerX = await readNumberAttribute(scene, "data-presentation-tilt-center-x");
  const centerY = await readNumberAttribute(scene, "data-presentation-tilt-center-y");
  const baseRadius = await readNumberAttribute(scene, "data-presentation-tilt-base-radius");
  const neutralRadius = await readNumberAttribute(scene, "data-presentation-tilt-neutral-radius");
  const canvasBox = await scene.locator("canvas").boundingBox();
  if (!canvasBox) {
    throw new Error("The Menger hover canvas must have a bounding box.");
  }
  expect(neutralRadius).toBeCloseTo(baseRadius * 1.2, 2);
  const neutralPointerX = centerX + baseRadius * 1.1;
  const activePointerX = centerX + baseRadius * 1.3;
  expect(neutralPointerX).toBeLessThan(canvasBox.x + canvasBox.width);
  expect(activePointerX).toBeLessThan(canvasBox.x + canvasBox.width);
  await page.mouse.move(neutralPointerX, centerY);
  await expect(scene).toHaveAttribute("data-presentation-horizontal-degrees", "0.000");
  await page.mouse.move(activePointerX, centerY);
  await expect
    .poll(() => readNumberAttribute(scene, "data-presentation-horizontal-degrees"))
    .toBeCloseTo(0.72, 2);

  await tiltCheckbox.click();
  await expect(page).not.toHaveURL(/(?:\?|&)tilt(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)tiltRadius=1\.2(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)tiltStrength=1\.5(?:&|$)/);
  await tiltCheckbox.click();
  await page.reload();
  scene = page.locator('[data-testid="logo-menger-hover-scene"]');
  await expect(scene.locator("canvas")).toBeVisible();
  await expect(radiusSlider).toHaveValue("1.2");
  await expect(strengthSlider).toHaveValue("1.5");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-radius-scale", "1.2");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-strength-scale", "1.5");
  const depthSlider = controls.getByRole("slider", { name: "Reveal depth" });
  await depthSlider.fill("3");
  await depthSlider.press("Tab");
  await expect(page).toHaveURL(/(?:\?|&)depth=3(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)tiltRadius=1\.2(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)tiltStrength=1\.5(?:&|$)/);
  await expect(scene).toHaveAttribute("data-menger-maximum-depth", "3");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-radius-scale", "1.2");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-strength-scale", "1.5");

  await page.goto("/logo/hover/menger?depth=2&elev=0&rot=180&tilt&tiltRadius=3.5&tiltStrength=2.5");
  await expect(scene.locator("canvas")).toBeVisible();
  await expect(radiusSlider).toHaveAttribute("max", "3.5");
  await expect(radiusSlider).toHaveValue("3.5");
  await expect(strengthSlider).toHaveAttribute("max", "2.5");
  await expect(strengthSlider).toHaveValue("2.5");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-radius-scale", "3.5");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-strength-scale", "2.5");

  await radiusSlider.fill("1.5");
  await expect(radiusSlider).toHaveValue("1.5");
  await expect(radiusSlider).toHaveAttribute("max", "3.5");
  await radiusSlider.press("Tab");
  await expect(page).toHaveURL(/(?:\?|&)tiltRadius=1\.5(?:&|$)/);
  await expect(radiusSlider).toHaveAttribute("max", "2");

  await strengthSlider.fill("1.5");
  await expect(strengthSlider).toHaveValue("1.5");
  await expect(strengthSlider).toHaveAttribute("max", "2.5");
  await strengthSlider.press("Tab");
  await expect(page).toHaveURL(/(?:\?|&)tiltStrength=1\.5(?:&|$)/);
  await expect(strengthSlider).toHaveAttribute("max", "2");
});

test("Menger hover suppresses landing tilt for reduced motion", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "30",
    maximumDepth: "2",
    pointerTiltEnabled: true,
    rotationDegrees: "225",
  });
  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The Menger hover scene must have a bounding box.");
  }

  await page.mouse.move(sceneBox.x - 64, sceneBox.y + sceneBox.height / 2);
  await expect(scene).toHaveAttribute("data-presentation-horizontal-degrees", "0.000");
  await expect(scene).toHaveAttribute("data-presentation-vertical-degrees", "0.000");
  await expect(scene).toHaveAttribute("data-presentation-tilt-settled", "true");
});

test("Menger hover snaps an active landing tilt to neutral for reduced motion", async ({
  page,
}) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "30",
    maximumDepth: "2",
    pointerTiltEnabled: true,
    reducedMotion: "no-preference",
    rotationDegrees: "225",
  });
  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The Menger hover scene must have a bounding box.");
  }

  await page.mouse.move(sceneBox.x + sceneBox.width + 60, sceneBox.y + sceneBox.height / 2);
  await expect
    .poll(() => readNumberAttribute(scene, "data-presentation-applied-angle-degrees"))
    .toBeGreaterThan(0.1);
  await expect(scene).toHaveAttribute("data-presentation-tilt-settled", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scene).toHaveAttribute("data-presentation-horizontal-degrees", "0.000");
  expect(await scene.getAttribute("data-presentation-applied-angle-degrees")).toBe("0.000");
  expect(await scene.getAttribute("data-presentation-tilt-settled")).toBe("true");
});

test("Menger hover resumes landing tilt after a pointer cancellation", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "30",
    maximumDepth: "2",
    pointerTiltEnabled: true,
    reducedMotion: "no-preference",
    rotationDegrees: "225",
  });
  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The Menger hover scene must have a bounding box.");
  }
  const pointerY = sceneBox.y + sceneBox.height / 2;

  await page.mouse.move(sceneBox.x - 180, pointerY);
  await expect(scene).toHaveAttribute("data-presentation-tilt-settled", "true");
  await expect
    .poll(() => readNumberAttribute(scene, "data-presentation-applied-angle-degrees"))
    .toBeGreaterThan(0.1);

  await scene.evaluate((element) => {
    element.addEventListener(
      "pointerdown",
      (event) => {
        element.setAttribute("data-test-pointer-id", String(event.pointerId));
      },
      { once: true },
    );
  });
  await page.mouse.move(sceneBox.x + sceneBox.width / 2, pointerY);
  await page.mouse.down();
  await page.mouse.move(sceneBox.x + sceneBox.width * 0.3, pointerY);
  await expect
    .poll(() => readNumberAttribute(scene, "data-presentation-applied-angle-degrees"))
    .toBeGreaterThan(0.1);

  const pointerId = await readNumberAttribute(scene, "data-test-pointer-id");
  await scene.dispatchEvent("pointercancel", {
    button: 0,
    buttons: 0,
    clientX: sceneBox.x + sceneBox.width * 0.3,
    clientY: pointerY,
    isPrimary: true,
    pointerId,
    pointerType: "mouse",
  });
  await expect
    .poll(() => readNumberAttribute(scene, "data-presentation-applied-angle-degrees"))
    .toBeLessThan(0.01);
  await expect(scene).toHaveAttribute("data-presentation-tilt-settled", "true");
  await page.mouse.up();
});

test("Menger hover recalculates landing tilt after a canvas resize", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "30",
    maximumDepth: "2",
    pointerTiltEnabled: true,
    reducedMotion: "no-preference",
    rotationDegrees: "225",
  });
  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The Menger hover scene must have a bounding box.");
  }

  await page.mouse.move(sceneBox.x + sceneBox.width + 60, sceneBox.y + sceneBox.height / 2);
  await expect(scene).toHaveAttribute("data-presentation-tilt-settled", "true");
  const initialTarget = await readNumberAttribute(scene, "data-presentation-horizontal-degrees");

  await page.setViewportSize({ width: 1200, height: 1000 });
  await expect
    .poll(async () => {
      const resizedSceneBox = await scene.boundingBox();
      return resizedSceneBox?.width ?? sceneBox.width;
    })
    .toBeLessThan(sceneBox.width);
  await expect
    .poll(async () => {
      const resizedTarget = await readNumberAttribute(
        scene,
        "data-presentation-horizontal-degrees",
      );
      return Math.abs(resizedTarget - initialTarget);
    })
    .toBeGreaterThan(0.05);
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
  expect(await readNumberAttribute(scene, "data-hover-triangle-count")).toBe(2_813_280);
});

test("Menger hover keeps depth-two, depth-three, and depth-four openings distinct", async ({
  page,
}) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "0",
    rotationDegrees: "180",
  });
  await movePointerRelativeToScene(page, scene, {
    expectedProbe: [/-?0\.000/, "0.403", "0.344"],
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

test("Menger hover keeps depth-two oblique tunnel surfaces exact", async ({ page }) => {
  const scene = await openMengerHoverCase(page, {
    elevationDegrees: "30",
    maximumDepth: "2",
    rotationDegrees: "225",
  });
  await movePointerRelativeToScene(page, scene, {
    expectedProbe: [/^0\.00[0-2]$/, "0.998", "0.055"],
    x: 0.52,
    y: 0.45,
  });

  await expect(scene).toHaveScreenshot("logo-menger-hover-depth-two-oblique-cover.png", {
    ...SCREENSHOT_OPTIONS,
    maxDiffPixelRatio: 0,
  });

  await movePointerRelativeToScene(page, scene, {
    expectedProbe: ["0.508", "1.000", "0.094"],
    x: 0.35,
    y: 0.35,
  });
  await expect(scene).toHaveAttribute("data-hover-maximum-openness", "1.000000");
  await expect(scene).toHaveScreenshot("logo-menger-hover-depth-two-oblique-fully-open.png", {
    ...SCREENSHOT_OPTIONS,
    maxDiffPixelRatio: 0,
  });
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
    expectedProbe: ["0.812", "1.000", "0.720"],
    x: 0.48,
    y: 0.34,
  });

  await expect(scene).toHaveScreenshot("logo-menger-hover-three-face-edge.png", SCREENSHOT_OPTIONS);
});

test.describe("Menger automatic probe on a phone", () => {
  test.use({
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  });

  test("keeps top and bottom pane escape lanes outside the canvas", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(page, "/logo/hover/menger?depth=2&elev=0&rot=180");
    await exposeMobileMainPane(page);

    const hoverPage = page.getByTestId("logo-menger-hover-page");
    const scene = page.getByTestId("logo-menger-hover-scene");
    await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expectLogoMobilePaneEscapeLanes(page, hoverPage, scene);

    await expect(page).toHaveScreenshot("logo-menger-hover-phone.png", SCREENSHOT_OPTIONS);
  });

  test("drives reveal and tilt on a coarse pointer, then pauses for touch drag", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(
      page,
      "/logo/hover/menger?depth=2&elev=0&rot=180&probe&probeLanding&probeLoop=10&probeRest=0.75&tilt&tiltRadius=0",
    );
    await exposeMobileMainPane(page);
    const scene = page.locator('[data-testid="logo-menger-hover-scene"]');
    await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expect(scene).toHaveAttribute("data-automatic-probe-state", "playing");
    await expect(scene).toHaveAttribute("data-hover-maximum-openness", /^(?!0\.000000).+/);
    await expect
      .poll(async () => {
        const horizontal = await readNumberAttribute(scene, "data-presentation-horizontal-degrees");
        const vertical = await readNumberAttribute(scene, "data-presentation-vertical-degrees");
        return Math.abs(horizontal) + Math.abs(vertical);
      })
      .toBeGreaterThan(0.1);

    const sceneBounds = await scene.boundingBox();
    if (sceneBounds === null) {
      throw new Error("Expected a visible mobile Menger scene.");
    }
    const startX = sceneBounds.x + sceneBounds.width * 0.42;
    const startY = sceneBounds.y + sceneBounds.height * 0.42;
    const session = await page.context().newCDPSession(page);
    const gestureStartTimeMs = Date.now();
    let touchEnded = false;

    try {
      const touchPoint = {
        force: 1,
        id: 1,
        radiusX: 4,
        radiusY: 4,
        x: startX,
        y: startY,
      };
      await session.send("Input.dispatchTouchEvent", {
        timestamp: gestureStartTimeMs / 1_000,
        touchPoints: [touchPoint],
        type: "touchStart",
      });
      await page.waitForTimeout(50);
      await session.send("Input.dispatchTouchEvent", {
        timestamp: (gestureStartTimeMs + 50) / 1_000,
        touchPoints: [{ ...touchPoint, x: startX + 24, y: startY + 12 }],
        type: "touchMove",
      });
      await expect(scene).toHaveAttribute("data-automatic-probe-state", "dragging");
      const automaticCoordinatesDuringDrag = await Promise.all([
        scene.getAttribute("data-automatic-probe-client-x"),
        scene.getAttribute("data-automatic-probe-client-y"),
        scene.getAttribute("data-automatic-probe-progress"),
        scene.getAttribute("data-hover-coordinate-x"),
        scene.getAttribute("data-hover-coordinate-y"),
        scene.getAttribute("data-hover-coordinate-z"),
      ]);
      const opennessDuringDrag = await scene.getAttribute("data-hover-maximum-openness");

      await page.waitForTimeout(100);
      await session.send("Input.dispatchTouchEvent", {
        timestamp: (gestureStartTimeMs + 150) / 1_000,
        touchPoints: [{ ...touchPoint, x: startX + 48, y: startY + 24 }],
        type: "touchMove",
      });
      await page.waitForTimeout(100);
      await expect(scene).toHaveAttribute("data-automatic-probe-state", "dragging");
      expect(
        await Promise.all([
          scene.getAttribute("data-automatic-probe-client-x"),
          scene.getAttribute("data-automatic-probe-client-y"),
          scene.getAttribute("data-automatic-probe-progress"),
          scene.getAttribute("data-hover-coordinate-x"),
          scene.getAttribute("data-hover-coordinate-y"),
          scene.getAttribute("data-hover-coordinate-z"),
        ]),
      ).toEqual(automaticCoordinatesDuringDrag);
      await expect(scene).toHaveAttribute("data-hover-maximum-openness", opennessDuringDrag ?? "");

      await session.send("Input.dispatchTouchEvent", {
        timestamp: (gestureStartTimeMs + 251) / 1_000,
        touchPoints: [],
        type: "touchEnd",
      });
      touchEnded = true;
      await expect(scene).toHaveAttribute("data-automatic-probe-state", "resting");
      await expect(scene).toHaveAttribute("data-automatic-probe-progress", "1.0000");
      await expect(scene).toHaveAttribute("data-automatic-probe-client-x", /.+/);
      await expect(scene).toHaveAttribute("data-automatic-probe-client-y", /.+/);
      await expect(scene).toHaveAttribute("data-automatic-probe-state", "playing", {
        timeout: 2_000,
      });
    } finally {
      if (!touchEnded) {
        await session
          .send("Input.dispatchTouchEvent", {
            touchPoints: [],
            type: "touchEnd",
          })
          .catch(() => undefined);
      }
      await session.detach().catch(() => undefined);
    }
  });
});

test.describe("Menger hover on a landscape phone", () => {
  test.use({
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 390, width: 700 },
  });

  test("keeps both pane escape lanes outside the short canvas", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(page, "/logo/hover/menger?depth=2&elev=0&rot=180");
    await exposeMobileMainPane(page);

    const hoverPage = page.getByTestId("logo-menger-hover-page");
    const scene = page.getByTestId("logo-menger-hover-scene");
    await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expectLogoMobilePaneEscapeLanes(page, hoverPage, scene);
  });
});

test.describe("Menger hover on a wide landscape touch viewport", () => {
  test.use({
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 390, width: 844 },
  });

  test("keeps a usable canvas and both vertical touch lanes", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(page, "/logo/hover/menger?depth=2&elev=0&rot=180");

    const hoverPage = page.getByTestId("logo-menger-hover-page");
    const scene = page.getByTestId("logo-menger-hover-scene");
    await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
    const pageBounds = await hoverPage.boundingBox();
    const sceneBounds = await scene.boundingBox();
    if (pageBounds === null || sceneBounds === null) {
      throw new Error("Expected the wide landscape Menger page and scene.");
    }

    const topGap = sceneBounds.y - pageBounds.y;
    const bottomGap = pageBounds.y + pageBounds.height - sceneBounds.y - sceneBounds.height;
    expect(sceneBounds.width).toBeGreaterThanOrEqual(192);
    expect(Math.abs(sceneBounds.width - sceneBounds.height)).toBeLessThanOrEqual(1);
    expect(topGap).toBeGreaterThan(48);
    expect(bottomGap).toBeGreaterThan(48);
  });
});
