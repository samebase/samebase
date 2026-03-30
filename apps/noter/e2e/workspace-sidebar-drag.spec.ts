import { devices, expect, test, type Page } from "@playwright/test";

test.use({
  ...devices["Pixel 7"],
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
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: bounds.x + args.startX,
    y: bounds.y + args.startY,
  };

  await session.send("Input.dispatchTouchEvent", {
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
    await session.send("Input.dispatchTouchEvent", {
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
    type: "touchEnd",
    touchPoints: [],
  });
}

/**
 * Use one realistic touch sequence to fling from the open left sidebar toward
 * the right sidebar. The finger travels about 66% of a 390px-wide viewport
 * over 180ms, which is a strong flick but still well within human touch input.
 */
async function swipeFromLeftSidebarToRightSidebar(page: Page) {
  await dispatchHumanTouchSwipe(page, {
    startX: 282,
    startY: 220,
    steps: [
      { delayMs: 35, xOffset: -44, yOffset: 2 },
      { delayMs: 45, xOffset: -128, yOffset: 4 },
      { delayMs: 50, xOffset: -208, yOffset: 5 },
      { delayMs: 50, xOffset: -258, yOffset: 6 },
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
  const overlay = page.getByTestId("global-gesture-debug-overlay");
  await expect(fixture).toHaveAttribute("data-mobile-pane", "main");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("state: armed, waiting for gesture");

  await swipeFromMainToLeftSidebar(page);

  await expect(fixture).toHaveAttribute("data-mobile-pane", "left");
  await expect(overlay).toContainText("duration:");
});

test("fileview mobile swipe debug overlay is visibly armed before any gesture", async ({
  page,
}) => {
  await gotoFileViewFixture(page, { swipeDebug: true });

  const overlay = page.getByTestId("global-gesture-debug-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("debug: on");
  await expect(overlay).toContainText("scope: viewport trace");
  await expect(overlay).toContainText("state: armed, waiting for gesture");
});

test("fileview mobile can reach the right sidebar from the open left sidebar in one human swipe", async ({
  page,
}) => {
  await gotoFileViewFixture(page, { swipeDebug: true });

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const overlay = page.getByTestId("global-gesture-debug-overlay");
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

  const overlay = page.getByTestId("global-gesture-debug-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-debug-active", "false");
  await expect(overlay).toContainText("release vx:");
  await expect(overlay).toContainText("release vy:");
  await expect(overlay).toContainText("peak a:");
  expect(await overlay.locator("svg circle").count()).toBeGreaterThan(5);
});
