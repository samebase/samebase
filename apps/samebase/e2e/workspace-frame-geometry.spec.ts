import { expect, test, type Page } from "@playwright/test";

async function getBox(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error(`Expected ${testId} to have a bounding box.`);
  }

  return box;
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
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-left")).width))
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
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-left")).width))
    .toBeGreaterThan(100);

  await expect(page.getByTestId("fileview-layout-counter-value")).toHaveText("1");
  await expect
    .poll(async () => scrollContainer.evaluate((element) => element.scrollTop))
    .toBe(scrollTopBeforeCollapse);
});

test("fileview desktop left sidebar resize persists across collapse", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const leftSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const handle = page.getByTestId("workspace-layout-v2-left-resize");
  const initialWidthPx = (await getBox(page, "workspace-layout-v2-pane-left")).width;

  await expect(handle).toBeVisible();
  await dragHorizontalHandle(page, "workspace-layout-v2-left-resize", 96);
  await expect
    .poll(async () => (await getBox(page, "workspace-layout-v2-pane-left")).width)
    .toBeGreaterThan(initialWidthPx + 48);

  const resizedWidthPx = (await getBox(page, "workspace-layout-v2-pane-left")).width;
  await page.getByRole("button", { name: "Toggle Left Sidebar" }).click();
  await expect
    .poll(async () => Math.round((await getBox(page, "workspace-layout-v2-pane-left")).width))
    .toBe(0);

  await page.getByRole("button", { name: "Toggle Left Sidebar" }).click();
  await expect(leftSidebar).toBeVisible();
  await expect
    .poll(async () => (await getBox(page, "workspace-layout-v2-pane-left")).width)
    .toBeGreaterThanOrEqual(resizedWidthPx - 1);
});
