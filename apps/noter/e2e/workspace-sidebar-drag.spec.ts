import { devices, expect, test, type Page } from "@playwright/test";

const { defaultBrowserType: _pixel7BrowserType, ...pixel7Device } =
  devices["Pixel 7"];

test.use({
  ...pixel7Device,
});

async function gotoFileViewFixture(
  page: Page,
  options?: { swipeDebug?: boolean },
) {
  const debugQuery = options?.swipeDebug ? "&swipe-debug" : "";
  await page.goto(
    `/visual-fixture.html?mode=fileview-layout-persistence${debugQuery}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");
}

async function gotoVisualFixtureDirectory(
  page: Page,
  options?: { swipeDebug?: boolean },
) {
  const debugQuery = options?.swipeDebug ? "?swipe-debug" : "";
  await page.goto(`/visual-fixture.html${debugQuery}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function dispatchViewportTouchSwipe(
  page: Page,
  args: {
    startX: number;
    startY: number;
    steps: ReadonlyArray<{
      delayMs: number;
      xOffset: number;
      yOffset: number;
    }>;
  },
) {
  const session = await page.context().newCDPSession(page);
  const gestureStartTimeMs = Date.now();
  let elapsedMs = 0;
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: args.startX,
    y: args.startY,
  };

  await session.send("Input.dispatchTouchEvent", {
    timestamp: gestureStartTimeMs / 1000,
    type: "touchStart",
    touchPoints: [touchPoint],
  });

  for (const step of args.steps) {
    await page.waitForTimeout(step.delayMs);
    elapsedMs += step.delayMs;
    await session.send("Input.dispatchTouchEvent", {
      timestamp: (gestureStartTimeMs + elapsedMs) / 1000,
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          x: args.startX + step.xOffset,
          y: args.startY + step.yOffset,
        },
      ],
    });
  }

  await session.send("Input.dispatchTouchEvent", {
    timestamp: (gestureStartTimeMs + elapsedMs + 1) / 1000,
    type: "touchEnd",
    touchPoints: [],
  });
}

async function dispatchHumanTouchSwipe(
  page: Page,
  args: {
    startX: number;
    startY: number;
    steps: ReadonlyArray<{
      delayMs: number;
      xOffset: number;
      yOffset: number;
    }>;
  },
) {
  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const session = await page.context().newCDPSession(page);
  const gestureStartTimeMs = Date.now();
  let elapsedMs = 0;
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: bounds.x + args.startX,
    y: bounds.y + args.startY,
  };

  await session.send("Input.dispatchTouchEvent", {
    timestamp: gestureStartTimeMs / 1000,
    type: "touchStart",
    touchPoints: [touchPoint],
  });

  for (const step of args.steps) {
    const rawX = bounds.x + args.startX + step.xOffset;
    const rawY = bounds.y + args.startY + step.yOffset;
    const clampedX = Math.min(
      Math.max(rawX, bounds.x),
      bounds.x + bounds.width,
    );
    const clampedY = Math.min(
      Math.max(rawY, bounds.y),
      bounds.y + bounds.height,
    );
    const reachedBounds = clampedX !== rawX || clampedY !== rawY;

    await page.waitForTimeout(step.delayMs);
    elapsedMs += step.delayMs;
    await session.send("Input.dispatchTouchEvent", {
      timestamp: (gestureStartTimeMs + elapsedMs) / 1000,
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          x: clampedX,
          y: clampedY,
        },
      ],
    });

    if (reachedBounds) {
      break;
    }
  }

  await session.send("Input.dispatchTouchEvent", {
    timestamp: (gestureStartTimeMs + elapsedMs + 1) / 1000,
    type: "touchEnd",
    touchPoints: [],
  });
}

async function getBox(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error(`Expected ${testId} to have a bounding box.`);
  }

  return box;
}

/**
 * Use one realistic touch sequence to fling from the open left sidebar toward
 * the right sidebar. Under the Chromium mobile device descriptor we need a
 * more decisive sweep than the old hand-rolled mobile flags, so this drag
 * starts deeper in the visible pane and travels nearly the full viewport over
 * 180ms, which is still a strong but humanly plausible flick.
 */
async function swipeFromLeftSidebarToRightSidebar(page: Page) {
  await dispatchHumanTouchSwipe(page, {
    startX: 320,
    startY: 220,
    steps: [
      { delayMs: 25, xOffset: -72, yOffset: 2 },
      { delayMs: 30, xOffset: -208, yOffset: 4 },
      { delayMs: 30, xOffset: -312, yOffset: 5 },
      { delayMs: 25, xOffset: -352, yOffset: 6 },
    ],
  });
}

/**
 * Use a shorter, lighter swipe from the main pane to the left sidebar. This is
 * about 44% of the viewport over 240ms, so it should be easier than the direct
 * left-to-right cross-swipe above.
 */
async function swipeFromMainToLeftSidebar(page: Page) {
  await dispatchHumanTouchSwipe(page, {
    startX: 150,
    startY: 220,
    steps: [
      { delayMs: 50, xOffset: 28, yOffset: 2 },
      { delayMs: 60, xOffset: 74, yOffset: 4 },
      { delayMs: 60, xOffset: 126, yOffset: 5 },
      { delayMs: 70, xOffset: 174, yOffset: 6 },
    ],
  });
}

test("fileview mobile can open the left sidebar from main with a lighter human swipe", async ({
  page,
}) => {
  await gotoFileViewFixture(page, { swipeDebug: true });

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
  await expect(fixture).toHaveAttribute("data-mobile-pane", "main");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("state: armed, waiting for swipe");

  await swipeFromMainToLeftSidebar(page);

  await expect(fixture).toHaveAttribute("data-mobile-pane", "left");
  await expect(overlay).toContainText("duration:");
});

test("fileview mobile swipe debug overlay is visibly armed before any gesture", async ({
  page,
}) => {
  await gotoFileViewFixture(page, { swipeDebug: true });

  const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("debug: on");
  await expect(overlay).toContainText("layout: mobile");
  await expect(overlay).toContainText("state: armed, waiting for swipe");
});

test("fileview mobile can reach the right sidebar from the open left sidebar in one human swipe", async ({
  page,
}) => {
  await gotoFileViewFixture(page, { swipeDebug: true });

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
  await page
    .getByRole("button", { name: "Toggle Left Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeLessThanOrEqual(1);
  await expect(fixture).toHaveAttribute("data-mobile-pane", "left");
  await expect(overlay).toBeVisible();

  await swipeFromLeftSidebarToRightSidebar(page);

  await expect(fixture).toHaveAttribute("data-mobile-pane", "right");
  await expect(overlay).toContainText("duration:");
});

test("fileview mobile right sidebar handle resizes the pane and keeps it across reopen", async ({
  page,
}) => {
  await gotoFileViewFixture(page);

  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");

  const handle = page.getByTestId("workspace-sidebar-right-resize-handle");
  await expect(handle).toBeVisible();
  const initialWidthPx = (
    await getBox(page, "fileview-layout-right-sidebar-body")
  ).width;

  await handle.focus();
  await expect(handle).toBeFocused();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect
    .poll(
      async () =>
        (await getBox(page, "fileview-layout-right-sidebar-body")).width,
    )
    .toBeGreaterThan(initialWidthPx + 40);

  const resizedWidthPx = (
    await getBox(page, "fileview-layout-right-sidebar-body")
  ).width;
  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
  await expect
    .poll(
      async () =>
        (await getBox(page, "fileview-layout-right-sidebar-body")).width,
    )
    .toBeGreaterThanOrEqual(resizedWidthPx - 1);
});

test("fileview mobile swipe debug overlay captures the cross-sidebar path and release metrics", async ({
  page,
}) => {
  await gotoFileViewFixture(page, { swipeDebug: true });

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  await page
    .getByRole("button", { name: "Toggle Left Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeLessThanOrEqual(1);
  await expect(fixture).toHaveAttribute("data-mobile-pane", "left");

  await swipeFromLeftSidebarToRightSidebar(page);

  await expect(fixture).toHaveAttribute("data-mobile-pane", "right");

  const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-debug-active", "false");
  await expect(overlay).toContainText("release vx:");
  await expect(overlay).toContainText("peak ax:");
  expect(await overlay.locator("svg circle").count()).toBeGreaterThan(5);
});

test("global swipe debug overlay stops the trace as soon as touch leaves the viewport", async ({
  page,
}) => {
  await gotoVisualFixtureDirectory(page, { swipeDebug: true });

  const overlay = page.getByTestId("global-gesture-debug-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("scope: viewport trace");

  await dispatchViewportTouchSwipe(page, {
    startX: 120,
    startY: 220,
    steps: [
      { delayMs: 50, xOffset: 120, yOffset: 4 },
      { delayMs: 50, xOffset: 420, yOffset: 8 },
      { delayMs: 200, xOffset: 430, yOffset: 220 },
    ],
  });

  await expect(overlay).toContainText("state: captured");
  await expect(overlay).toContainText("duration: 100ms");
  await expect(overlay).toContainText("samples: 3");
  await expect(overlay).toContainText("dy: +8.0px");
});

test("bootstrap gesture debug overlay follows query param changes without reload", async ({
  page,
}) => {
  await page.goto("/privacy", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const overlay = page.getByTestId("global-gesture-debug-overlay");
  await expect(overlay).toHaveCount(0);

  await page.evaluate(() => {
    window.history.pushState(window.history.state, "", "/privacy?swipe-debug");
  });
  await expect(overlay).toBeVisible();

  await page.evaluate(() => {
    window.history.pushState(window.history.state, "", "/privacy");
  });
  await expect(overlay).toHaveCount(0);
});
