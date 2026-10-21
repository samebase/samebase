import { expect, test, type Locator, type Page } from "@playwright/test";
import { seedVisualFixtureWorkspaceSidebarState } from "./visualFixtureTest";

/** These tests exercise the file-view sidebars, so they start with both sidebars open. */
test.beforeEach(async ({ page }) => {
  await seedVisualFixtureWorkspaceSidebarState(page, {
    leftDesktopOpen: true,
    rightDesktopOpen: true,
  });
});

function getSidebarLayoutPane(page: Page, side: "left" | "main" | "right") {
  return page.locator(`[data-sidebar-layout-part="pane"][data-pane-side="${side}"]`);
}

function getSidebarLayoutResizeHandle(page: Page, side: "left" | "right") {
  return page.locator(`[data-sidebar-layout-part="resize-handle"][data-resize-side="${side}"]`);
}

async function getBox(locator: Locator) {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error("Expected workspace layout element to have a bounding box.");
  }

  return box;
}

async function dragHorizontalHandle(page: Page, handle: Locator, deltaXPx: number) {
  const handleBox = await getBox(handle);
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaXPx, startY, {
    steps: 8,
  });
  await page.mouse.up();
}

test("fileview sidebar keeps local state across collapse", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page
    .locator('[data-sidebar-layout-part="root"]')
    .filter({ has: page.getByTestId("fileview-layout-header") });
  const header = page.getByTestId("fileview-layout-header");
  const counterButton = page.getByTestId("fileview-layout-counter-button");
  const scrollContainer = page.getByTestId("fileview-layout-sidebar-scroll");

  await counterButton.click();
  await expect(page.getByTestId("fileview-layout-counter-value")).toHaveText("1");

  await scrollContainer.evaluate((element) => {
    element.scrollTop = 180;
  });
  const scrollTopBeforeCollapse = await scrollContainer.evaluate((element) => element.scrollTop);
  expect(scrollTopBeforeCollapse).toBe(180);

  await page.getByRole("button", { name: "Toggle Left Sidebar" }).press("Enter");
  await expect
    .poll(async () => Math.round((await getBox(getSidebarLayoutPane(page, "left"))).width))
    .toBe(0);

  await page.getByRole("button", { name: "Toggle Left Sidebar" }).press("Enter");
  await expect
    .poll(async () => {
      const fixtureBox = await fixture.boundingBox();
      const headerBox = await header.boundingBox();

      if (fixtureBox === null || headerBox === null) {
        return Number.NaN;
      }

      return headerBox.x - fixtureBox.x;
    })
    .toBeGreaterThan(100);
  await expect(counterButton).toBeVisible();

  await expect
    .poll(async () => Math.round((await getBox(getSidebarLayoutPane(page, "left"))).width))
    .toBeGreaterThan(100);

  await expect(page.getByTestId("fileview-layout-counter-value")).toHaveText("1");
  await expect
    .poll(async () => scrollContainer.evaluate((element) => element.scrollTop))
    .toBe(scrollTopBeforeCollapse);
});

for (const side of ["left", "right"] as const) {
  test(`fileview desktop ${side} sidebar uses available space and preserves pane minimums`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.goto("/visual-fixture?mode=fileview-layout-persistence", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const sidebar = getSidebarLayoutPane(page, side);
    const oppositeSide = side === "left" ? "right" : "left";
    const oppositeSidebar = getSidebarLayoutPane(page, oppositeSide);
    const main = getSidebarLayoutPane(page, "main");
    const handle = getSidebarLayoutResizeHandle(page, side);
    const direction = side === "left" ? 1 : -1;
    const initialWidthPx = (await getBox(sidebar)).width;
    const oppositeWidthPx = (await getBox(oppositeSidebar)).width;
    const toggle = page.getByRole("button", {
      name: side === "left" ? "Toggle Left Sidebar" : "Toggle Right Sidebar",
    });

    await expect(handle).toBeVisible();
    await dragHorizontalHandle(page, handle, direction * (700 - initialWidthPx));
    await expect.poll(async () => (await getBox(sidebar)).width).toBe(700);
    expect((await getBox(oppositeSidebar)).width).toBe(oppositeWidthPx);

    await dragHorizontalHandle(page, handle, direction * 1000);
    await expect
      .poll(async () =>
        Promise.all(
          [sidebar, main, oppositeSidebar].map(async (pane) => (await getBox(pane)).width),
        ),
      )
      .toEqual([960, 160, 160]);
    await expect(handle).toHaveAttribute("aria-valuemax", "960");

    await handle.press(side === "left" ? "ArrowLeft" : "ArrowRight");
    await expect
      .poll(async () =>
        Promise.all(
          [sidebar, main, oppositeSidebar].map(async (pane) => (await getBox(pane)).width),
        ),
      )
      .toEqual([936, 184, 160]);
    await handle.press(side === "left" ? "ArrowRight" : "ArrowLeft");

    await toggle.click();
    await expect.poll(async () => (await getBox(sidebar)).width).toBe(0);
    await toggle.click();
    await expect.poll(async () => (await getBox(sidebar)).width).toBe(960);

    await page.setViewportSize({ width: 900, height: 760 });
    await expect
      .poll(async () =>
        Promise.all(
          [sidebar, main, oppositeSidebar].map(async (pane) => (await getBox(pane)).width),
        ),
      )
      .toEqual([580, 160, 160]);
    await page.setViewportSize({ width: 1280, height: 760 });
    await expect
      .poll(async () =>
        Promise.all(
          [sidebar, main, oppositeSidebar].map(async (pane) => (await getBox(pane)).width),
        ),
      )
      .toEqual([960, 160, 160]);

    if (side === "right") {
      await expect(page.locator('[data-sidebar-layout-part="root"]')).toHaveScreenshot(
        "desktop-right-sidebar-maximum.png",
        { animations: "disabled", caret: "hide", scale: "css" },
      );
    }

    await page
      .getByRole("button", {
        name: oppositeSide === "left" ? "Toggle Left Sidebar" : "Toggle Right Sidebar",
      })
      .click();
    await expect.poll(async () => (await getBox(oppositeSidebar)).width).toBe(0);
    await expect(handle).toHaveAttribute("aria-valuemax", "1120");
    await dragHorizontalHandle(page, handle, direction * 1000);
    await expect.poll(async () => (await getBox(sidebar)).width).toBe(1120);
    expect((await getBox(main)).width).toBe(160);
  });
}
