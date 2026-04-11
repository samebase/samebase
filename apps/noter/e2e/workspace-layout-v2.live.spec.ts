import { expect, test, type Locator, type Page } from "@playwright/test";
import { dispatchHumanTouchSwipe } from "./touchGestures";

const MOBILE_PANE_TRANSITION_WAIT_MS = 220;
const WORKSPACE_LAYOUT_V2_STATUS_BAR_FIXTURE_URL =
  "/visual-fixture.html?mode=workspace-layout-v2-status-bar";

async function openWorkspaceLayoutV2Fixture(
  page: Page,
  options?: { swipeDebug?: boolean },
): Promise<void> {
  const debugQuery = options?.swipeDebug ? "&swipe-debug" : "";
  await page.goto(
    `${WORKSPACE_LAYOUT_V2_STATUS_BAR_FIXTURE_URL}${debugQuery}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await expect(
    page.getByTestId("workspace-layout-v2-visual-fixture"),
  ).toBeVisible();
  await expect(page.locator("[data-workspace-layout-v2]")).toHaveCount(1);
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);
}

async function getFixtureViewportClip(page: Page) {
  const fixture = page.getByTestId("workspace-layout-v2-visual-fixture");
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Expected workspace layout v2 fixture bounds");
  }

  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
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

async function revealLaterMainMonacoContent(page: Page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await verticalScrollMainEditor(page);
    await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);

    if (
      (await getMainEditorVisibleText(page)).includes(
        "describeWorkspaceLayoutV2",
      )
    ) {
      return;
    }
  }
}

async function swipeWithinLocatorByRatio(args: {
  locator: Parameters<typeof dispatchHumanTouchSwipe>[1];
  page: Page;
  startXRatio: number;
  startYRatio: number;
  steps: ReadonlyArray<{
    delayMs: number;
    xOffsetRatio: number;
    yOffsetRatio: number;
  }>;
}) {
  const bounds = await args.locator.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  await dispatchHumanTouchSwipe(args.page, args.locator, {
    startX: Math.round(bounds.width * args.startXRatio),
    startY: Math.round(bounds.height * args.startYRatio),
    steps: args.steps.map((step) => ({
      delayMs: step.delayMs,
      xOffset: Math.round(bounds.width * step.xOffsetRatio),
      yOffset: Math.round(bounds.height * step.yOffsetRatio),
    })),
  });
}

async function swipeFromMainToLeft(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-main"),
    {
      startX: 80,
      startY: 220,
      steps: [
        { delayMs: 25, xOffset: 72, yOffset: 2 },
        { delayMs: 30, xOffset: 168, yOffset: 4 },
        { delayMs: 30, xOffset: 260, yOffset: 5 },
        { delayMs: 25, xOffset: 320, yOffset: 6 },
      ],
    },
  );
}

async function swipeFromMainToRight(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-main"),
    {
      startX: 320,
      startY: 220,
      steps: [
        { delayMs: 25, xOffset: -72, yOffset: 2 },
        { delayMs: 30, xOffset: -168, yOffset: 4 },
        { delayMs: 30, xOffset: -260, yOffset: 5 },
        { delayMs: 25, xOffset: -320, yOffset: 6 },
      ],
    },
  );
}

async function swipeFromRightToMain(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-right"),
    {
      // Start near the live sidebar edge but outside the centered resize grip so
      // mobile edge swipes stay available for pane navigation.
      startX: 12,
      startY: 40,
      steps: [
        { delayMs: 25, xOffset: 72, yOffset: 2 },
        { delayMs: 30, xOffset: 168, yOffset: 4 },
        { delayMs: 30, xOffset: 260, yOffset: 5 },
        { delayMs: 25, xOffset: 320, yOffset: 6 },
      ],
    },
  );
}

async function swipeFromLeftTowardMain(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-left"),
    {
      startX: 312,
      startY: 40,
      steps: [
        { delayMs: 25, xOffset: -72, yOffset: 2 },
        { delayMs: 30, xOffset: -168, yOffset: 4 },
        { delayMs: 30, xOffset: -260, yOffset: 5 },
        { delayMs: 25, xOffset: -320, yOffset: 6 },
      ],
    },
  );
}

async function openLeftPaneFromMain(page: Page) {
  const layout = page.locator("[data-workspace-layout-v2]");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await swipeFromMainToLeft(page);

    try {
      await expect(layout).toHaveAttribute("data-mobile-pane", "left", {
        timeout: 1000,
      });
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await openWorkspaceLayoutV2Fixture(page);
      await expect(layout).toHaveAttribute("data-mobile-pane", "main");
    }
  }
}

async function openRightPaneFromMain(page: Page) {
  const layout = page.locator("[data-workspace-layout-v2]");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await swipeFromMainToRight(page);

    try {
      await expect(layout).toHaveAttribute("data-mobile-pane", "right", {
        timeout: 1000,
      });
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await openWorkspaceLayoutV2Fixture(page);
      await expect(layout).toHaveAttribute("data-mobile-pane", "main");
    }
  }
}

async function swipeMainEditorToRight(page: Page) {
  await swipeWithinLocatorByRatio({
    locator: page.getByTestId("workspace-layout-v2-main-editor-surface"),
    page,
    startXRatio: 0.72,
    startYRatio: 0.3,
    steps: [
      { delayMs: 25, xOffsetRatio: -0.18, yOffsetRatio: 0.01 },
      { delayMs: 30, xOffsetRatio: -0.34, yOffsetRatio: 0.01 },
      { delayMs: 30, xOffsetRatio: -0.52, yOffsetRatio: 0.02 },
      { delayMs: 25, xOffsetRatio: -0.7, yOffsetRatio: 0.02 },
    ],
  });
}

async function swipeLeftEditorTowardMain(page: Page) {
  await swipeWithinLocatorByRatio({
    locator: page.getByTestId("workspace-layout-v2-prosemark-surface"),
    page,
    startXRatio: 0.78,
    startYRatio: 0.35,
    steps: [
      { delayMs: 25, xOffsetRatio: -0.16, yOffsetRatio: 0.01 },
      { delayMs: 30, xOffsetRatio: -0.32, yOffsetRatio: 0.02 },
      { delayMs: 30, xOffsetRatio: -0.5, yOffsetRatio: 0.02 },
      { delayMs: 25, xOffsetRatio: -0.66, yOffsetRatio: 0.03 },
    ],
  });
}

async function verticalScrollMainEditor(page: Page) {
  await swipeWithinLocatorByRatio({
    locator: page.getByTestId("workspace-layout-v2-main-editor-surface"),
    page,
    startXRatio: 0.52,
    startYRatio: 0.7,
    steps: [
      { delayMs: 25, xOffsetRatio: 0.01, yOffsetRatio: -0.12 },
      { delayMs: 30, xOffsetRatio: 0.01, yOffsetRatio: -0.22 },
      { delayMs: 30, xOffsetRatio: 0.02, yOffsetRatio: -0.34 },
      { delayMs: 25, xOffsetRatio: 0.02, yOffsetRatio: -0.44 },
    ],
  });
}

async function scrollMainEditorToApproximateOffset(
  page: Page,
  scrollTop: number,
) {
  await page
    .getByTestId("workspace-layout-v2-main-editor-surface")
    .locator(".monaco-scrollable-element")
    .first()
    .evaluate((element, nextScrollTop) => {
      element.scrollTop = nextScrollTop;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, scrollTop);
}

function getLeftPaneScrollSurface(page: Page) {
  return page
    .getByTestId("workspace-layout-v2-pane-left")
    .locator("section > div")
    .nth(1);
}

async function scrollLeftPaneToApproximateOffset(
  page: Page,
  scrollTop: number,
) {
  await getLeftPaneScrollSurface(page).evaluate((element, nextScrollTop) => {
    element.scrollTop = nextScrollTop;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, scrollTop);
}

async function verticalScrollLeftPane(page: Page) {
  await swipeWithinLocatorByRatio({
    locator: getLeftPaneScrollSurface(page),
    page,
    startXRatio: 0.5,
    startYRatio: 0.72,
    steps: [
      { delayMs: 25, xOffsetRatio: 0.01, yOffsetRatio: -0.1 },
      { delayMs: 30, xOffsetRatio: 0.01, yOffsetRatio: -0.2 },
      { delayMs: 30, xOffsetRatio: 0.02, yOffsetRatio: -0.3 },
      { delayMs: 25, xOffsetRatio: 0.02, yOffsetRatio: -0.4 },
    ],
  });
}

async function tapExposedMainStrip(page: Page, side: "left" | "right") {
  const mainPane = page.getByTestId("workspace-layout-v2-pane-main");
  const mainPaneBox = await mainPane.boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;

  expect(mainPaneBox).not.toBeNull();
  if (mainPaneBox === null) {
    return;
  }

  // The main pane still spans the full viewport in track coordinates, so the
  // tap target has to be translated into the main pane's local box before we
  // dispatch a native touch sequence through Chromium's real mobile pipeline.
  const viewportTapX = side === "left" ? viewportWidth - 20 : 20;
  const tapX = Math.max(
    1,
    Math.min(mainPaneBox.width - 1, viewportTapX - mainPaneBox.x),
  );
  const tapY = Math.max(
    1,
    Math.min(mainPaneBox.height - 1, 220 - mainPaneBox.y),
  );
  const session = await page.context().newCDPSession(page);
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: mainPaneBox.x + tapX,
    y: mainPaneBox.y + tapY,
  };

  await session.send("Input.dispatchTouchEvent", {
    timestamp: Date.now() / 1000,
    type: "touchStart",
    touchPoints: [touchPoint],
  });
  await session.send("Input.dispatchTouchEvent", {
    timestamp: (Date.now() + 1) / 1000,
    type: "touchEnd",
    touchPoints: [],
  });
}

async function expectResizeHandleToAlignWithPaneBoundary(
  page: Page,
  side: "left" | "right",
) {
  const pane = page.getByTestId(
    side === "left"
      ? "workspace-layout-v2-pane-left"
      : "workspace-layout-v2-pane-right",
  );
  const handle = page.getByTestId(
    side === "left"
      ? "workspace-layout-v2-left-resize"
      : "workspace-layout-v2-right-resize",
  );
  const paneBox = await pane.boundingBox();
  const handleBox = await handle.boundingBox();

  expect(paneBox).not.toBeNull();
  expect(handleBox).not.toBeNull();
  if (paneBox === null || handleBox === null) {
    return;
  }

  const paneBoundaryX = side === "left" ? paneBox.x + paneBox.width : paneBox.x;
  const handleCenterX = handleBox.x + handleBox.width / 2;
  expect(
    Math.abs(Math.round(handleCenterX - paneBoundaryX)),
  ).toBeLessThanOrEqual(1);
}

async function getLeftPaneScrollTop(page: Page) {
  return getLeftPaneScrollSurface(page).evaluate(
    (element) => element.scrollTop,
  );
}

test("desktop v2 fixture keeps sidebar triggers inside the main header", async ({
  page,
}) => {
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
  const rightHandle = page.getByTestId("workspace-layout-v2-right-resize");
  const rightWasOpenAtStart = (await rightHandle.count()) > 0;

  if (!rightWasOpenAtStart) {
    await rightButton.click();
    await expect(rightHandle).toBeVisible();
    await rightButton.click();
    await expect(rightHandle).toHaveCount(0);
  } else {
    await expect(rightHandle).toBeVisible();
  }
});

test("desktop v2 fixture keeps pane headers fixed while bodies scroll", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < 768, "desktop-only");

  await openWorkspaceLayoutV2Fixture(page);
  await waitForMonacoSurfaceReady(
    page.getByTestId("workspace-layout-v2-main-editor-surface"),
  );

  const leftHeader = page.getByTestId("workspace-layout-v2-left-pane-header");
  const mainHeader = page.getByTestId("workspace-layout-v2-main-pane-header");
  const leftHeaderBefore = await getRoundedBoundingBox(leftHeader);
  const mainHeaderBefore = await getRoundedBoundingBox(mainHeader);
  const initialLeftScrollTop = await getLeftPaneScrollTop(page);
  const initialMainVisibleText = await getMainEditorVisibleText(page);

  await scrollLeftPaneToApproximateOffset(page, 320);
  await scrollMainEditorToApproximateOffset(page, 320);
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);

  const leftHeaderAfter = await getRoundedBoundingBox(leftHeader);
  const mainHeaderAfter = await getRoundedBoundingBox(mainHeader);

  expect(await getLeftPaneScrollTop(page)).toBeGreaterThan(
    initialLeftScrollTop,
  );
  expect(await getMainEditorVisibleText(page)).not.toBe(initialMainVisibleText);
  expect(leftHeaderAfter.y).toBe(leftHeaderBefore.y);
  expect(leftHeaderAfter.height).toBe(leftHeaderBefore.height);
  expect(mainHeaderAfter.y).toBe(mainHeaderBefore.y);
  expect(mainHeaderAfter.height).toBe(mainHeaderBefore.height);
});

test("mobile v2 fixture requires returning to main before opening right", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  const viewportWidth = viewport?.width ?? 0;
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const layout = page.locator("[data-workspace-layout-v2]");
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
  await expect(
    page.getByRole("button", { name: "Toggle Left Sidebar" }),
  ).toHaveCount(0);

  await openLeftPaneFromMain(page);
  await expect(
    page.getByTestId("workspace-layout-v2-left-resize"),
  ).toBeVisible();
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);
  await expectResizeHandleToAlignWithPaneBoundary(page, "left");

  // V2 is intentionally adjacent-only on mobile: a gesture from left can
  // return to main, but it cannot jump directly across to right.
  await swipeFromLeftTowardMain(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(
    0,
  );

  await openRightPaneFromMain(page);
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toBeVisible();
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);
  await expectResizeHandleToAlignWithPaneBoundary(page, "right");
  const rightPaneBox = await page
    .getByTestId("workspace-layout-v2-pane-right")
    .boundingBox();
  expect(rightPaneBox).not.toBeNull();
  if (rightPaneBox !== null) {
    expect(Math.round(rightPaneBox.x + rightPaneBox.width)).toBe(viewportWidth);
  }

  await swipeFromRightToMain(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(0);
});

test("mobile v2 fixture taps the exposed main strip without closing sidebars", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const layout = page.locator("[data-workspace-layout-v2]");
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");

  await openLeftPaneFromMain(page);
  await tapExposedMainStrip(page, "left");
  await expect(layout).toHaveAttribute("data-mobile-pane", "left");
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);

  await openWorkspaceLayoutV2Fixture(page);
  const refreshedLayout = page.locator("[data-workspace-layout-v2]");
  await expect(refreshedLayout).toHaveAttribute("data-mobile-pane", "main");

  await openRightPaneFromMain(page);
  await tapExposedMainStrip(page, "right");
  await expect(refreshedLayout).toHaveAttribute("data-mobile-pane", "right");
});

test("mobile v2 fixture vertical main-editor drags reveal later Monaco content", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);
  await waitForMonacoSurfaceReady(
    page.getByTestId("workspace-layout-v2-main-editor-surface"),
  );
  const initialVisibleText = await getMainEditorVisibleText(page);

  await revealLaterMainMonacoContent(page);
  expect(await getMainEditorVisibleText(page)).toContain(
    "describeWorkspaceLayoutV2",
  );
  expect(initialVisibleText).not.toContain("describeWorkspaceLayoutV2");
});

test("mobile v2 fixture vertical drags scroll the left editor pane without closing it", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const layout = page.locator("[data-workspace-layout-v2]");
  await openLeftPaneFromMain(page);

  const initialScrollTop = await getLeftPaneScrollTop(page);

  await verticalScrollLeftPane(page);
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);

  const scrolledTop = await getLeftPaneScrollTop(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "left");
  expect(scrolledTop).toBeGreaterThan(initialScrollTop + 40);
});

test("mobile v2 fixture shows the right pane after a horizontal main-editor drag", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);
  await waitForMonacoSurfaceReady(
    page.getByTestId("workspace-layout-v2-right-editor-surface"),
  );

  await swipeMainEditorToRight(page);
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);
  await waitForMonacoSurfaceReady(
    page.getByTestId("workspace-layout-v2-right-editor-surface"),
  );

  await expect(page).toHaveScreenshot(
    "workspace-layout-v2-mobile-main-editor-right-drag.png",
    {
      animations: "disabled",
      caret: "hide",
      clip: await getFixtureViewportClip(page),
      fullPage: false,
      maxDiffPixelRatio: 0.03,
      scale: "css",
    },
  );
});

test("mobile v2 fixture horizontal drags from the left editor return to main", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const layout = page.locator("[data-workspace-layout-v2]");
  await openLeftPaneFromMain(page);

  await swipeLeftEditorTowardMain(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
});
