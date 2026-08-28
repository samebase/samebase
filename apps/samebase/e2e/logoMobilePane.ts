import { expect, type Locator, type Page } from "@playwright/test";
import { dispatchHumanTouchSwipe } from "./touchGestures";

export async function exposeMobileMainPane(page: Page): Promise<void> {
  const workspaceLayout = page.locator('[data-workspace-layout-part="viewport"]');

  await expect(async () => {
    await page.locator('[data-workspace-layout-part="carousel"]').evaluate(async (carousel) => {
      const mainPane = carousel.querySelector(
        '[data-workspace-layout-part="pane"][data-pane-side="main"]',
      );
      if (!(mainPane instanceof HTMLElement)) {
        throw new Error("Expected the mobile main pane.");
      }

      const previousScrollBehavior = carousel.style.scrollBehavior;
      const previousScrollSnapType = carousel.style.scrollSnapType;
      carousel.style.scrollBehavior = "auto";
      carousel.style.scrollSnapType = "none";
      carousel.scrollLeft =
        mainPane.offsetLeft - Number.parseFloat(window.getComputedStyle(carousel).paddingLeft);
      carousel.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      carousel.style.scrollBehavior = previousScrollBehavior;
      carousel.style.scrollSnapType = previousScrollSnapType;
    });
    await expect(workspaceLayout).toHaveAttribute("data-mobile-pane", "main", {
      timeout: 1_000,
    });
    const distanceFromMainPane = await page
      .locator('[data-workspace-layout-part="carousel"]')
      .evaluate((carousel) => {
        const mainPane = carousel.querySelector(
          '[data-workspace-layout-part="pane"][data-pane-side="main"]',
        );
        if (!(mainPane instanceof HTMLElement)) {
          throw new Error("Expected the mobile main pane.");
        }

        const expectedScrollLeft =
          mainPane.offsetLeft - Number.parseFloat(window.getComputedStyle(carousel).paddingLeft);
        return Math.abs(carousel.scrollLeft - expectedScrollLeft);
      });
    expect(distanceFromMainPane).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 20_000 });
}

export async function expectLogoMobilePaneEscapeLanes(
  page: Page,
  pageSurface: Locator,
  touchScene: Locator,
): Promise<void> {
  const expectEscapeLanes = async () => {
    const pageBounds = await pageSurface.boundingBox();
    const sceneBounds = await touchScene.boundingBox();
    const viewport = page.viewportSize();
    if (pageBounds === null || sceneBounds === null || viewport === null) {
      throw new Error("Expected the mobile logo page, touch scene, and viewport.");
    }

    const topGap = sceneBounds.y - pageBounds.y;
    const bottomGap = pageBounds.y + pageBounds.height - sceneBounds.y - sceneBounds.height;
    const visibleTopGap = sceneBounds.y;
    const visibleBottomGap = viewport.height - sceneBounds.y - sceneBounds.height;

    expect(Math.abs(sceneBounds.width - sceneBounds.height)).toBeLessThanOrEqual(1);
    expect(sceneBounds.width).toBeGreaterThanOrEqual(192);
    expect(topGap).toBeGreaterThan(80);
    expect(bottomGap).toBeGreaterThan(80);
    expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(1);
    expect(visibleTopGap).toBeGreaterThan(80);
    expect(visibleBottomGap).toBeGreaterThan(80);

    return { bottomGap, pageBounds, topGap };
  };

  const { bottomGap, pageBounds, topGap } = await expectEscapeLanes();

  await dispatchHumanTouchSwipe(page, pageSurface, {
    startX: 24,
    startY: topGap / 2,
    steps: [
      { delayMs: 24, xOffset: 120, yOffset: 0 },
      { delayMs: 24, xOffset: 240, yOffset: 0 },
      { delayMs: 24, xOffset: 360, yOffset: 0 },
    ],
  });
  await expect(page.locator('[data-workspace-layout-part="viewport"]')).toHaveAttribute(
    "data-mobile-pane",
    "left",
    { timeout: 15_000 },
  );

  await exposeMobileMainPane(page);
  await dispatchHumanTouchSwipe(page, pageSurface, {
    startX: pageBounds.width - 24,
    startY: pageBounds.height - bottomGap / 2,
    steps: [
      { delayMs: 24, xOffset: -120, yOffset: 0 },
      { delayMs: 24, xOffset: -240, yOffset: 0 },
      { delayMs: 24, xOffset: -360, yOffset: 0 },
    ],
  });
  await expect(page.locator('[data-workspace-layout-part="viewport"]')).toHaveAttribute(
    "data-mobile-pane",
    "right",
    { timeout: 15_000 },
  );

  await exposeMobileMainPane(page);
  await expectEscapeLanes();
}
