import { expect, test, type Locator, type Page } from "@playwright/test";

async function gotoWorkspaceLayoutStatusBarFixture(page: Page) {
  await page.goto("/visual-fixture?mode=workspace-layout-v2-status-bar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function openWorkspaceLayoutStatusBarFixture(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoWorkspaceLayoutStatusBarFixture(page);

  const fixture = page.getByTestId("workspace-layout-v2-visual-fixture");
  const leftSurface = page.getByTestId("workspace-layout-v2-prosemark-surface");
  const mainSurface = page.getByTestId("workspace-layout-v2-main-editor-surface");
  const rightSurface = page.getByTestId("workspace-layout-v2-right-editor-surface");
  const mainHeader = page.getByTestId("workspace-layout-v2-main-pane-header");

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

test("workspace layout v2 fixture renders the current pane chrome", async ({ page }) => {
  const { fixture, mainHeader, mainSurface, rightSurface } =
    await openWorkspaceLayoutStatusBarFixture(page);

  await expectHeaderWithoutBottomBorder(mainHeader);

  // The wide fine-pointer main pane keeps gutter chrome; the 288px right pane
  // sheds line numbers whatever the pointer.
  await expect(mainSurface.locator(".line-numbers").first()).toBeVisible();
  await expect(rightSurface.locator(".line-numbers")).toHaveCount(0);

  await expect(fixture).toHaveScreenshot("workspace-layout-v2-status-bar.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.02,
  });
});

test.describe("workspace layout v2 touch-first phone", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("keeps mobile sidebars lightly peeked around main", async ({ page }) => {
    await gotoWorkspaceLayoutStatusBarFixture(page);
    await expectTouchFirstViewport(page, 390);

    const fixture = page.getByTestId("workspace-layout-v2-visual-fixture");
    const mainPane = page.locator("[data-workspace-layout-v2-mobile-main-pane-surface]");

    await expect(fixture).toBeVisible();
    await expect
      .poll(async () => getHorizontalSeparatorWidths(mainPane))
      .toEqual({ left: "0px", right: "0px" });
    await expect(fixture).toHaveScreenshot("workspace-layout-v2-status-bar-mobile.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe("workspace layout v2 touch-first tablet", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1024, height: 768 },
  });

  test("keeps touch editor chrome at desktop layout width", async ({ page }) => {
    await gotoWorkspaceLayoutStatusBarFixture(page);
    await expectTouchFirstViewport(page, 1024);

    const fixture = page.getByTestId("workspace-layout-v2-visual-fixture");
    const mainSurface = page.getByTestId("workspace-layout-v2-main-editor-surface");

    await expect(fixture).toBeVisible();
    await expect(mainSurface.locator(".view-lines").first()).toBeVisible();
    await expect(fixture).toHaveScreenshot("workspace-layout-v2-status-bar-wide-touch.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
    });
  });
});
