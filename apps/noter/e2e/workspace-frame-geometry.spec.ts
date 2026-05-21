import { expect, test, type Page } from "@playwright/test";

async function getBox(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error(`Expected ${testId} to have a bounding box.`);
  }

  return box;
}

async function swipeFromMainToRightSidebar(page: Page) {
  await page.getByTestId("workspace-layout-v2-pane-main").evaluate((element) => {
    element.scrollLeft = element.clientWidth * 2;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

function getFileViewLayoutShell(page: Page) {
  return page.locator("[data-mobile-pane]").first();
}

async function dragHorizontalHandle(page: Page, testId: string, deltaXPx: number) {
  const handleBox = await getBox(page, testId);
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

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const header = page.getByTestId("fileview-layout-header");
  const counterButton = page.getByTestId("fileview-layout-counter-button");
  const rightSidebar = page.getByTestId("fileview-layout-right-sidebar-body");
  const scrollContainer = page.getByTestId("fileview-layout-sidebar-scroll");

  await counterButton.click();
  await expect(page.getByTestId("fileview-layout-counter-value")).toHaveText("1");

  await scrollContainer.evaluate((element) => {
    element.scrollTop = 180;
  });
  const scrollTopBeforeCollapse = await scrollContainer.evaluate((element) => element.scrollTop);
  expect(scrollTopBeforeCollapse).toBe(180);

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).press("Enter");
  await expect
    .poll(async () => {
      const fixtureBox = await fixture.boundingBox();
      const headerBox = await header.boundingBox();
      const toggleButtonBox = await page
        .getByRole("button", { name: "Toggle Right Sidebar" })
        .boundingBox();

      if (fixtureBox === null || headerBox === null || toggleButtonBox === null) {
        return Number.NaN;
      }

      return Math.abs(
        fixtureBox.x +
          fixtureBox.width -
          (headerBox.x + headerBox.width) -
          (toggleButtonBox.width + 8),
      );
    })
    .toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).press("Enter");
  await expect
    .poll(async () => {
      const fixtureBox = await fixture.boundingBox();
      const headerBox = await header.boundingBox();

      if (fixtureBox === null || headerBox === null) {
        return Number.NaN;
      }

      return fixtureBox.x + fixtureBox.width - (headerBox.x + headerBox.width);
    })
    .toBeGreaterThan(100);
  await expect(counterButton).toBeVisible();

  await expect
    .poll(async () => {
      const headerBox = await header.boundingBox();
      const rightSidebarBox = await rightSidebar.boundingBox();
      const toggleButtonBox = await page
        .getByRole("button", { name: "Toggle Right Sidebar" })
        .boundingBox();

      if (headerBox === null || rightSidebarBox === null || toggleButtonBox === null) {
        return Number.NaN;
      }

      return Math.abs(
        rightSidebarBox.x - (headerBox.x + headerBox.width) - (toggleButtonBox.width + 8),
      );
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => {
      const headerBox = await header.boundingBox();
      const rightSidebarBox = await rightSidebar.boundingBox();

      if (headerBox === null || rightSidebarBox === null) {
        return Number.NaN;
      }

      return Math.abs(headerBox.y + headerBox.height - rightSidebarBox.y);
    })
    .toBeLessThanOrEqual(1);

  await expect(page.getByTestId("fileview-layout-counter-value")).toHaveText("1");
  await expect
    .poll(async () => scrollContainer.evaluate((element) => element.scrollTop))
    .toBe(scrollTopBeforeCollapse);
});

test("fileview right sidebar collapses independently", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const header = page.getByTestId("fileview-layout-header");
  const rightSidebar = page.getByTestId("fileview-layout-right-sidebar-body");

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(rightSidebar).toBeHidden();
  await expect
    .poll(async () => {
      const fixtureBox = await fixture.boundingBox();
      const headerBox = await header.boundingBox();
      const toggleButtonBox = await page
        .getByRole("button", { name: "Toggle Right Sidebar" })
        .boundingBox();

      if (fixtureBox === null || headerBox === null || toggleButtonBox === null) {
        return Number.NaN;
      }

      return Math.abs(
        fixtureBox.x +
          fixtureBox.width -
          (headerBox.x + headerBox.width) -
          (toggleButtonBox.width + 8),
      );
    })
    .toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(rightSidebar).toBeVisible();
  await expect
    .poll(async () => {
      const fixtureBox = await fixture.boundingBox();
      const headerBox = await header.boundingBox();

      if (fixtureBox === null || headerBox === null) {
        return Number.NaN;
      }

      return fixtureBox.x + fixtureBox.width - (headerBox.x + headerBox.width);
    })
    .toBeGreaterThan(100);
});

test("fileview desktop right sidebar resize persists across collapse", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const rightSidebar = page.getByTestId("fileview-layout-right-sidebar-body");
  const handle = page.getByTestId("workspace-layout-v2-right-resize");
  const initialWidthPx = (await getBox(page, "fileview-layout-right-sidebar-body")).width;

  await expect(handle).toBeVisible();
  await dragHorizontalHandle(page, "workspace-layout-v2-right-resize", -96);
  await expect
    .poll(async () => (await getBox(page, "fileview-layout-right-sidebar-body")).width)
    .toBeGreaterThan(initialWidthPx + 48);

  const resizedWidthPx = (await getBox(page, "fileview-layout-right-sidebar-body")).width;
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(rightSidebar).toBeHidden();

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(rightSidebar).toBeVisible();
  await expect
    .poll(async () => (await getBox(page, "fileview-layout-right-sidebar-body")).width)
    .toBeGreaterThanOrEqual(resizedWidthPx - 1);
});

test("fileview mobile swipe opens the right sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const shell = getFileViewLayoutShell(page);
  await swipeFromMainToRightSidebar(page);
  await expect(shell).toHaveAttribute("data-mobile-pane", "right");
});
