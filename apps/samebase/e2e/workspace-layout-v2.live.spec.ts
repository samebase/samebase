import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

const WORKSPACE_LAYOUT_V2_STATUS_BAR_FIXTURE_URL =
  "/visual-fixture?mode=workspace-layout-v2-status-bar";
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 96;

async function openWorkspaceLayoutV2Fixture(
  page: Page,
  options?: { dev?: boolean },
): Promise<void> {
  await page.goto(`${WORKSPACE_LAYOUT_V2_STATUS_BAR_FIXTURE_URL}${options?.dev ? "&dev" : ""}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("workspace-layout-v2-visual-fixture")).toBeVisible();
  await expect(page.locator("[data-workspace-layout-v2]")).toHaveCount(1);
}

async function getRoundedBoundingBox(locator: Locator) {
  const bounds = await locator.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Expected locator bounds");
  }

  return {
    height: Math.round(bounds.height),
    width: Math.round(bounds.width),
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
  };
}

async function waitForMonacoSurfaceReady(surface: Locator) {
  await expect(surface.locator(".view-lines").first()).toBeVisible();
  await expect(surface.getByText("Loading...")).toHaveCount(0);
}

async function getMainEditorVisibleText(page: Page) {
  return page
    .getByTestId("workspace-layout-v2-main-editor-surface")
    .locator(".view-lines")
    .first()
    .evaluate((element) => element.textContent ?? "");
}

async function scrollWorkspaceCarouselToPane(page: Page, pane: "left" | "main" | "right") {
  await page.getByTestId("workspace-layout-v2-pane-main").evaluate((element, nextPane) => {
    const mainPane = element.querySelector(".snap-center");
    if (!(mainPane instanceof HTMLElement)) {
      throw new Error("Expected mobile carousel main pane.");
    }
    const panePeekPx = Number.parseFloat(window.getComputedStyle(element).paddingLeft);

    element.scrollLeft =
      nextPane === "left"
        ? panePeekPx
        : nextPane === "main"
          ? mainPane.offsetLeft - panePeekPx
          : element.scrollWidth - element.clientWidth;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, pane);

  await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
    "data-mobile-pane",
    pane,
  );
}

async function scrollMainEditorToApproximateOffset(page: Page, scrollTop: number) {
  await page
    .getByTestId("workspace-layout-v2-main-editor-surface")
    .locator(".monaco-scrollable-element")
    .first()
    .evaluate((element, nextScrollTop) => {
      element.scrollTop = nextScrollTop;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, scrollTop);
}

async function getHorizontalSeparatorWidths(locator: Locator) {
  return locator.evaluate((element) => {
    const readSeparatorWidth = (pseudoElement: "::before" | "::after") => {
      const styles = window.getComputedStyle(element, pseudoElement);

      return styles.content === "none" ? "0px" : styles.width;
    };

    return {
      left: readSeparatorWidth("::before"),
      right: readSeparatorWidth("::after"),
    };
  });
}

async function touchDragHandleByPx(page: Page, handle: Locator, deltaX: number) {
  const handleBounds = await getRoundedBoundingBox(handle);
  const startX = handleBounds.x + handleBounds.width / 2;
  const startY = handleBounds.y + handleBounds.height / 2;
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
  for (const progress of [0.25, 0.5, 0.75, 1]) {
    await page.waitForTimeout(120);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          x: startX + deltaX * progress,
        },
      ],
    });
  }
  await page.waitForTimeout(220);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

test("desktop v2 fixture keeps sidebar triggers inside the main header", async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < 768, "desktop-only");

  await openWorkspaceLayoutV2Fixture(page);

  const leftButton = page.getByRole("button", { name: "Toggle Left Sidebar" });
  const rightButton = page.getByRole("button", {
    name: "Toggle Right Sidebar",
  });
  const mainHeader = page.getByTestId("workspace-layout-v2-main-pane-header");

  await expect(leftButton).toBeVisible();
  await expect(rightButton).toBeVisible();
  const mainHeaderBox = await getRoundedBoundingBox(mainHeader);
  const leftButtonBox = await getRoundedBoundingBox(leftButton);
  const rightButtonBox = await getRoundedBoundingBox(rightButton);

  expect(leftButtonBox.x).toBeGreaterThanOrEqual(mainHeaderBox.x);
  expect(leftButtonBox.y).toBeGreaterThanOrEqual(mainHeaderBox.y);
  expect(leftButtonBox.y + leftButtonBox.height).toBeLessThanOrEqual(
    mainHeaderBox.y + mainHeaderBox.height,
  );
  expect(rightButtonBox.x + rightButtonBox.width).toBeLessThanOrEqual(
    mainHeaderBox.x + mainHeaderBox.width,
  );
  expect(rightButtonBox.y).toBeGreaterThanOrEqual(mainHeaderBox.y);
  expect(rightButtonBox.y + rightButtonBox.height).toBeLessThanOrEqual(
    mainHeaderBox.y + mainHeaderBox.height,
  );
});

test("desktop v2 fixture keeps the main header fixed while the editor body scrolls", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < 768, "desktop-only");

  await openWorkspaceLayoutV2Fixture(page);
  await waitForMonacoSurfaceReady(page.getByTestId("workspace-layout-v2-main-editor-surface"));

  const mainHeader = page.getByTestId("workspace-layout-v2-main-pane-header");
  const mainHeaderBefore = await getRoundedBoundingBox(mainHeader);
  const initialMainVisibleText = await getMainEditorVisibleText(page);

  await scrollMainEditorToApproximateOffset(page, 320);

  const mainHeaderAfter = await getRoundedBoundingBox(mainHeader);

  expect(await getMainEditorVisibleText(page)).not.toBe(initialMainVisibleText);
  expect(mainHeaderAfter.y).toBe(mainHeaderBefore.y);
  expect(mainHeaderAfter.height).toBe(mainHeaderBefore.height);
});

test("mobile v2 fixture uses the carousel to move between panes", async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const layout = page.locator("[data-workspace-layout-v2]");
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");

  await scrollWorkspaceCarouselToPane(page, "left");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(1);

  await scrollWorkspaceCarouselToPane(page, "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(0);

  await scrollWorkspaceCarouselToPane(page, "right");
  await expect(page.getByTestId("workspace-layout-v2-right-resize")).toHaveCount(1);
});

test("mobile v2 fixture keeps grip targets centered while rendering dots outside the active sidebar", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page, { dev: true });

  const leftPane = page.getByTestId("workspace-layout-v2-pane-left");
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");

  await scrollWorkspaceCarouselToPane(page, "left");
  const leftGrip = page.getByTestId("workspace-layout-v2-left-resize");
  await expect(leftGrip).toBeVisible();
  const leftPaneBox = await getRoundedBoundingBox(leftPane);
  const leftGripBox = await getRoundedBoundingBox(leftGrip);
  const leftDotsBox = await getRoundedBoundingBox(
    leftGrip.locator("[data-workspace-layout-v2-resize-grip-dots]"),
  );
  const leftPaneRightEdge = leftPaneBox.x + leftPaneBox.width;
  expect(leftGripBox.x).toBeLessThan(leftPaneRightEdge);
  expect(leftGripBox.x + leftGripBox.width).toBeGreaterThan(leftPaneRightEdge);
  expect(leftDotsBox.x).toBeGreaterThanOrEqual(leftPaneRightEdge);

  await scrollWorkspaceCarouselToPane(page, "right");
  const rightGrip = page.getByTestId("workspace-layout-v2-right-resize");
  await expect(rightGrip).toBeVisible();
  const rightPaneBox = await getRoundedBoundingBox(rightPane);
  const rightGripBox = await getRoundedBoundingBox(rightGrip);
  const rightDotsBox = await getRoundedBoundingBox(
    rightGrip.locator("[data-workspace-layout-v2-resize-grip-dots]"),
  );
  expect(rightGripBox.x).toBeLessThan(rightPaneBox.x);
  expect(rightGripBox.x + rightGripBox.width).toBeGreaterThan(rightPaneBox.x);
  expect(rightDotsBox.x + rightDotsBox.width).toBeLessThanOrEqual(rightPaneBox.x);
});

test("mobile v2 fixture renders sidebar grip targets on the active sidebar", async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);
  await scrollWorkspaceCarouselToPane(page, "left");
  await expect(
    page
      .getByTestId("workspace-layout-v2-left-resize")
      .locator("[data-workspace-layout-v2-resize-grip-dots]"),
  ).toHaveCount(1);

  await scrollWorkspaceCarouselToPane(page, "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(0);
});

test("mobile v2 fixture keeps the visible pane borderless while adjacent panes own separators", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const leftPane = page.getByTestId("workspace-layout-v2-pane-left");
  const mainPane = page
    .locator('[data-testid="workspace-layout-v2-pane-main"] .snap-center > div')
    .first();
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");

  await scrollWorkspaceCarouselToPane(page, "left");
  await expect
    .poll(async () => getHorizontalSeparatorWidths(leftPane))
    .toEqual({
      left: "0px",
      right: "0px",
    });
  await expect
    .poll(async () => getHorizontalSeparatorWidths(mainPane))
    .toEqual({
      left: "1px",
      right: "1px",
    });

  await scrollWorkspaceCarouselToPane(page, "main");
  await expect
    .poll(async () => getHorizontalSeparatorWidths(leftPane))
    .toEqual({
      left: "1px",
      right: "1px",
    });
  await expect
    .poll(async () => getHorizontalSeparatorWidths(mainPane))
    .toEqual({
      left: "0px",
      right: "0px",
    });
  await expect
    .poll(async () => getHorizontalSeparatorWidths(rightPane))
    .toEqual({
      left: "1px",
      right: "1px",
    });

  await scrollWorkspaceCarouselToPane(page, "right");
  await expect
    .poll(async () => getHorizontalSeparatorWidths(mainPane))
    .toEqual({
      left: "1px",
      right: "1px",
    });
  await expect
    .poll(async () => getHorizontalSeparatorWidths(rightPane))
    .toEqual({
      left: "0px",
      right: "0px",
    });
});

test("mobile v2 fixture vertical main-editor scrolling reveals later Monaco content", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);
  await waitForMonacoSurfaceReady(page.getByTestId("workspace-layout-v2-main-editor-surface"));

  const initialVisibleText = await getMainEditorVisibleText(page);

  await scrollMainEditorToApproximateOffset(page, 720);

  expect(await getMainEditorVisibleText(page)).not.toBe(initialVisibleText);
});

test("signed-in logo keeps the merged left surface across mobile viewports and routes", async ({
  context,
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/logo?dev");
  await page.waitForLoadState("networkidle");
  const narrowerPage = await context.newPage();
  await narrowerPage.setViewportSize({
    height: viewport.height,
    width: viewport.width - 8,
  });
  await narrowerPage.goto("/logo?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(narrowerPage, "/logo?dev");
  await narrowerPage.waitForLoadState("networkidle");
  await scrollWorkspaceCarouselToPane(narrowerPage, "left");
  await scrollWorkspaceCarouselToPane(page, "left");

  const layout = page.locator("[data-workspace-layout-v2]");
  const mainPane = page.getByTestId("workspace-layout-v2-pane-main");
  const viewportWidthPx = await mainPane.evaluate((element) => element.clientWidth);
  const leftResizeHandle = page.getByTestId("workspace-layout-v2-left-resize");
  const leftPane = page.getByTestId("workspace-layout-v2-pane-left");
  const initialLeftPaneWidthPx = (await getRoundedBoundingBox(leftPane)).width;

  await touchDragHandleByPx(page, leftResizeHandle, 192 - initialLeftPaneWidthPx);
  await expect(layout).not.toHaveAttribute("data-workspace-layout-v2-mobile-merged-side");
  await page.waitForTimeout(750);
  await expect(layout).not.toHaveAttribute("data-workspace-layout-v2-mobile-merged-side");

  const leftPaneWidthPx = (await getRoundedBoundingBox(leftPane)).width;
  await touchDragHandleByPx(page, leftResizeHandle, -leftPaneWidthPx);

  await expect(layout).toHaveAttribute("data-workspace-layout-v2-mobile-merged-side", "left");
  await expect
    .poll(async () =>
      Math.round(
        (await mainPane.locator("[data-workspace-layout-v2-mobile-main-pane]").boundingBox())
          ?.width ?? 0,
      ),
    )
    .toBe(viewportWidthPx - MOBILE_SIDEBAR_MIN_WIDTH_PX);
  await expect(narrowerPage.locator("[data-workspace-layout-v2]")).toHaveAttribute(
    "data-workspace-layout-v2-mobile-merged-side",
    "left",
  );
  await expect
    .poll(async () =>
      Math.round(
        (
          await narrowerPage
            .getByTestId("workspace-layout-v2-pane-main")
            .locator("[data-workspace-layout-v2-mobile-main-pane]")
            .boundingBox()
        )?.width ?? 0,
      ),
    )
    .toBe(viewport.width - 8 - MOBILE_SIDEBAR_MIN_WIDTH_PX);

  await narrowerPage.goto("/settings", { waitUntil: "domcontentloaded" });
  await narrowerPage.waitForLoadState("networkidle");
  await expect(narrowerPage.locator("[data-workspace-layout-v2]")).toHaveAttribute(
    "data-mobile-pane",
    "main",
  );
  await page.waitForTimeout(750);

  await expect(layout).toHaveAttribute("data-workspace-layout-v2-mobile-merged-side", "left");
  await expect
    .poll(async () =>
      Math.round(
        (await mainPane.locator("[data-workspace-layout-v2-mobile-main-pane]").boundingBox())
          ?.width ?? 0,
      ),
    )
    .toBe(viewportWidthPx - MOBILE_SIDEBAR_MIN_WIDTH_PX);
});
