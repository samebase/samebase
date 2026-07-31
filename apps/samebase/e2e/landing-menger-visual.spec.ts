import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
} from "@samebase/logo-model/identity";
import {
  DRAG_ELEVATION_DEGREES_PER_PIXEL,
  DRAG_ROTATION_DEGREES_PER_PIXEL,
} from "../src/components/logo/logoViewDragConstants";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_MENGER_FALLBACK_TEST_ID,
  PUBLIC_LANDING_MENGER_TEST_ID,
} from "../src/lib/publicLanding";
import { PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE } from "../src/lib/publicLandingLogo";
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

async function installUnavailableCanvasRendering(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line typescript/unbound-method -- The original method receives its canvas with call().
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(this: HTMLCanvasElement, contextId: string, options?: unknown) {
        if (contextId === "webgl" || contextId === "experimental-webgl" || contextId === "webgl2") {
          return null;
        }

        // @ts-expect-error The browser accepts each original context ID with its matching options.
        return originalGetContext.call(this, contextId, options);
      },
    });
  });
}

test("root landing uses the depth-three Menger logo and follows the pointer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const hero = page.getByTestId(PUBLIC_LANDING_MENGER_TEST_ID);
  const fallback = page.getByTestId(PUBLIC_LANDING_MENGER_FALLBACK_TEST_ID);
  const scene = hero.getByTestId("logo-menger-hover-scene");
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(hero).toHaveAttribute("data-state", "ready");
  await expect(fallback).toHaveCSS("opacity", "0");
  await expect(scene).toHaveAttribute("data-menger-maximum-depth", "3");
  await expect(scene).toHaveAttribute("data-menger-pointer-tilt", "landing");
  const landingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await expect(landingCopy).toHaveText("Samebase is near.");
  await expect(landingCopy).toHaveCSS("text-align", "center");

  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The root landing Menger scene must have a bounding box.");
  }
  expect(sceneBox.width).toBe(704);
  expect(sceneBox.height).toBe(704);

  await page.mouse.move(sceneBox.x + sceneBox.width / 2, sceneBox.y + sceneBox.height / 2);
  await expect
    .poll(() => readNumberAttribute(scene, "data-hover-maximum-openness"), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);

  await page.mouse.move(sceneBox.x + sceneBox.width, sceneBox.y + sceneBox.height / 2);
  await expect
    .poll(() => readNumberAttribute(scene, "data-presentation-horizontal-degrees"), {
      timeout: 30_000,
    })
    .not.toBe(0);

  await page.mouse.move(sceneBox.x + sceneBox.width / 2, sceneBox.y + sceneBox.height / 2);
  await expect(scene).toHaveAttribute("data-hover-settled", "true", { timeout: 30_000 });
  await waitForPaint(page);
  await expect(hero).toHaveScreenshot("root-landing-menger.png", SCREENSHOT_OPTIONS);
});

test("root landing keeps its fractal fallback when WebGL is unavailable", async ({ page }) => {
  await installUnavailableCanvasRendering(page);
  await page.goto("/?prod-ui&rot=180", { waitUntil: "domcontentloaded" });

  const hero = page.getByTestId(PUBLIC_LANDING_MENGER_TEST_ID);
  const fallback = page.getByTestId(PUBLIC_LANDING_MENGER_FALLBACK_TEST_ID);
  await expect(hero).toHaveAttribute("data-state", "fallback", { timeout: 30_000 });
  await expect(fallback).toHaveCSS("opacity", "1");
  await expect(hero.getByTestId("logo-menger-hover-scene")).toHaveCount(0);
});

test("landing preview uses the depth-three Menger hover scene", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing-preview", { waitUntil: "domcontentloaded" });

  const hero = page.getByTestId("landing-preview-hero-menger");
  const fallback = page.getByTestId("landing-preview-hero-menger-fallback");
  const scene = hero.getByTestId("logo-menger-hover-scene");
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(hero).toHaveAttribute("data-state", "ready");
  await expect(fallback).toHaveCSS("opacity", "0");
  await expect(scene).toHaveAttribute("data-menger-maximum-depth", "3");
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

  await dragSceneByPixels(page, scene, { x: 5, y: 0 });
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

  await dragSceneByPixels(page, scene, { x: 5, y: 0 });
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

test("landing preview keeps the prehydration and WebGL logo bounds equal", async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing-preview", { waitUntil: "domcontentloaded" });

  const hydratedHero = page.getByTestId("landing-preview-hero-menger");
  await expect(hydratedHero.getByTestId("logo-menger-hover-scene").locator("canvas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(hydratedHero).toHaveAttribute("data-state", "ready");
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

test("landing preview hides a stale custom-query fallback before hydration", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.abort();
      return;
    }

    await route.continue();
  });
  await page.goto("/landing-preview?rot=180&top=red-400", {
    waitUntil: "domcontentloaded",
  });

  const hero = page.getByTestId("landing-preview-hero-menger");
  const fallback = hero.getByTestId("landing-preview-hero-menger-fallback");
  await expect(hero).toBeVisible();
  await expect(fallback).toHaveAttribute(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE, "");
  await expect(fallback).toHaveCSS("opacity", "0");
  await expect(page.locator("html")).toHaveAttribute(
    "data-public-landing-logo-static-fallback-hidden",
    "",
  );
  await expect(page.locator("style#samebase-public-landing-logo-prehydration")).toHaveCount(1);
});

test("landing preview shows its query-aware fallback when the scene re-enters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing-preview?elev=20&top=red-400", {
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

test("landing preview shows its query-aware fallback when WebGL is unavailable", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await installUnavailableCanvasRendering(page);
  await page.goto("/landing-preview?elev=20&top=red-400", {
    waitUntil: "domcontentloaded",
  });

  const hero = page.getByTestId("landing-preview-hero-menger");
  const fallback = page.getByTestId("landing-preview-hero-menger-fallback");
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(hero).toHaveAttribute("data-state", "fallback", { timeout: 30_000 });
  await expect(fallback).toHaveCSS("opacity", "1");
  await expect(fallback).toHaveAttribute("src", /#.*:20:0$/);
  await expect(hero.getByTestId("logo-menger-hover-scene")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-public-landing-logo-static-fallback-hidden",
    "",
  );
  await expect(page.locator("style#samebase-public-landing-logo-prehydration")).toHaveCount(0);
  await page.waitForTimeout(200);
  expect(pageErrors).toEqual([]);
});
