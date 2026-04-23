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

async function getMobileSidebarMaxWidthPx(page: Page) {
  return page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => Math.max(1, element.clientWidth - 48));
}

async function getMobileSidebarMinWidthPx(page: Page) {
  return page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => {
      const maxWidthPx = Math.max(1, element.clientWidth - 48);

      return Math.max(
        1,
        Math.min(element.clientWidth - maxWidthPx, maxWidthPx),
      );
    });
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
      const mainPane = element.querySelector(".snap-center");
      if (!(mainPane instanceof HTMLElement)) {
        throw new Error("Expected mobile carousel main pane.");
      }
      const panePeekPx = Number.parseFloat(
        window.getComputedStyle(element).paddingLeft,
      );

      element.style.scrollSnapType = "";
      element.scrollLeft =
        nextPane === "left"
          ? panePeekPx
          : nextPane === "main"
            ? mainPane.offsetLeft - panePeekPx
            : element.scrollWidth - element.clientWidth;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, pane);

  await expect(getFileViewLayoutShell(page)).toHaveAttribute(
    "data-mobile-pane",
    pane,
  );
}

async function dragHandleByPx(page: Page, testId: string, deltaX: number) {
  const handleBox = await getBox(page, testId);
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 4 });
  await page.mouse.up();
}

test("fileview mobile carousel moves between left, main, and right panes", async ({
  page,
}) => {
  await gotoFileViewFixture(page);

  const shell = getFileViewLayoutShell(page);
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await scrollFileViewCarouselToPane(page, "left");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(
    1,
  );

  await scrollFileViewCarouselToPane(page, "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(
    0,
  );

  await scrollFileViewCarouselToPane(page, "right");
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(1);
});

test("fileview mobile resize grip waits for the carousel to settle", async ({
  page,
}) => {
  await gotoFileViewFixture(page);

  await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => {
      element.style.scrollSnapType = "none";
      element.scrollLeft = 120;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

  await expect(getFileViewLayoutShell(page)).toHaveAttribute(
    "data-mobile-pane",
    "left",
  );
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(
    0,
  );

  await scrollFileViewCarouselToPane(page, "left");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(
    1,
  );
});

test("fileview mobile left sidebar exposes fixture links", async ({ page }) => {
  await gotoFileViewFixture(page);

  await scrollFileViewCarouselToPane(page, "left");

  const leftLinks = page.getByTestId("fileview-layout-left-sidebar-links");
  await expect(leftLinks.getByRole("link")).toHaveCount(4);
  await expect(
    leftLinks.getByRole("link", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(leftLinks.getByRole("link", { name: "Machines" })).toBeVisible();
  await expect(
    leftLinks.getByRole("link", { name: "Connect repository" }),
  ).toBeVisible();
  await expect(leftLinks.getByRole("link", { name: "Pricing" })).toBeVisible();
});

test("fileview mobile sidebar minimum matches viewport leftover after max width", async ({
  page,
}) => {
  await gotoFileViewFixture(page);

  const viewportWidthPx = await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => element.clientWidth);
  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  const maxWidthPx = await getMobileSidebarMaxWidthPx(page);
  expect(minWidthPx).toBe(viewportWidthPx - maxWidthPx);

  await scrollFileViewCarouselToPane(page, "left");
  await expect(
    page.getByTestId("workspace-layout-v2-left-resize"),
  ).toHaveAttribute("aria-valuemin", `${minWidthPx}`);
  await dragHandleByPx(page, "workspace-layout-v2-left-resize", -1000);
  await expect
    .poll(async () =>
      Math.round((await getBox(page, "workspace-layout-v2-pane-left")).width),
    )
    .toBe(minWidthPx);

  await scrollFileViewCarouselToPane(page, "right");
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveAttribute("aria-valuemin", `${minWidthPx}`);
  await dragHandleByPx(page, "workspace-layout-v2-right-resize", 1000);
  await expect
    .poll(async () =>
      Math.round((await getBox(page, "workspace-layout-v2-pane-right")).width),
    )
    .toBe(minWidthPx);
});

test("fileview mobile sidebar grips resize the active sidebars", async ({
  page,
}) => {
  await gotoFileViewFixture(page);

  await scrollFileViewCarouselToPane(page, "left");
  const leftPaneWidthBefore = (
    await getBox(page, "workspace-layout-v2-pane-left")
  ).width;
  await dragHandleByPx(page, "workspace-layout-v2-left-resize", -72);
  await expect
    .poll(
      async () => (await getBox(page, "workspace-layout-v2-pane-left")).width,
    )
    .toBeLessThan(leftPaneWidthBefore - 40);

  await scrollFileViewCarouselToPane(page, "right");

  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(1);
  const maxWidthPx = await getMobileSidebarMaxWidthPx(page);
  const contentSizedWidthPx = (
    await getBox(page, "fileview-layout-right-sidebar-body")
  ).width;
  expect(contentSizedWidthPx).toBeGreaterThanOrEqual(159);
  expect(contentSizedWidthPx).toBeLessThan(maxWidthPx);

  const rightPaneWidthBefore = (
    await getBox(page, "workspace-layout-v2-pane-right")
  ).width;
  await dragHandleByPx(page, "workspace-layout-v2-right-resize", 72);
  await expect
    .poll(
      async () => (await getBox(page, "workspace-layout-v2-pane-right")).width,
    )
    .toBeLessThan(rightPaneWidthBefore - 40);

  await scrollFileViewCarouselToPane(page, "main");
  await scrollFileViewCarouselToPane(page, "right");

  await expect
    .poll(
      async () =>
        (await getBox(page, "fileview-layout-right-sidebar-body")).width,
    )
    .toBeLessThan(contentSizedWidthPx - 40);
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(1);
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
