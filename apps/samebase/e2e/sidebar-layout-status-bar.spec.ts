import { expect, test, type Locator, type Page } from "@playwright/test";

async function gotoSidebarLayoutStatusBarFixture(page: Page) {
  await page.goto("/visual-fixture?mode=sidebar-layout-status-bar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function openSidebarLayoutStatusBarFixture(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoSidebarLayoutStatusBarFixture(page);

  const leftSurface = page.getByTestId("sidebar-layout-prosemark-surface");
  const mainSurface = page.getByTestId("sidebar-layout-main-editor-surface");
  const fixture = page.locator('[data-sidebar-layout-part="root"]').filter({ has: mainSurface });
  const rightSurface = page.getByTestId("sidebar-layout-right-editor-surface");
  const mainHeader = page.locator(
    '[data-sidebar-layout-part="pane"][data-pane-side="main"] [data-sidebar-layout-part="pane-header"]',
  );

  await expect(fixture).toBeVisible();
  await expect(mainHeader).toBeVisible();
  await expect(leftSurface.locator(".cm-content")).toBeVisible();
  await expect(mainSurface.locator(".view-lines").first()).toBeVisible();
  await expect(rightSurface.locator(".view-lines").first()).toBeVisible();

  return {
    fixture,
    mainHeader,
    mainSurface,
    rightSurface,
  };
}

async function expectTouchFirstViewport(page: Page, expectedWidthPx: number) {
  expect(
    await page.evaluate(() => ({
      isCoarsePointer: window.matchMedia("(hover: none) and (pointer: coarse)").matches,
      widthPx: window.innerWidth,
    })),
  ).toEqual({
    isCoarsePointer: true,
    widthPx: expectedWidthPx,
  });
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

/**
 * Invariant: expectHeaderWithoutBottomBorder keeps the fixture headers flush
 * with their pane content so v2 chrome changes stay intentional.
 */
async function expectHeaderWithoutBottomBorder(header: Locator) {
  expect(await header.evaluate((node) => window.getComputedStyle(node).borderBottomWidth)).toBe(
    "0px",
  );
}

test("sidebar layout fixture renders the current pane chrome", async ({ page }) => {
  const { fixture, mainHeader, mainSurface, rightSurface } =
    await openSidebarLayoutStatusBarFixture(page);

  await expectHeaderWithoutBottomBorder(mainHeader);

  // The wide fine-pointer main pane keeps gutter chrome; the 288px right pane
  // sheds line numbers whatever the pointer.
  await expect(mainSurface.locator(".line-numbers").first()).toBeVisible();
  await expect(rightSurface.locator(".line-numbers")).toHaveCount(0);

  await expect(fixture).toHaveScreenshot("sidebar-layout-status-bar.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.02,
  });
});

test.describe("sidebar layout touch-first phone", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("keeps mobile sidebars lightly peeked around main", async ({ page }) => {
    await gotoSidebarLayoutStatusBarFixture(page);
    await expectTouchFirstViewport(page, 390);

    const fixture = page
      .locator('[data-sidebar-layout-part="root"]')
      .filter({ has: page.getByTestId("sidebar-layout-main-editor-surface") });
    const mainPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="main"]');

    await expect(fixture).toBeVisible();
    await expect
      .poll(async () => getHorizontalSeparatorWidths(mainPane))
      .toEqual({ left: "0px", right: "0px" });
    await expect(fixture).toHaveScreenshot("sidebar-layout-status-bar-mobile.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe("sidebar layout touch-first tablet", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1024, height: 768 },
  });

  test("keeps touch editor chrome at desktop layout width", async ({ page }) => {
    await gotoSidebarLayoutStatusBarFixture(page);
    await expectTouchFirstViewport(page, 1024);

    const mainSurface = page.getByTestId("sidebar-layout-main-editor-surface");
    const fixture = page.locator('[data-sidebar-layout-part="root"]').filter({
      has: mainSurface,
    });

    await expect(fixture).toBeVisible();
    await expect(mainSurface.locator(".view-lines").first()).toBeVisible();
    await expect(fixture).toHaveScreenshot("sidebar-layout-status-bar-wide-touch.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
    });
  });
});
