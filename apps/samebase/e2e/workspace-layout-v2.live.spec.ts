import { expect, test, type Locator, type Page } from "@playwright/test";

const WORKSPACE_LAYOUT_V2_STATUS_BAR_FIXTURE_URL =
  "/visual-fixture?mode=workspace-layout-v2-status-bar";

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

async function getMobileSeparatorEdges(layout: Locator) {
  return layout
    .locator("[data-workspace-layout-v2-mobile-separator]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-workspace-layout-v2-mobile-separator") ?? ""),
    );
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

test("mobile v2 fixture keeps one layout-owned separator per adjacent pane edge", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const layout = page.locator("[data-workspace-layout-v2]");
  await expect(page.locator("[data-workspace-layout-v2-mobile-separator-pane]")).toHaveCount(0);

  await scrollWorkspaceCarouselToPane(page, "left");
  await expect(layout).toHaveAttribute("data-mobile-pane", "left");
  await expect
    .poll(async () => getMobileSeparatorEdges(layout))
    .toEqual(["left-main", "main-right"]);

  await scrollWorkspaceCarouselToPane(page, "main");
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
  await expect
    .poll(async () => getMobileSeparatorEdges(layout))
    .toEqual(["left-main", "main-right"]);

  await scrollWorkspaceCarouselToPane(page, "right");
  await expect(layout).toHaveAttribute("data-mobile-pane", "right");
  await expect
    .poll(async () => getMobileSeparatorEdges(layout))
    .toEqual(["left-main", "main-right"]);
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
