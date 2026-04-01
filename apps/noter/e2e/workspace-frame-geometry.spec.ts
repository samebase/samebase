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

test("dashboard minimal frame lines stay aligned", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=dashboard-layout-minimal", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const accountSection = await getBox(page, "dashboard-layout-account-section");
  const header = await getBox(page, "dashboard-layout-header");
  const sidebarContent = await getBox(page, "dashboard-layout-sidebar-content");
  const rightSidebarContent = await getBox(
    page,
    "dashboard-layout-right-sidebar-content",
  );
  const body = await getBox(page, "dashboard-layout-body");

  expectClose(
    accountSection.y + accountSection.height,
    header.y + header.height,
    "dashboard minimal account/header divider y",
  );
  expectClose(
    accountSection.x + accountSection.width,
    header.x,
    "dashboard minimal sidebar/header divider x",
  );
  expectClose(
    accountSection.x + accountSection.width,
    body.x,
    "dashboard minimal sidebar/body divider x",
  );
  expectClose(
    accountSection.y + accountSection.height,
    sidebarContent.y,
    "dashboard minimal left column lower row start",
  );
  expectClose(
    header.y + header.height,
    body.y,
    "dashboard minimal right column lower row start",
  );
  expectClose(
    body.y,
    rightSidebarContent.y,
    "dashboard minimal right sidebar lower row start",
  );
  expectClose(
    header.x + header.width,
    rightSidebarContent.x,
    "dashboard minimal header/right sidebar divider x",
  );
  expectClose(
    body.x + body.width,
    rightSidebarContent.x,
    "dashboard minimal body/right sidebar divider x",
  );
});

test("dashboard shared sidebar lines stay aligned", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=dashboard-shared-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const accountSection = await getBox(page, "dashboard-layout-account-section");
  const header = await getBox(page, "dashboard-layout-header");
  const sidebarContent = await getBox(page, "dashboard-layout-sidebar-content");
  const rightSidebarContent = await getBox(
    page,
    "dashboard-layout-right-sidebar-content",
  );
  const body = await getBox(page, "dashboard-layout-body");

  expectClose(
    accountSection.y + accountSection.height,
    header.y + header.height,
    "dashboard shared account/header divider y",
  );
  expectClose(
    accountSection.x + accountSection.width,
    header.x,
    "dashboard shared sidebar/header divider x",
  );
  expectClose(
    accountSection.x + accountSection.width,
    body.x,
    "dashboard shared sidebar/body divider x",
  );
  expectClose(
    accountSection.y + accountSection.height,
    sidebarContent.y,
    "dashboard shared left column lower row start",
  );
  expectClose(
    header.y + header.height,
    body.y,
    "dashboard shared right column lower row start",
  );
  expectClose(
    body.y,
    rightSidebarContent.y,
    "dashboard shared right sidebar lower row start",
  );
  expectClose(
    header.x + header.width,
    rightSidebarContent.x,
    "dashboard shared header/right sidebar divider x",
  );
  expectClose(
    body.x + body.width,
    rightSidebarContent.x,
    "dashboard shared body/right sidebar divider x",
  );
});

test("fileview minimal frame lines stay aligned", async ({ page }) => {
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
  await expect(counterButton).toBeHidden();

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
  const handle = page.getByTestId("workspace-sidebar-right-resize-handle");
  const initialWidthPx = (
    await getBox(page, "fileview-layout-right-sidebar-body")
  ).width;

  await expect(handle).toBeVisible();
  await dragHorizontalHandle(
    page,
    "workspace-sidebar-right-resize-handle",
    -96,
  );
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

test("fileview empty left sidebar opens independently", async ({ page }) => {
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

  await expect(accountSection).toBeHidden();
  await expect(leftSidebar).toBeHidden();
  await expect(rightSidebar).toBeVisible();
  await expect(openUserMenuButton).toBeHidden();

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
  await expect(accountSection).toBeHidden();
  await expect(leftSidebar).toBeHidden();
  await expect(openUserMenuButton).toBeHidden();
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

test("fileview mobile main-pane taps close the sidebar and reach the main pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bodyButton = page.getByTestId("fileview-layout-body-button");
  const bodyCounter = page.getByTestId("fileview-layout-body-counter");
  const initialScrollLeft = await fixture.evaluate(
    (element) => element.scrollLeft,
  );

  expect(initialScrollLeft).toBeGreaterThan(100);

  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(initialScrollLeft);
  await bodyButton.click();
  await expect(bodyCounter).toHaveText("1");
  await expect
    .poll(async () =>
      Math.abs(
        (await fixture.evaluate((element) => element.scrollLeft)) -
          initialScrollLeft,
      ),
    )
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
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(100);
});

test("fileview mobile keeps a far cross-swipe on the far pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");

  await page
    .getByRole("button", { name: "Toggle Left Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeLessThanOrEqual(1);
  await expect(fixture).toHaveAttribute("data-mobile-pane", "left");

  await fixture.evaluate((element) => {
    element.style.scrollSnapType = "none";
    const pannableTrack = element.querySelector<HTMLElement>(
      '[data-sidebar-track="pannable"]',
    );
    if (pannableTrack === null) {
      throw new Error("Expected the mobile pannable track to exist");
    }

    const leftSidebar = element.querySelector<HTMLElement>(
      '[data-testid="fileview-layout-left-sidebar-body"]',
    );
    if (leftSidebar === null) {
      throw new Error(
        "Expected the left sidebar body to exist for the cross-swipe test",
      );
    }

    const rightSidebar = element.querySelector<HTMLElement>(
      '[data-testid="fileview-layout-right-sidebar-body"]',
    );
    if (rightSidebar === null) {
      throw new Error(
        "Expected the right sidebar body to exist for the cross-swipe test",
      );
    }

    pannableTrack.style.setProperty("scroll-snap-type", "none");
    const leftSidebarWidth = leftSidebar.getBoundingClientRect().width;
    const rightSidebarWidth = rightSidebar.getBoundingClientRect().width;
    const deepCrossSwipeScrollLeft =
      leftSidebarWidth + rightSidebarWidth * 0.75;
    element.scrollLeft = deepCrossSwipeScrollLeft;
    element.dispatchEvent(new Event("scroll"));
    element.dispatchEvent(new Event("scrollend"));
  });
  await expect(fixture).toHaveAttribute("data-mobile-pane", "right");
});
