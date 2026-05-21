import { devices, expect, test, type Page } from "@playwright/test";

const { defaultBrowserType: _pixel7BrowserType, ...pixel7Device } = devices["Pixel 7"];
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 96;

test.use({
  ...pixel7Device,
});

async function gotoFileViewFixture(
  page: Page,
  options?: { minResizeBehavior?: "merge" | "slide" },
) {
  const mode =
    options?.minResizeBehavior === "merge"
      ? "fileview-layout-merge"
      : options?.minResizeBehavior === "slide"
        ? "fileview-layout-slide"
        : "fileview-layout-persistence";
  await page.goto(`/visual-fixture?mode=${mode}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function gotoVisualFixtureDirectory(page: Page, options?: { swipeDebug?: boolean }) {
  const debugQuery = options?.swipeDebug ? "?swipe-debug" : "";
  await page.goto(`/visual-fixture${debugQuery}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function gotoLogoPage(page: Page) {
  await page.goto("/logo?dev", {
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
  const maxWidthPx = await getMobileSidebarMaxWidthPx(page);

  return Math.max(1, Math.min(MOBILE_SIDEBAR_MIN_WIDTH_PX, maxWidthPx));
}

function getFileViewLayoutShell(page: Page) {
  return page.locator("[data-mobile-pane]").first();
}

async function getMobileMainPaneWidthPx(page: Page) {
  return Math.round(
    (
      await page
        .locator(
          '[data-testid="workspace-layout-v2-pane-main"] [data-workspace-layout-v2-mobile-main-pane]',
        )
        .boundingBox()
    )?.width ?? 0,
  );
}

async function scrollFileViewCarouselToPane(page: Page, pane: "left" | "main" | "right") {
  await page.getByTestId("workspace-layout-v2-pane-main").evaluate((element, nextPane) => {
    const mainPane = element.querySelector("[data-workspace-layout-v2-mobile-main-pane]");
    if (!(mainPane instanceof HTMLElement)) {
      throw new Error("Expected mobile carousel main pane.");
    }
    const panePeekPx = Number.parseFloat(window.getComputedStyle(element).paddingLeft);

    const previousScrollSnapType = element.style.scrollSnapType;
    element.style.scrollSnapType = "none";
    element.scrollLeft =
      nextPane === "left"
        ? panePeekPx
        : nextPane === "main"
          ? mainPane.offsetLeft - panePeekPx
          : element.scrollWidth - element.clientWidth;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
    window.setTimeout(() => {
      element.style.scrollSnapType = previousScrollSnapType;
    }, 0);
  }, pane);

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", pane);
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

async function touchDragHandleByPx(page: Page, testId: string, deltaX: number) {
  await touchDragHandleThroughDeltas(page, testId, [
    deltaX / 4,
    deltaX / 2,
    (deltaX * 3) / 4,
    deltaX,
  ]);
}

async function touchDragHandleThroughDeltas(
  page: Page,
  testId: string,
  deltaXs: ReadonlyArray<number>,
) {
  const handleBox = await getBox(page, testId);
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const session = await page.context().newCDPSession(page);
  const gestureStartTimeMs = Date.now();
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: startX,
    y: startY,
  };

  await session.send("Input.dispatchTouchEvent", {
    timestamp: gestureStartTimeMs / 1000,
    type: "touchStart",
    touchPoints: [touchPoint],
  });

  for (const [stepIndex, deltaX] of deltaXs.entries()) {
    await page.waitForTimeout(16);
    await session.send("Input.dispatchTouchEvent", {
      timestamp: (gestureStartTimeMs + (stepIndex + 1) * 16) / 1000,
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          x: startX + deltaX,
        },
      ],
    });
  }

  await session.send("Input.dispatchTouchEvent", {
    timestamp: (gestureStartTimeMs + (deltaXs.length + 1) * 16) / 1000,
    type: "touchEnd",
    touchPoints: [],
  });
}

async function scrollMobileCarouselByPx(page: Page, deltaPx: number) {
  await page.getByTestId("workspace-layout-v2-pane-main").evaluate((element, deltaPx) => {
    element.style.scrollSnapType = "none";
    element.scrollLeft += deltaPx;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, deltaPx);
}

test("fileview mobile carousel moves between left, main, and right panes", async ({ page }) => {
  await gotoFileViewFixture(page);

  const shell = getFileViewLayoutShell(page);
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await scrollFileViewCarouselToPane(page, "left");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(1);

  await scrollFileViewCarouselToPane(page, "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(0);

  await scrollFileViewCarouselToPane(page, "right");
  await expect(page.getByTestId("workspace-layout-v2-right-resize")).toHaveCount(1);
});

test("fileview mobile resize grip waits for the carousel to settle", async ({ page }) => {
  await gotoFileViewFixture(page);

  await page.getByTestId("workspace-layout-v2-pane-main").evaluate((element) => {
    element.style.scrollSnapType = "none";
    element.scrollLeft = 120;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "left");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(0);

  await scrollFileViewCarouselToPane(page, "left");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(1);
});

test("fileview mobile left sidebar exposes fixture links", async ({ page }) => {
  await gotoFileViewFixture(page);

  await scrollFileViewCarouselToPane(page, "left");

  const leftLinks = page.getByTestId("fileview-layout-left-sidebar-links");
  await expect(leftLinks.getByRole("link")).toHaveCount(4);
  await expect(leftLinks.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(leftLinks.getByRole("link", { name: "Machines" })).toBeVisible();
  await expect(leftLinks.getByRole("link", { name: "Connect repository" })).toBeVisible();
  await expect(leftLinks.getByRole("link", { name: "Pricing" })).toBeVisible();
});

test("fileview mobile sidebar minimum uses the configured mobile pane width", async ({ page }) => {
  await gotoFileViewFixture(page);

  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  expect(minWidthPx).toBe(MOBILE_SIDEBAR_MIN_WIDTH_PX);

  await scrollFileViewCarouselToPane(page, "left");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveAttribute(
    "aria-valuemin",
    `${minWidthPx}`,
  );
  const leftPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-left")).width;
  await dragHandleByPx(
    page,
    "workspace-layout-v2-left-resize",
    minWidthPx - leftPaneWidthBefore - 4,
  );
  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "left");
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-left")).width))
    .toBe(minWidthPx);

  await scrollFileViewCarouselToPane(page, "right");
  await expect(page.getByTestId("workspace-layout-v2-right-resize")).toHaveAttribute(
    "aria-valuemin",
    `${minWidthPx}`,
  );
  const rightPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-right")).width;
  await dragHandleByPx(
    page,
    "workspace-layout-v2-right-resize",
    rightPaneWidthBefore - minWidthPx + 4,
  );
  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "right");
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-right")).width))
    .toBe(minWidthPx);
});

test("fileview mobile merge resize keeps the sidebar beside a complete main pane", async ({
  page,
}) => {
  await gotoFileViewFixture(page, { minResizeBehavior: "merge" });

  await scrollFileViewCarouselToPane(page, "left");

  const viewportWidthPx = await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => element.clientWidth);
  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  const leftPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-left")).width;

  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-left-resize",
    minWidthPx - leftPaneWidthBefore - minWidthPx,
  );

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "left");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(1);

  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-left")).width))
    .toBe(minWidthPx);
  await expect
    .poll(async () =>
      Math.round(
        (
          await page
            .locator(
              '[data-testid="workspace-layout-v2-pane-main"] [data-workspace-layout-v2-mobile-main-pane]',
            )
            .boundingBox()
        )?.width ?? 0,
      ),
    )
    .toBe(viewportWidthPx - minWidthPx);

  await scrollFileViewCarouselToPane(page, "right");
  await expect(page.getByTestId("workspace-layout-v2-right-resize")).toHaveCount(1);
  await expect
    .poll(async () =>
      Math.round(
        (
          await page
            .locator(
              '[data-testid="workspace-layout-v2-pane-main"] [data-workspace-layout-v2-mobile-main-pane]',
            )
            .boundingBox()
        )?.width ?? 0,
      ),
    )
    .toBe(viewportWidthPx - minWidthPx);

  await scrollFileViewCarouselToPane(page, "left");
  await expect
    .poll(async () =>
      Math.round(
        (
          await page
            .locator(
              '[data-testid="workspace-layout-v2-pane-main"] [data-workspace-layout-v2-mobile-main-pane]',
            )
            .boundingBox()
        )?.width ?? 0,
      ),
    )
    .toBe(viewportWidthPx - minWidthPx);
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(1);
  await expect(page.getByTestId("workspace-layout-v2-right-resize")).toHaveCount(0);
});

test("logo mobile merge resize keeps main width while opening the right sidebar", async ({
  page,
}) => {
  await gotoLogoPage(page);

  await scrollFileViewCarouselToPane(page, "left");

  const viewportWidthPx = await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => element.clientWidth);
  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  const leftPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-left")).width;

  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-left-resize",
    minWidthPx - leftPaneWidthBefore - minWidthPx,
  );

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "left");
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);

  await scrollFileViewCarouselToPane(page, "right");
  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "right");
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);

  await scrollMobileCarouselByPx(page, -14);
  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "right");
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);
});

test("logo mobile right merge survives reload from localStorage", async ({ page }) => {
  // Keep page.setViewportSize at 320px so this test covers the narrow merge contract.
  await page.setViewportSize({ width: 320, height: 844 });
  await gotoLogoPage(page);
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await gotoLogoPage(page);

  await scrollFileViewCarouselToPane(page, "right");

  const viewportWidthPx = await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => element.clientWidth);
  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  const rightPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-right")).width;

  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-right-resize",
    rightPaneWidthBefore - minWidthPx + minWidthPx,
  );

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "right");
  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="right"]')).toHaveCount(
    1,
  );
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-right")).width))
    .toBe(minWidthPx);
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);

  await page.reload({ waitUntil: "networkidle" });

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "right");
  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="right"]')).toHaveCount(
    1,
  );
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-right")).width))
    .toBe(minWidthPx);
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);
});

test("logo mobile merge resize settles after a back-and-forth grip drag", async ({ page }) => {
  await gotoLogoPage(page);

  await scrollFileViewCarouselToPane(page, "left");

  const viewportWidthPx = await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => element.clientWidth);
  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  const leftPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-left")).width;

  await touchDragHandleThroughDeltas(page, "workspace-layout-v2-left-resize", [
    minWidthPx - leftPaneWidthBefore - minWidthPx,
    minWidthPx - leftPaneWidthBefore + 16,
  ]);

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "left");
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-left")).width))
    .toBe(minWidthPx);
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);

  await scrollFileViewCarouselToPane(page, "right");
  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "right");
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);
});

test("logo mobile keeps left merge while resizing the right sidebar", async ({ page }) => {
  await gotoLogoPage(page);

  await scrollFileViewCarouselToPane(page, "left");

  const viewportWidthPx = await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => element.clientWidth);
  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  const leftPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-left")).width;

  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-left-resize",
    minWidthPx - leftPaneWidthBefore - minWidthPx,
  );

  await scrollFileViewCarouselToPane(page, "right");
  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="left"]')).toHaveCount(1);

  const rightPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-right")).width;
  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-right-resize",
    rightPaneWidthBefore - minWidthPx + minWidthPx,
  );

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "right");
  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="left"]')).toHaveCount(1);
  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="right"]')).toHaveCount(
    0,
  );
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-right")).width))
    .toBe(minWidthPx);

  await touchDragHandleByPx(page, "workspace-layout-v2-right-resize", -96);

  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="left"]')).toHaveCount(1);
  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="right"]')).toHaveCount(
    0,
  );
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-right")).width))
    .toBeGreaterThan(minWidthPx + 40);
});

test("logo mobile hands main to right when left releases and right is minimum", async ({
  page,
}) => {
  await gotoLogoPage(page);

  await scrollFileViewCarouselToPane(page, "left");

  const viewportWidthPx = await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element) => element.clientWidth);
  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  const leftPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-left")).width;

  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-left-resize",
    minWidthPx - leftPaneWidthBefore - minWidthPx,
  );

  await scrollFileViewCarouselToPane(page, "right");

  const rightPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-right")).width;
  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-right-resize",
    rightPaneWidthBefore - minWidthPx + minWidthPx,
  );

  await scrollFileViewCarouselToPane(page, "left");

  await touchDragHandleByPx(page, "workspace-layout-v2-left-resize", 96);

  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "left");
  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="left"]')).toHaveCount(0);
  await expect(page.locator('[data-workspace-layout-v2-mobile-merged-pane="right"]')).toHaveCount(
    1,
  );
  await expect.poll(async () => getMobileMainPaneWidthPx(page)).toBe(viewportWidthPx - minWidthPx);
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-right")).width))
    .toBe(minWidthPx);
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-left")).width))
    .toBeGreaterThan(minWidthPx + 40);
});

test("fileview mobile sidebar grips recenter when dragged past the minimum", async ({ page }) => {
  await gotoFileViewFixture(page, { minResizeBehavior: "slide" });

  const minWidthPx = await getMobileSidebarMinWidthPx(page);
  const slidePastMinimumPx = minWidthPx;

  await scrollFileViewCarouselToPane(page, "left");
  const leftPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-left")).width;
  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-left-resize",
    minWidthPx - leftPaneWidthBefore - slidePastMinimumPx,
  );
  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(0);

  await scrollFileViewCarouselToPane(page, "right");
  const rightPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-right")).width;
  await touchDragHandleByPx(
    page,
    "workspace-layout-v2-right-resize",
    rightPaneWidthBefore - minWidthPx + slidePastMinimumPx,
  );
  await expect(getFileViewLayoutShell(page)).toHaveAttribute("data-mobile-pane", "main");
  await expect(page.getByTestId("workspace-layout-v2-right-resize")).toHaveCount(0);
});

test("fileview mobile sidebar grips resize the active sidebars", async ({ page }) => {
  await gotoFileViewFixture(page, { minResizeBehavior: "slide" });

  await scrollFileViewCarouselToPane(page, "left");
  const leftPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-left")).width;
  await dragHandleByPx(page, "workspace-layout-v2-left-resize", -48);
  await expect
    .poll(async () => (await getBox(page, "workspace-layout-v2-pane-left")).width)
    .toBeLessThan(leftPaneWidthBefore - 40);

  await scrollFileViewCarouselToPane(page, "right");

  await expect(page.getByTestId("workspace-layout-v2-right-resize")).toHaveCount(1);
  const maxWidthPx = await getMobileSidebarMaxWidthPx(page);
  const contentSizedWidthPx = (await getBox(page, "fileview-layout-right-sidebar-body")).width;
  expect(contentSizedWidthPx).toBeGreaterThanOrEqual(159);
  expect(contentSizedWidthPx).toBeLessThan(maxWidthPx);

  const rightPaneWidthBefore = (await getBox(page, "workspace-layout-v2-pane-right")).width;
  await dragHandleByPx(page, "workspace-layout-v2-right-resize", 48);
  await expect
    .poll(async () => (await getBox(page, "workspace-layout-v2-pane-right")).width)
    .toBeLessThan(rightPaneWidthBefore - 40);

  await scrollFileViewCarouselToPane(page, "main");
  await scrollFileViewCarouselToPane(page, "right");

  await expect
    .poll(async () => (await getBox(page, "fileview-layout-right-sidebar-body")).width)
    .toBeLessThan(contentSizedWidthPx - 40);
  await expect(page.getByTestId("workspace-layout-v2-right-resize")).toHaveCount(1);
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
