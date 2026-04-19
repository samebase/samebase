import { devices, expect, test, type Page } from "@playwright/test";

const { defaultBrowserType: _pixel7BrowserType, ...pixel7Device } =
  devices["Pixel 7"];

test.use({
  ...pixel7Device,
});

async function gotoFileViewFixture(page: Page) {
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
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

async function getBox(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error(`Expected ${testId} to have a bounding box.`);
  }

  return box;
}

function getFileViewLayoutShell(page: Page) {
  return page.locator("[data-mobile-pane]").first();
}

async function scrollFileViewCarouselToPane(
  page: Page,
  pane: "left" | "main" | "right",
) {
  await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element, nextPane) => {
      const paneIndex = nextPane === "left" ? 0 : nextPane === "main" ? 1 : 2;
      element.scrollLeft = element.clientWidth * paneIndex;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, pane);

  await expect(getFileViewLayoutShell(page)).toHaveAttribute(
    "data-mobile-pane",
    pane,
  );
}

test("fileview mobile carousel moves between left, main, and right panes", async ({
  page,
}) => {
  await gotoFileViewFixture(page);

  const shell = getFileViewLayoutShell(page);
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await scrollFileViewCarouselToPane(page, "left");
  await expect(
    page.getByTestId("workspace-layout-v2-left-resize"),
  ).toBeVisible();

  await scrollFileViewCarouselToPane(page, "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(
    0,
  );

  await scrollFileViewCarouselToPane(page, "right");
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toBeVisible();
});

test("fileview mobile sidebars use a fixed width with no resize handle", async ({
  page,
}) => {
  await gotoFileViewFixture(page);

  await scrollFileViewCarouselToPane(page, "right");

  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(0);
  const fixedWidthPx = (
    await getBox(page, "fileview-layout-right-sidebar-body")
  ).width;

  await scrollFileViewCarouselToPane(page, "main");
  await scrollFileViewCarouselToPane(page, "right");

  await expect
    .poll(
      async () =>
        (await getBox(page, "fileview-layout-right-sidebar-body")).width,
    )
    .toBeGreaterThanOrEqual(fixedWidthPx - 1);
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(0);
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
