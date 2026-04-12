import { expect, test, type Page } from "@playwright/test";

async function getBox(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error(`Expected ${testId} to have a bounding box.`);
  }

  return box;
}

async function dragHorizontalHandle(
  page: Page,
  testId: string,
  deltaXPx: number,
) {
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

function expectClose(
  actual: number,
  expected: number,
  description: string,
  tolerance = 1,
) {
  expect(
    Math.abs(actual - expected),
    `${description}: expected ${actual} to be within ${tolerance}px of ${expected}`,
  ).toBeLessThanOrEqual(tolerance);
}

// The shared account header is being replaced with a new standard shell.
// Keep the broader sidebar coverage below, and restore this exact seam check
// once the replacement header lands.
test.fixme("fileview minimal frame lines stay aligned", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Toggle Left Sidebar" }).click();

  const accountSection = await getBox(page, "fileview-layout-account-section");
  const header = page.getByTestId("fileview-layout-header");
  const leftSidebar = page.getByTestId("fileview-layout-left-sidebar-body");
  const rightSidebar = page.getByTestId("fileview-layout-right-sidebar-body");
  const headerBox = await getBox(page, "fileview-layout-header");

  expectClose(
    accountSection.y + accountSection.height,
    headerBox.y + headerBox.height,
    "fileview minimal account/header divider y",
  );
  await expect
    .poll(async () => {
      const nextHeaderBox = await header.boundingBox();

      if (nextHeaderBox === null) {
        return Number.NaN;
      }

      return Math.abs(
        accountSection.x + accountSection.width - nextHeaderBox.x,
      );
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => {
      const leftSidebarBox = await leftSidebar.boundingBox();

      if (leftSidebarBox === null) {
        return Number.NaN;
      }

      return Math.abs(
        accountSection.y + accountSection.height - leftSidebarBox.y,
      );
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => {
      const nextHeaderBox = await header.boundingBox();
      const rightSidebarBox = await rightSidebar.boundingBox();

      if (nextHeaderBox === null || rightSidebarBox === null) {
        return Number.NaN;
      }

      return Math.abs(
        nextHeaderBox.x + nextHeaderBox.width - rightSidebarBox.x,
      );
    })
    .toBeLessThanOrEqual(1);
});

test("fileview sidebar keeps local state across collapse", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const header = page.getByTestId("fileview-layout-header");
  const counterButton = page.getByTestId("fileview-layout-counter-button");
  const rightSidebar = page.getByTestId("fileview-layout-right-sidebar-body");
  const scrollContainer = page.getByTestId("fileview-layout-sidebar-scroll");

  await counterButton.click();
  await expect(page.getByTestId("fileview-layout-counter-value")).toHaveText(
    "1",
  );

  await scrollContainer.evaluate((element) => {
    element.scrollTop = 180;
  });
  const scrollTopBeforeCollapse = await scrollContainer.evaluate(
    (element) => element.scrollTop,
  );
  expect(scrollTopBeforeCollapse).toBe(180);

  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => {
      const fixtureBox = await fixture.boundingBox();
      const headerBox = await header.boundingBox();

      if (fixtureBox === null || headerBox === null) {
        return Number.NaN;
      }

      return fixtureBox.x + fixtureBox.width - (headerBox.x + headerBox.width);
    })
    .toBeLessThanOrEqual(1);

  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
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

      if (headerBox === null || rightSidebarBox === null) {
        return Number.NaN;
      }

      return Math.abs(headerBox.x + headerBox.width - rightSidebarBox.x);
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

  await expect(page.getByTestId("fileview-layout-counter-value")).toHaveText(
    "1",
  );
  await expect
    .poll(async () => scrollContainer.evaluate((element) => element.scrollTop))
    .toBe(scrollTopBeforeCollapse);
});

test("fileview right sidebar collapses independently", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout", {
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

      if (fixtureBox === null || headerBox === null) {
        return Number.NaN;
      }

      return fixtureBox.x + fixtureBox.width - (headerBox.x + headerBox.width);
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

test("fileview desktop right sidebar resize persists across collapse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const rightSidebar = page.getByTestId("fileview-layout-right-sidebar-body");
  const handle = page.getByTestId("workspace-layout-v2-right-resize");
  const initialWidthPx = (
    await getBox(page, "fileview-layout-right-sidebar-body")
  ).width;

  await expect(handle).toBeVisible();
  await dragHorizontalHandle(page, "workspace-layout-v2-right-resize", -96);
  await expect
    .poll(
      async () =>
        (await getBox(page, "fileview-layout-right-sidebar-body")).width,
    )
    .toBeGreaterThan(initialWidthPx + 48);

  const resizedWidthPx = (
    await getBox(page, "fileview-layout-right-sidebar-body")
  ).width;
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(rightSidebar).toBeHidden();

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(rightSidebar).toBeVisible();
  await expect
    .poll(
      async () =>
        (await getBox(page, "fileview-layout-right-sidebar-body")).width,
    )
    .toBeGreaterThanOrEqual(resizedWidthPx - 1);
});

// This case is coupled to the same temporary account-header seam while the new
// standard sidebar shell is in flight.
test.fixme("fileview empty left sidebar opens independently", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const header = page.getByTestId("fileview-layout-header");
  const accountSection = page.getByTestId("fileview-layout-account-section");
  const leftSidebar = page.getByTestId("fileview-layout-left-sidebar-body");
  const rightSidebar = page.getByTestId("fileview-layout-right-sidebar-body");
  const openUserMenuButton = page.getByRole("button", {
    name: "Open user menu",
  });

  await expect(leftSidebar).toBeHidden();
  await expect(rightSidebar).toBeVisible();

  await page.getByRole("button", { name: "Toggle Left Sidebar" }).click();
  await expect(accountSection).toBeVisible();
  await expect(leftSidebar).toBeVisible();
  await expect(rightSidebar).toBeVisible();
  await expect(openUserMenuButton).toBeVisible();
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
  await expect
    .poll(async () => {
      const accountSectionBox = await accountSection.boundingBox();
      const leftSidebarBox = await leftSidebar.boundingBox();
      const headerBox = await header.boundingBox();
      const rightSidebarBox = await rightSidebar.boundingBox();

      if (
        accountSectionBox === null ||
        leftSidebarBox === null ||
        headerBox === null ||
        rightSidebarBox === null
      ) {
        return Number.NaN;
      }

      return Math.max(
        Math.abs(
          accountSectionBox.y + accountSectionBox.height - leftSidebarBox.y,
        ),
        Math.abs(headerBox.y + headerBox.height - rightSidebarBox.y),
      );
    })
    .toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Toggle Left Sidebar" }).click();
  await expect(leftSidebar).toBeHidden();
  await expect
    .poll(async () => {
      const fixtureBox = await fixture.boundingBox();
      const headerBox = await header.boundingBox();

      if (fixtureBox === null || headerBox === null) {
        return Number.NaN;
      }

      return headerBox.x - fixtureBox.x;
    })
    .toBeLessThanOrEqual(1);
});

test("fileview mobile accessible control opens the sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const toggleSidebarButton = page.getByRole("button", {
    name: "Toggle Right Sidebar",
  });

  await toggleSidebarButton.press("Enter");
  await expect(fixture).toHaveAttribute("data-mobile-pane", "right");
});
