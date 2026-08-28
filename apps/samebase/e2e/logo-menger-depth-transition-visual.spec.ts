import { expect, test, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";
import { expectLogoMobilePaneEscapeLanes, exposeMobileMainPane } from "./logoMobilePane";

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
  const workspace = page.locator('[data-sidebar-layout-part="root"]');
  const progress = page.getByLabel("Transition progress");

  await expect(controls).toBeVisible();
  const canvas = scene.locator("canvas");
  await expect(canvas).toBeVisible();
  const layoutMetrics = await transitionPage.evaluate((element) => {
    const pageBounds = element.getBoundingClientRect();
    const sceneBounds = element
      .querySelector('[data-testid="logo-menger-depth-transition-scene"]')
      ?.getBoundingClientRect();

    return {
      bottomGap: sceneBounds ? pageBounds.bottom - sceneBounds.bottom : 0,
      pageHeight: element.clientHeight,
      sceneHeight: sceneBounds?.height ?? 0,
      sceneWidth: sceneBounds?.width ?? 0,
      topGap: sceneBounds ? sceneBounds.top - pageBounds.top : 0,
      viewportHeight: window.innerHeight,
    };
  });
  expect(layoutMetrics.pageHeight).toBeLessThanOrEqual(layoutMetrics.viewportHeight);
  expect(Math.abs(layoutMetrics.sceneWidth - layoutMetrics.sceneHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(layoutMetrics.topGap - layoutMetrics.bottomGap)).toBeLessThanOrEqual(1);
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

  await progress.fill("150");
  await expect(progress).toHaveValue("150");
  await expect(transitionPage).toHaveAttribute("data-phase", "transition");
  await waitForPaint(page);
  const firstStaggerFrame = await canvas.screenshot();
  await canvas.evaluate((element) => {
    element.dataset.mengerTransitionContext = "original";
  });
  await page.getByLabel("Stagger groups").fill("12");
  await expect(canvas).toHaveAttribute("data-menger-transition-context", "original");
  await waitForPaint(page);
  const secondStaggerFrame = await canvas.screenshot();
  expect(secondStaggerFrame.equals(firstStaggerFrame)).toBe(false);

  await expect(workspace).toHaveScreenshot(
    "logo-menger-depth-transition-depth-two-transition.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      scale: "css",
      timeout: 15_000,
    },
  );

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
    await exposeMobileMainPane(page);
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
    await expectLogoMobilePaneEscapeLanes(page, transitionPage, scene);

    await expect(page).toHaveScreenshot("logo-menger-depth-transition-phone.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      scale: "css",
      timeout: 15_000,
    });
  });
});
