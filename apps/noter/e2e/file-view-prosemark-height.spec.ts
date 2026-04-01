import { expect, test, type Locator, type Page } from "@playwright/test";

type ScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

// Keep the wheel target inside visible prose content instead of drifting toward
// lower overlays in the workspace shell.
const WHEEL_HOVER_Y_CAP_PX = 180;
// Start the mobile fallback probe below sticky header chrome before looking for
// a visible prose line to swipe on.
const SWIPE_FALLBACK_START_OFFSET_PX = 140;
const SWIPE_PROBE_TOP_OFFSET_PX = 40;
// Leave room above bottom gesture areas when choosing touch coordinates.
const SWIPE_VIEWPORT_BOTTOM_MARGIN_PX = 120;
// Step through candidate hit targets in coarse increments until a visible
// `.cm-line` is found.
const SWIPE_PROBE_STEP_PX = 20;
// Move in two equal segments so the gesture matches a natural upward swipe.
const SWIPE_MOVE_SEGMENT_PX = 120;

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
  return surface.locator(
    "xpath=ancestor::div[contains(@class, 'overflow-y-auto')][1]",
  );
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

async function swipeSurface(page: Page, surface: Locator) {
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const viewportHeight = page.viewportSize()?.height ?? 844;
  const startPoint = await page.evaluate(
    ({
      dataTestId,
      fallbackStartOffset,
      probeStep,
      probeTopOffset,
      startX,
      surfaceTop,
      viewportBottomMargin,
      viewportHeight,
    }) => {
      const surface = document.querySelector<HTMLElement>(
        `[data-testid="${dataTestId}"]`,
      );
      if (surface === null) {
        return null;
      }

      const viewportBottomLimit = viewportHeight - viewportBottomMargin;
      let fallbackY = Math.min(
        surfaceTop + fallbackStartOffset,
        viewportBottomLimit,
      );
      let visibleLineY: number | null = null;

      for (
        let y = Math.max(surfaceTop + probeTopOffset, 0);
        y <= viewportBottomLimit;
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
        if (hit.closest(".cm-line") !== null) {
          visibleLineY = y;
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
      startX: bounds.x + bounds.width / 2,
      surfaceTop: bounds.y,
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
  const middleY = startY - SWIPE_MOVE_SEGMENT_PX;
  const endY = startY - SWIPE_MOVE_SEGMENT_PX * 2;
  const session = await page.context().newCDPSession(page);

  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          force: 1,
          id: 1,
          radiusX: 4,
          radiusY: 4,
          x: startX,
          y: startY,
        },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          force: 1,
          id: 1,
          radiusX: 4,
          radiusY: 4,
          x: startX,
          y: middleY,
        },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          force: 1,
          id: 1,
          radiusX: 4,
          radiusY: 4,
          x: startX,
          y: endY,
        },
      ],
    });
  } finally {
    await session
      .send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      })
      .catch(() => undefined);
    await session.detach().catch(() => undefined);
  }
}

async function openFixture(page: Page) {
  await page.goto("/visual-fixture.html?mode=fileview-prosemark-flex-height", {
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
  const { fixture, scrollContainer, surface } = await openFixture(page);
  await expect(fixture).toHaveScreenshot("fileview-prosemark-flex-height.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.05,
  });
  const initialMetrics = await readScrollMetrics(scrollContainer);
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

  test("ProseMark keeps the real file-view workspace body scrollable on mobile", async ({
    page,
  }) => {
    const { scrollContainer, surface } = await openFixture(page);
    const initialMetrics = await readScrollMetrics(scrollContainer);
    await swipeSurface(page, surface);

    await expect
      .poll(async () => {
        return (await readScrollMetrics(scrollContainer)).scrollTop;
      })
      .toBeGreaterThan(initialMetrics.scrollTop + 24);
  });
});
