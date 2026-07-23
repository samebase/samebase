import { expect, test, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test.setTimeout(120_000);

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

test("Menger sponge moves from depth one through depth two to depth three", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/logo/transition/menger");

  const transitionPage = page.getByTestId("logo-menger-depth-transition-page");
  const controls = page.getByTestId("logo-menger-depth-transition-controls");
  const scene = page.getByTestId("logo-menger-depth-transition-scene");
  const workspace = page.getByTestId("app-workspace");
  const progress = page.getByLabel("Transition progress");

  await expect(controls).toBeVisible();
  await expect(scene.locator("canvas")).toBeVisible();
  const layoutMetrics = await transitionPage.evaluate((element) => ({
    pageHeight: element.clientHeight,
    sceneHeight:
      element.querySelector('[data-testid="logo-menger-depth-transition-scene"]')?.clientHeight ??
      0,
    viewportHeight: window.innerHeight,
  }));
  expect(layoutMetrics.pageHeight).toBeLessThanOrEqual(layoutMetrics.viewportHeight);
  expect(layoutMetrics.sceneHeight).toBe(layoutMetrics.pageHeight);
  await expect(transitionPage).toHaveAttribute("data-phase", "depth-3", { timeout: 10_000 });

  await page.getByRole("button", { name: "Replay transition" }).click();
  await expect(transitionPage).toHaveAttribute("data-phase", "transition");
  await expect(transitionPage).toHaveAttribute("data-phase", "depth-3", { timeout: 10_000 });

  await progress.fill("0");
  await expect(progress).toHaveValue("0");
  await expect(transitionPage).toHaveAttribute("data-phase", "depth-1");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-menger-depth-transition-depth-one.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
    timeout: 15_000,
  });

  await progress.fill("500");
  await expect(progress).toHaveValue("500");
  await expect(transitionPage).toHaveAttribute("data-phase", "depth-2");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-menger-depth-transition-depth-two.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
    timeout: 15_000,
  });

  await progress.fill("700");
  await expect(progress).toHaveValue("700");
  await expect(transitionPage).toHaveAttribute("data-phase", "transition");
  await waitForPaint(page);

  await expect(workspace).toHaveScreenshot("logo-menger-depth-transition-workspace-midpoint.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
    timeout: 15_000,
  });

  await progress.fill("1000");
  await expect(progress).toHaveValue("1000");
  await expect(transitionPage).toHaveAttribute("data-phase", "depth-3");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-menger-depth-transition-depth-three.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
    timeout: 15_000,
  });
});

test.describe("Menger sponge on a high-density phone", () => {
  test.use({
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("keeps the WebGL canvas inside the visible main pane", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(page, "/logo/transition/menger");

    const transitionPage = page.getByTestId("logo-menger-depth-transition-page");
    const scene = page.getByTestId("logo-menger-depth-transition-scene");
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
    const layoutMetrics = await transitionPage.evaluate((element) => {
      const sceneElement = element.querySelector(
        '[data-testid="logo-menger-depth-transition-scene"]',
      );
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

    await expect(page).toHaveScreenshot("logo-menger-depth-transition-phone.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      scale: "css",
      timeout: 15_000,
    });
  });
});
