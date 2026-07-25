import { expect, test, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

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

  await expect(carpetPage).toHaveAttribute("data-mechanic", "grow");
  await expect(carpetPage).toHaveAttribute("data-falloff", "per-depth");
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

  await expect(scene).toHaveScreenshot("logo-carpet-hover-grow.png", SCREENSHOT_OPTIONS);

  await page.getByRole("button", { exact: true, name: "Slide" }).click();
  await expect(carpetPage).toHaveAttribute("data-mechanic", "slide");
  await page.mouse.move(hoverX, hoverY);
  await expect(scene).toHaveAttribute("data-carpet-settled", "true");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-carpet-hover-slide.png", SCREENSHOT_OPTIONS);

  await page.getByRole("button", { exact: true, name: "Shared" }).click();
  await expect(carpetPage).toHaveAttribute("data-falloff", "shared");
  await page.getByRole("button", { exact: true, name: "Grow" }).click();
  await expect(carpetPage).toHaveAttribute("data-mechanic", "grow");

  // Leaving the carpet heals the surface back to the resting depth-1 state.
  await page.mouse.move(sceneBox.x + sceneBox.width / 2, sceneBox.y - 10);
  await expect(scene).toHaveAttribute("data-carpet-settled", "true");
  await waitForPaint(page);
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
    await expect(workspaceLayout).toHaveAttribute("data-mobile-pane", "main");
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
