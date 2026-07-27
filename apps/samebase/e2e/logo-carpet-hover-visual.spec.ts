import { expect, test, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

test.setTimeout(120_000);

const SCREENSHOT_OPTIONS = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.01,
  scale: "css",
  timeout: 15_000,
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

test("carpet holes reveal around the pointer for both mechanics", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Reduced motion makes hole openness snap straight to its pointer-derived
  // target, so every screenshot below is deterministic.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/logo/hover/carpet");

  const carpetPage = page.getByTestId("logo-carpet-hover-page");
  const controls = page.getByTestId("logo-carpet-hover-controls");
  const scene = page.getByTestId("logo-carpet-hover-scene");

  await expect(controls).toBeVisible();
  await expect(scene.locator("canvas")).toBeVisible();
  const layoutMetrics = await carpetPage.evaluate((element) => ({
    pageHeight: element.clientHeight,
    sceneHeight:
      element.querySelector('[data-testid="logo-carpet-hover-scene"]')?.clientHeight ?? 0,
    viewportHeight: window.innerHeight,
  }));
  expect(layoutMetrics.pageHeight).toBeLessThanOrEqual(layoutMetrics.viewportHeight);
  expect(layoutMetrics.sceneHeight).toBe(layoutMetrics.pageHeight);

  await expect(carpetPage).toHaveAttribute("data-mechanic", "slide");
  await expect(carpetPage).toHaveAttribute("data-max-depth", "5");
  await expect(scene).toHaveAttribute("data-carpet-settled", "true");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-carpet-hover-resting.png", SCREENSHOT_OPTIONS);

  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The carpet hover scene must have a bounding box.");
  }

  const hoverX = sceneBox.x + sceneBox.width * 0.35;
  const hoverY = sceneBox.y + sceneBox.height * 0.35;
  await page.mouse.move(hoverX, hoverY);
  await expect(scene).toHaveAttribute("data-carpet-settled", "true");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-carpet-hover-slide.png", SCREENSHOT_OPTIONS);

  await page.getByRole("button", { exact: true, name: "Grow" }).click();
  await expect(carpetPage).toHaveAttribute("data-mechanic", "grow");
  await page.mouse.move(hoverX, hoverY);
  await expect(scene).toHaveAttribute("data-carpet-settled", "true");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-carpet-hover-grow.png", SCREENSHOT_OPTIONS);

  await page.getByRole("button", { exact: true, name: "Slide" }).click();
  await expect(carpetPage).toHaveAttribute("data-mechanic", "slide");

  // The reveal tracks the pointer page-wide, so a mouse parked over the
  // chrome still resolves to a settled openness state.
  await page.mouse.move(sceneBox.x + sceneBox.width / 2, sceneBox.y - 10);
  await expect(scene).toHaveAttribute("data-carpet-settled", "true");
  await waitForPaint(page);
});

test("typed radius values survive into the slider's own value", async ({ page }) => {
  await page.goto("/logo/hover/carpet?radius=0.055", { waitUntil: "domcontentloaded" });

  // The slider uses step="any" so a URL-typed radius the 0.01 grid cannot
  // represent stays exact in the control and its accessible value.
  await expect(page.getByTestId("logo-carpet-hover-page")).toHaveAttribute(
    "data-reveal-radius",
    "0.055",
  );
  await expect(page.getByRole("slider", { name: "Reveal radius" })).toHaveValue("0.055");
});

test("landing hero carpet fallback matches the settled canvas", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/landing-preview", { waitUntil: "domcontentloaded" });

  const scene = page
    .getByTestId("landing-preview-hero-carpet")
    .getByTestId("logo-carpet-hover-scene");
  await expect(scene).toHaveAttribute("data-carpet-ready", "true");
  const canvasScreenshot = await takeStableScreenshot(scene);

  // Force the pre-canvas presentation: the fallback SVG opaque and the canvas
  // hidden, exactly what paints between the first React commit and the first
  // canvas frame. The layers must be pixel-aligned so the handoff never jumps.
  await scene.evaluate((element) => {
    const fallback = element.querySelector('[data-testid="logo-carpet-hover-fallback"]');
    const canvas = element.querySelector("canvas");
    if (!(fallback instanceof SVGElement) || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Expected the carpet fallback and canvas layers.");
    }

    fallback.style.opacity = "1";
    canvas.style.visibility = "hidden";
  });
  const fallbackScreenshot = await takeStableScreenshot(scene);

  await expectScreenshotsToMatch({
    actual: canvasScreenshot,
    artifactPrefix: "logo-carpet-hover-fallback-seam",
    expected: fallbackScreenshot,
    maxDiffPixelRatio: 0.015,
    testInfo,
  });
});

test.describe("carpet hover on a high-density phone", () => {
  test.use({
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("keeps the carpet canvas inside the visible main pane", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(page, "/logo/hover/carpet");

    const carpetPage = page.getByTestId("logo-carpet-hover-page");
    const scene = page.getByTestId("logo-carpet-hover-scene");
    const canvas = scene.locator("canvas");
    const workspaceLayout = page.locator("[data-workspace-layout-v2]");

    // The carousel scroll can race pane detection while the page is still
    // settling under parallel-suite load, so retry the scroll until the
    // layout reports the main pane.
    await expect(async () => {
      await page.getByTestId("workspace-layout-v2-pane-main").evaluate((carousel) => {
        const mainPane = carousel.querySelector("[data-workspace-layout-v2-mobile-main-pane]");
        if (!(mainPane instanceof HTMLElement)) {
          throw new Error("Expected the mobile main pane.");
        }

        carousel.style.scrollSnapType = "none";
        carousel.scrollLeft =
          mainPane.offsetLeft - Number.parseFloat(window.getComputedStyle(carousel).paddingLeft);
        carousel.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await expect(workspaceLayout).toHaveAttribute("data-mobile-pane", "main", {
        timeout: 1_000,
      });
    }).toPass({ timeout: 20_000 });
    await expect(canvas).toBeVisible();
    await expect(scene).toHaveAttribute("data-carpet-settled", "true");
    const layoutMetrics = await carpetPage.evaluate((element) => {
      const sceneElement = element.querySelector('[data-testid="logo-carpet-hover-scene"]');
      const canvasElement = sceneElement?.querySelector("canvas");

      return {
        canvasHeight: canvasElement?.clientHeight ?? 0,
        canvasWidth: canvasElement?.clientWidth ?? 0,
        documentWidth: document.documentElement.scrollWidth,
        pageHeight: element.clientHeight,
        pageWidth: element.clientWidth,
        sceneHeight: sceneElement?.clientHeight ?? 0,
        sceneWidth: sceneElement?.clientWidth ?? 0,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layoutMetrics.documentWidth).toBe(layoutMetrics.viewportWidth);
    expect(layoutMetrics.pageHeight).toBeLessThanOrEqual(layoutMetrics.viewportHeight);
    expect(layoutMetrics.canvasHeight).toBe(layoutMetrics.sceneHeight);
    expect(layoutMetrics.canvasWidth).toBe(layoutMetrics.sceneWidth);
    expect(layoutMetrics.sceneHeight).toBe(layoutMetrics.pageHeight);
    expect(layoutMetrics.sceneWidth).toBe(layoutMetrics.pageWidth);
    await waitForPaint(page);

    await expect(page).toHaveScreenshot("logo-carpet-hover-phone.png", SCREENSHOT_OPTIONS);
  });
});
