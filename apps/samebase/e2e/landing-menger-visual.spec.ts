import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
} from "@samebase/logo-model/identity";
import {
  DRAG_ELEVATION_DEGREES_PER_PIXEL,
  DRAG_ROTATION_DEGREES_PER_PIXEL,
} from "../src/components/logo/logoViewDragConstants";
import { measureScreenshotForegroundBounds } from "./visualDiff";

test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

const SCREENSHOT_OPTIONS = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.001,
  scale: "css",
  timeout: 60_000,
} as const;

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

async function dragSceneByPixels(
  page: Page,
  scene: Locator,
  delta: { x: number; y: number },
): Promise<void> {
  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The landing Menger scene must have a bounding box.");
  }

  const centerX = sceneBox.x + sceneBox.width / 2;
  const centerY = sceneBox.y + sceneBox.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + delta.x, centerY + delta.y);
  await page.mouse.up();
}

async function readNumberAttribute(locator: Locator, attribute: string): Promise<number> {
  const value = await locator.getAttribute(attribute);
  if (value === null) {
    throw new Error(`The landing Menger scene must expose ${attribute}.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`The landing Menger scene must expose a numeric ${attribute}.`);
  }
  return number;
}

test("public landing uses the depth-three Menger hover scene @logo-research", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const hero = page.getByTestId("landing-preview-hero-menger");
  const fallback = page.getByTestId("landing-preview-hero-menger-fallback");
  const scene = hero.getByTestId("logo-menger-hover-scene");
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(hero).toHaveAttribute("data-state", "ready");
  await expect(fallback).toHaveCSS("opacity", "0");
  await expect(scene).toHaveAttribute("data-menger-maximum-depth", "3");
  await expect(scene).toHaveAttribute("data-menger-automatic-probe", "off");
  await expect(scene).toHaveAttribute("data-automatic-probe-state", "off");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt", "landing");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-radius-scale", "1");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt-strength-scale", "1.67");
  await expect(scene).toHaveAttribute("data-logo-elevation-degrees", "0");
  await expect(scene).toHaveAttribute("data-logo-rotation-degrees", "0");

  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The landing Menger scene must have a bounding box.");
  }
  await page.mouse.move(sceneBox.x + sceneBox.width / 2, sceneBox.y + sceneBox.height / 2);
  await expect
    .poll(() => readNumberAttribute(scene, "data-hover-maximum-openness"))
    .toBeGreaterThan(0);
  await expect(scene).toHaveAttribute("data-hover-settled", "true");
  await waitForPaint(page);
  await expect(hero).toHaveScreenshot("landing-preview-hero-menger.png", SCREENSHOT_OPTIONS);

  await dragSceneByPixels(page, scene, { x: 2, y: 4 });
  await expect(scene).toHaveAttribute("data-logo-elevation-degrees", "0");
  await expect(scene).toHaveAttribute("data-logo-rotation-degrees", "0");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        elevation: url.searchParams.get("elev"),
        rotation: url.searchParams.get("rot"),
      };
    })
    .toEqual({ elevation: null, rotation: null });

  await dragSceneByPixels(page, scene, {
    x: STATIC_LOGO_ROTATION_DEGREES / DRAG_ROTATION_DEGREES_PER_PIXEL,
    y: STATIC_LOGO_ELEVATION_DEGREES / DRAG_ELEVATION_DEGREES_PER_PIXEL,
  });
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        elevation: url.searchParams.get("elev"),
        rotation: url.searchParams.get("rot"),
      };
    })
    .toEqual({ elevation: "35.3", rotation: "45" });

  await dragSceneByPixels(page, scene, { x: 2, y: 4 });
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        elevation: url.searchParams.get("elev"),
        rotation: url.searchParams.get("rot"),
      };
    })
    .toEqual({ elevation: "35.3", rotation: "45" });

  await page
    .locator('[data-scroll-restoration-id="workspace-layout-v2-main"]')
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  await expect(hero).not.toBeInViewport();
  await expect(scene).toHaveCount(0);
});

test.describe("public landing automatic probe on a wide touch-first device", () => {
  test.use({
    deviceScaleFactor: 1,
    hasTouch: true,
    viewport: { height: 1000, width: 1440 },
  });

  test("reveals the fractal at a wide viewport @logo-research", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect
      .poll(() =>
        page.evaluate(() => ({
          isCoarsePointer: window.matchMedia("(hover: none) and (pointer: coarse)").matches,
          viewportWidth: window.innerWidth,
        })),
      )
      .toEqual({ isCoarsePointer: true, viewportWidth: 1440 });

    const hero = page.getByTestId("landing-preview-hero-menger");
    const scene = hero.getByTestId("logo-menger-hover-scene");
    await expect(hero).toBeVisible({ timeout: 30_000 });
    await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expect(scene).toHaveAttribute("data-menger-automatic-probe", "play");
    await expect(scene).toHaveAttribute("data-automatic-probe-state", "playing");
    await expect(scene).toHaveAttribute("data-menger-pointer-tilt", "off");

    const probeProgress = await readNumberAttribute(scene, "data-automatic-probe-progress");
    await expect
      .poll(() => readNumberAttribute(scene, "data-automatic-probe-progress"))
      .not.toBe(probeProgress);
  });

  test("renders the reduced-motion automatic reveal @logo-research", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const hero = page.getByTestId("landing-preview-hero-menger");
    const scene = hero.getByTestId("logo-menger-hover-scene");
    await expect(hero).toBeVisible({ timeout: 30_000 });
    await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expect(scene).toHaveAttribute("data-menger-automatic-probe", "play");
    await expect(scene).toHaveAttribute("data-automatic-probe-state", "reduced-motion");
    await expect(scene).toHaveAttribute("data-menger-pointer-tilt", "off");
    await expect(scene).toHaveAttribute("data-hover-settled", "true");
    await waitForPaint(page);
    await expect(hero).toHaveScreenshot(
      "landing-preview-hero-menger-wide-touch.png",
      SCREENSHOT_OPTIONS,
    );
  });
});

test("public landing keeps the prehydration and WebGL logo bounds equal", async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const hydratedHero = page.getByTestId("landing-preview-hero-menger");
  await expect(hydratedHero.getByTestId("logo-menger-hover-scene").locator("canvas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(hydratedHero).toHaveAttribute("data-state", "ready");
  await expect(hydratedHero).toHaveCSS("cursor", "grab");
  await waitForPaint(page);

  const prehydrationContext = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  });
  const prehydratedPage = await prehydrationContext.newPage();
  try {
    await prehydratedPage.route("**/*", async (route) => {
      if (route.request().resourceType() === "script") {
        await route.abort();
        return;
      }

      await route.continue();
    });
    await prehydratedPage.goto(page.url(), { waitUntil: "domcontentloaded" });

    const prehydratedHero = prehydratedPage.getByTestId("landing-preview-hero-menger");
    await expect(prehydratedHero).toBeVisible();
    await expect(prehydratedHero).toHaveAttribute("data-state", "loading");
    await expect(prehydratedHero).toHaveCSS("cursor", "grab");
    await expect(prehydratedHero.getByTestId("landing-preview-hero-menger-fallback")).toHaveCSS(
      "opacity",
      "1",
    );
    await waitForPaint(prehydratedPage);

    const prehydratedBox = await prehydratedHero.boundingBox();
    const hydratedBox = await hydratedHero.boundingBox();
    if (!prehydratedBox || !hydratedBox) {
      throw new Error("The prehydration and hydrated Menger heroes must have bounding boxes.");
    }
    expect(prehydratedBox).toEqual(hydratedBox);

    const prehydratedScreenshot = await prehydratedHero.screenshot({
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
    const hydratedScreenshot = await hydratedHero.screenshot({
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
    const prehydratedBounds = measureScreenshotForegroundBounds(prehydratedScreenshot);
    const hydratedBounds = measureScreenshotForegroundBounds(hydratedScreenshot);
    if (!prehydratedBounds || !hydratedBounds) {
      throw new Error("The prehydration and hydrated screenshots must contain the Menger logo.");
    }

    for (const edge of ["minX", "minY", "maxX", "maxY"] as const) {
      expect(
        Math.abs(prehydratedBounds[edge] - hydratedBounds[edge]),
        `${edge} must not move during hydration`,
      ).toBeLessThanOrEqual(2);
    }
  } finally {
    await prehydrationContext.close();
  }
});

test("public landing shows its query-aware fallback when the scene re-enters @logo-research", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?elev=20&top=red-400", {
    waitUntil: "domcontentloaded",
  });

  const hero = page.getByTestId("landing-preview-hero-menger");
  const fallback = page.getByTestId("landing-preview-hero-menger-fallback");
  const scene = hero.getByTestId("logo-menger-hover-scene");
  const scrollport = page.locator('[data-scroll-restoration-id="workspace-layout-v2-main"]');
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(hero).toHaveAttribute("data-state", "ready");
  await expect(fallback).toHaveCSS("opacity", "0");

  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(hero).not.toBeInViewport();
  await expect(scene).toHaveCount(0);
  await expect(fallback).toHaveClass(/opacity-100/);
  await expect(fallback).toHaveAttribute("src", /#.*:20:0$/);

  const reentryState = await scrollport.evaluate((element) => {
    element.scrollTop = 0;
    const heroElement = element.querySelector('[data-testid="landing-preview-hero-menger"]');
    const fallbackElement = element.querySelector(
      '[data-testid="landing-preview-hero-menger-fallback"]',
    );
    if (!heroElement || !fallbackElement) {
      throw new Error("The landing Menger hero and fallback must exist during re-entry.");
    }

    const heroBounds = heroElement.getBoundingClientRect();
    const scrollportBounds = element.getBoundingClientRect();
    return {
      fallbackTargetsVisible: fallbackElement.classList.contains("opacity-100"),
      isInScrollport:
        heroBounds.bottom > scrollportBounds.top && heroBounds.top < scrollportBounds.bottom,
    };
  });
  expect(reentryState).toEqual({ fallbackTargetsVisible: true, isInScrollport: true });
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(hero).toHaveAttribute("data-state", "ready");
  await expect(fallback).toHaveCSS("opacity", "0", { timeout: 30_000 });
});
