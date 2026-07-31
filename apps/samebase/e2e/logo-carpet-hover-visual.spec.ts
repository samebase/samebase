import { expect, test, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";
import { expectLogoMobilePaneEscapeLanes, exposeMobileMainPane } from "./logoMobilePane";

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
  const layoutMetrics = await carpetPage.evaluate((element) => {
    const pageBounds = element.getBoundingClientRect();
    const sceneBounds = element
      .querySelector('[data-testid="logo-carpet-hover-scene"]')
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
    await exposeMobileMainPane(page);
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
    await expectLogoMobilePaneEscapeLanes(page, carpetPage, scene);
    await waitForPaint(page);

    await expect(page).toHaveScreenshot("logo-carpet-hover-phone.png", SCREENSHOT_OPTIONS);
  });
});
