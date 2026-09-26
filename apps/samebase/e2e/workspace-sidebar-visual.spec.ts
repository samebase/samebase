import { devices, expect, test, type Page } from "@playwright/test";
import { seedVisualFixtureWorkspaceSidebarState } from "./visualFixtureTest";

/** These tests exercise the file-view sidebars, so they start with both sidebars open. */
test.beforeEach(async ({ page }) => {
  await seedVisualFixtureWorkspaceSidebarState(page, {
    leftDesktopOpen: true,
    rightDesktopOpen: true,
  });
});

const { defaultBrowserType: _pixel7BrowserType, ...pixel7Device } = devices["Pixel 7"];

async function gotoFileViewFixture(page: Page) {
  await page.goto("/visual-fixture?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function scrollFileViewCarouselToPane(page: Page, pane: "left" | "main" | "right") {
  await page.locator('[data-sidebar-layout-part="carousel"]').evaluate((element, nextPane) => {
    const paneIndex = nextPane === "left" ? 0 : nextPane === "main" ? 1 : 2;
    element.scrollLeft = element.clientWidth * paneIndex;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, pane);

  await expect(page.locator("[data-mobile-pane]").first()).toHaveAttribute(
    "data-mobile-pane",
    pane,
  );
}

async function getFixtureViewportClip(page: Page) {
  const fixture = page
    .locator('[data-sidebar-layout-part="root"]')
    .filter({ has: page.getByTestId("fileview-layout-header") });
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Expected fileview layout fixture bounds for screenshot clip");
  }

  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(Math.min(bounds.height, page.viewportSize()?.height ?? 0)),
  };
}

test("fileview desktop shell with left tree", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page
    .locator('[data-sidebar-layout-part="root"]')
    .filter({ has: page.getByTestId("fileview-layout-header") });
  const pathTitle = page.getByTestId("fileview-layout-header").getByText("/", { exact: true });
  await expect(pathTitle).toBeVisible();

  await expect(fixture).toHaveScreenshot("fileview-layout-shell-left-tree.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await page.setViewportSize({ width: 1100, height: 760 });
  await expect(pathTitle).toBeHidden();
});

test("fileview narrow fine-pointer shell uses an edge resize handle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoFileViewFixture(page);

  expect(
    await page.evaluate(
      () => window.matchMedia("(any-hover: hover) and (any-pointer: fine)").matches,
    ),
  ).toBe(true);

  await scrollFileViewCarouselToPane(page, "left");

  const layout = page.locator('[data-sidebar-layout-part="viewport"]');
  const carousel = page.locator('[data-sidebar-layout-part="carousel"]');
  const leftHandle = page.locator(
    '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
  );

  await expect(carousel).toHaveCSS("scroll-snap-type", "x mandatory");
  await expect(leftHandle).toHaveCSS("cursor", "col-resize");
  await expect(
    leftHandle.locator('[data-sidebar-layout-part="resize-grip-indicator"]'),
  ).toHaveCount(0);

  await expect(page).toHaveScreenshot("fileview-layout-narrow-fine-pointer-sidebar-open.png", {
    animations: "disabled",
    caret: "hide",
    clip: await getFixtureViewportClip(page),
    fullPage: false,
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  const handleBounds = await leftHandle.boundingBox();
  expect(handleBounds).not.toBeNull();
  if (handleBounds === null) {
    throw new Error("Expected a narrow fine-pointer resize handle.");
  }

  const handleCenterY = handleBounds.y + handleBounds.height / 2;
  await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleCenterY);
  await page.mouse.down();
  await page.mouse.move(8, handleCenterY, { steps: 8 });
  await page.mouse.up();

  await expect(layout).toHaveAttribute("data-sidebar-layout-mobile-merged-side", "left");
});

test.describe("fileview mobile", () => {
  test.use({
    ...pixel7Device,
  });

  test("carousel keeps the visible main surface unobscured when the right pane is open", async ({
    page,
  }) => {
    await gotoFileViewFixture(page);

    const header = page.getByTestId("fileview-layout-header");

    await scrollFileViewCarouselToPane(page, "right");

    await expect(page.getByTestId("workspace-sidebar-main-scrim")).toHaveCount(0);
    await expect(page.getByTestId("fileview-layout-body-button")).toBeVisible();
    await expect
      .poll(async () =>
        header.evaluate((element) => window.getComputedStyle(element).scrollSnapStop),
      )
      .toBe("always");

    await expect(page).toHaveScreenshot("fileview-layout-mobile-sidebar-open.png", {
      animations: "disabled",
      caret: "hide",
      clip: await getFixtureViewportClip(page),
      fullPage: false,
      scale: "css",
      maxDiffPixelRatio: 0.03,
    });
  });
});
