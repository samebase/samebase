import { expect, test, type Locator, type Page } from "@playwright/test";
import { dispatchHumanTouchSwipe } from "./touchGestures";
import { seedVisualFixtureWorkspaceSidebarState } from "./visualFixtureTest";

/** This fixture was designed with both sidebars open, so it does not follow the first-visit default. */
test.beforeEach(async ({ page }) => {
  await seedVisualFixtureWorkspaceSidebarState(page, {
    leftDesktopOpen: true,
    rightDesktopOpen: true,
  });
});

type ScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

function workspaceShell(page: Page) {
  return page.locator("[data-mobile-pane]").first();
}

async function scrollWorkspaceFixtureToMainPane(page: Page) {
  await page.evaluate(() => {
    const frame = document.querySelector("[data-mobile-pane]");
    if (!(frame instanceof HTMLElement)) {
      throw new Error("Expected mobile workspace frame.");
    }

    const carousel = frame.querySelector('[data-sidebar-layout-part="carousel"]');
    if (!(carousel instanceof HTMLElement)) {
      throw new Error("Expected mobile workspace carousel.");
    }

    carousel.scrollLeft = carousel.clientWidth - 48;
    carousel.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

// Keep the wheel target inside visible prose content instead of drifting toward
// lower overlays in the workspace shell.
const WHEEL_HOVER_Y_CAP_PX = 180;
// Start the mobile fallback probe below sticky header chrome before looking for
// a visible prose line to swipe on.
const SWIPE_FALLBACK_START_OFFSET_PX = 140;
const SWIPE_PROBE_TOP_OFFSET_PX = 40;
const SWIPE_SCROLL_CONTAINER_BOTTOM_INSET_PX = 24;
// Leave room above bottom gesture areas when choosing touch coordinates.
const SWIPE_VIEWPORT_BOTTOM_MARGIN_PX = 120;
// Step through candidate hit targets in coarse increments until a visible
// `.cm-line` is found.
const SWIPE_PROBE_STEP_PX = 20;
// Move far enough to require real workspace scrolling without jumping past the
// first visible prose block in one oversized fling.
const SWIPE_SCROLL_DISTANCE_PX = 240;
const SWIPE_SCROLL_SPEED_PX_PER_SECOND = 800;

async function readScrollMetrics(locator: Locator): Promise<ScrollMetrics> {
  return locator.evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Expected an HTML element scroll container.");
    }
    return {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    };
  });
}

function workspaceScrollContainer(surface: Locator) {
  return surface.locator('xpath=ancestor::*[@data-sidebar-layout-part="pane-scrollport"][1]');
}

async function wheelSurface(page: Page, surface: Locator) {
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + Math.min(bounds.height / 2, WHEEL_HOVER_Y_CAP_PX),
  );
  await page.mouse.wheel(0, 1200);
  await page.mouse.wheel(0, 1200);
}

async function swipeSurface(page: Page, scrollContainer: Locator, surface: Locator) {
  const [scrollBounds, surfaceBounds] = await Promise.all([
    scrollContainer.boundingBox(),
    surface.boundingBox(),
  ]);
  expect(scrollBounds).not.toBeNull();
  expect(surfaceBounds).not.toBeNull();
  if (scrollBounds === null || surfaceBounds === null) {
    return;
  }

  const viewportHeight = page.viewportSize()?.height ?? 844;
  const startPoint = await page.evaluate(
    ({
      dataTestId,
      fallbackStartOffset,
      probeStep,
      probeTopOffset,
      scrollContainerBottom,
      scrollContainerTop,
      startX,
      surfaceTop,
      viewportBottomMargin,
      viewportHeight,
    }) => {
      const surface = document.querySelector<HTMLElement>(`[data-testid="${dataTestId}"]`);
      if (surface === null) {
        return null;
      }

      const viewportBottomLimit = viewportHeight - viewportBottomMargin;
      const probeBottom = Math.min(viewportBottomLimit, scrollContainerBottom);
      let fallbackY = Math.min(
        Math.max(scrollContainerTop + fallbackStartOffset, surfaceTop),
        probeBottom,
      );
      let visibleLineY: number | null = null;

      for (
        let y = Math.max(scrollContainerTop + probeTopOffset, surfaceTop + probeTopOffset, 0);
        y <= probeBottom;
        y += probeStep
      ) {
        const hit = document.elementFromPoint(startX, y);
        if (!(hit instanceof HTMLElement)) {
          continue;
        }
        if (!surface.contains(hit)) {
          continue;
        }

        fallbackY = y;
        if (visibleLineY === null && hit.closest(".cm-line") !== null) {
          visibleLineY = y;
          break;
        }
      }

      return {
        startX,
        startY: visibleLineY ?? fallbackY,
      };
    },
    {
      dataTestId: "fileview-prosemark-height-surface",
      fallbackStartOffset: SWIPE_FALLBACK_START_OFFSET_PX,
      probeStep: SWIPE_PROBE_STEP_PX,
      probeTopOffset: SWIPE_PROBE_TOP_OFFSET_PX,
      scrollContainerBottom:
        scrollBounds.y + scrollBounds.height - SWIPE_SCROLL_CONTAINER_BOTTOM_INSET_PX,
      scrollContainerTop: scrollBounds.y,
      startX: Math.min(
        Math.max(surfaceBounds.x + surfaceBounds.width / 2, scrollBounds.x + 24),
        scrollBounds.x + scrollBounds.width - 24,
      ),
      surfaceTop: surfaceBounds.y,
      viewportBottomMargin: SWIPE_VIEWPORT_BOTTOM_MARGIN_PX,
      viewportHeight,
    },
  );
  expect(startPoint).not.toBeNull();
  if (startPoint === null) {
    return;
  }

  const startX = startPoint.startX;
  const startY = startPoint.startY;
  const session = await page.context().newCDPSession(page);

  try {
    // Headless Chromium does not reliably turn a raw CDP touch sequence into
    // native scrolling, even when the hit target is a visible prose line with
    // `touch-action: pan-y`. Use the browser's synthesized touch-scroll path
    // at that exact coordinate so this still exercises the shipped surface.
    await session.send("Input.synthesizeScrollGesture", {
      gestureSourceType: "touch",
      repeatCount: 1,
      repeatDelayMs: 0,
      speed: SWIPE_SCROLL_SPEED_PX_PER_SECOND,
      x: Math.round(startX),
      xDistance: 0,
      y: Math.round(startY),
      yDistance: -SWIPE_SCROLL_DISTANCE_PX,
    });
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function swipeSurfaceHorizontallyToLeftPane(page: Page, surface: Locator) {
  const surfaceBounds = await surface.boundingBox();
  expect(surfaceBounds).not.toBeNull();
  if (surfaceBounds === null) {
    return;
  }

  const startPoint = await surface.evaluate((surfaceNode) => {
    if (!(surfaceNode instanceof HTMLElement)) {
      return null;
    }

    const surfaceRect = surfaceNode.getBoundingClientRect();
    const viewportBottomLimit = window.innerHeight - 96;
    const visibleBottom = Math.min(surfaceRect.bottom - 24, viewportBottomLimit);

    for (const line of surfaceNode.querySelectorAll<HTMLElement>(".cm-line")) {
      for (const rect of line.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }

        const startY = rect.top + Math.min(rect.height / 2, 12);
        if (startY < surfaceRect.top + 48 || startY > visibleBottom) {
          continue;
        }

        const desiredStartX = rect.left + Math.min(Math.max(rect.width / 3, 24), 80);
        const startX = Math.min(
          Math.max(desiredStartX, surfaceRect.left + 24),
          surfaceRect.right - 96,
        );
        const hit = document.elementFromPoint(startX, startY);
        if (
          hit instanceof HTMLElement &&
          surfaceNode.contains(hit) &&
          hit.closest(".cm-line") !== null
        ) {
          return {
            startX: startX - surfaceRect.left,
            startY: startY - surfaceRect.top,
          };
        }
      }
    }

    return null;
  });
  expect(startPoint).not.toBeNull();
  if (startPoint === null) {
    return;
  }

  await dispatchHumanTouchSwipe(page, surface, {
    startX: startPoint.startX,
    startY: startPoint.startY,
    steps: [
      { delayMs: 16, xOffset: 80, yOffset: 0 },
      { delayMs: 16, xOffset: 160, yOffset: 0 },
      { delayMs: 16, xOffset: 240, yOffset: 0 },
    ],
  });
}

async function openFixture(page: Page) {
  await page.goto("/visual-fixture?mode=fileview-prosemark-flex-height", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-prosemark-height-visual-fixture");
  const surface = page.getByTestId("fileview-prosemark-height-surface");
  const scrollContainer = workspaceScrollContainer(surface);

  await expect(fixture).toBeVisible();
  await expect(surface.locator(".cm-content")).toBeVisible();
  await expect
    .poll(async () => {
      const metrics = await readScrollMetrics(scrollContainer);
      return metrics.scrollHeight > metrics.clientHeight;
    })
    .toBe(true);

  return { fixture, scrollContainer, surface };
}

test("ProseMark keeps the real file-view workspace body scrollable on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { scrollContainer, surface } = await openFixture(page);
  const initialMetrics = await readScrollMetrics(scrollContainer);
  await expect(scrollContainer).toHaveScreenshot("fileview-prosemark-flex-height.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.05,
  });
  await wheelSurface(page, surface);

  await expect
    .poll(async () => {
      return (await readScrollMetrics(scrollContainer)).scrollTop;
    })
    .toBeGreaterThan(initialMetrics.scrollTop + 24);
});

test.describe("mobile prose scroll", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("ProseMark lets mobile carousel swipes start inside visible prose", async ({ page }) => {
    const { surface } = await openFixture(page);
    const shell = workspaceShell(page);

    await scrollWorkspaceFixtureToMainPane(page);
    await expect(shell).toHaveAttribute("data-mobile-pane", "main");
    await swipeSurfaceHorizontallyToLeftPane(page, surface);
    await expect(shell).toHaveAttribute("data-mobile-pane", "left");
  });

  test.skip(
    "ProseMark keeps the real file-view workspace body scrollable on mobile",
    async ({ page }) => {
      const { scrollContainer, surface } = await openFixture(page);
      const initialMetrics = await readScrollMetrics(scrollContainer);
      await swipeSurface(page, scrollContainer, surface);

      await expect
        .poll(async () => {
          return (await readScrollMetrics(scrollContainer)).scrollTop;
        })
        .toBeGreaterThan(initialMetrics.scrollTop + 24);
    },
    "Linux/headless Chromium still misses the intended prose line hit target; see research/2026-04-02-prosemark-mobile-scroll-linux-ci-follow-up.md.",
  );
});
