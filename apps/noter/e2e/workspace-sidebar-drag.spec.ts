import { expect, test, type Page } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
});

async function gotoFileViewFixture(
  page: Page,
  options?: { swipeDebug?: boolean },
) {
  await page.setViewportSize({ width: 390, height: 844 });
  const debugQuery = options?.swipeDebug ? "&swipe-debug" : "";
  await page.goto(
    `/visual-fixture.html?mode=fileview-layout-persistence${debugQuery}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");
}

/**
 * Use one realistic touch sequence to fling from the open left sidebar toward
 * the right sidebar. The finger travels about 66% of a 390px-wide viewport
 * over 180ms, which is a strong flick but still well within human touch input.
 */
async function swipeFromLeftSidebarToRightSidebar(page: Page) {
  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const startX = bounds.x + 282;
  const startY = bounds.y + 220;
  const session = await page.context().newCDPSession(page);
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: startX,
    y: startY,
  };

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint],
  });

  for (const step of [
    { delayMs: 35, xOffset: -44, yOffset: 2 },
    { delayMs: 45, xOffset: -128, yOffset: 4 },
    { delayMs: 50, xOffset: -208, yOffset: 5 },
    { delayMs: 50, xOffset: -258, yOffset: 6 },
  ]) {
    await page.waitForTimeout(step.delayMs);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          x: startX + step.xOffset,
          y: startY + step.yOffset,
        },
      ],
    });
  }

  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

/**
 * Use a shorter, lighter swipe from the main pane to the left sidebar. This is
 * about 44% of the viewport over 240ms, so it should be easier than the direct
 * left-to-right cross-swipe above.
 */
async function swipeFromMainToLeftSidebar(page: Page) {
  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const startX = bounds.x + 150;
  const startY = bounds.y + 220;
  const session = await page.context().newCDPSession(page);
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: startX,
    y: startY,
  };

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint],
  });

  for (const step of [
    { delayMs: 50, xOffset: 28, yOffset: 2 },
    { delayMs: 60, xOffset: 74, yOffset: 4 },
    { delayMs: 60, xOffset: 126, yOffset: 5 },
    { delayMs: 70, xOffset: 174, yOffset: 6 },
  ]) {
    await page.waitForTimeout(step.delayMs);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          x: startX + step.xOffset,
          y: startY + step.yOffset,
        },
      ],
    });
  }

  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
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
