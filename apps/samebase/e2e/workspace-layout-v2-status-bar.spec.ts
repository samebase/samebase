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
  const { fixture, mainHeader } = await openWorkspaceLayoutStatusBarFixture(page);

  await expectHeaderWithoutBottomBorder(mainHeader);

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

    await expect(fixture).toBeVisible();
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
