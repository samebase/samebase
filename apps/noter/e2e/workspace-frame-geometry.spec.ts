import { expect, test, type Page } from "@playwright/test";

async function getBox(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error(`Expected ${testId} to have a bounding box.`);
  }

  return box;
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

  const accountSection = await getBox(page, "fileview-layout-account-section");
  const header = await getBox(page, "fileview-layout-header");
  const rightSidebar = await getBox(page, "fileview-layout-right-sidebar-body");

  expectClose(
    accountSection.y + accountSection.height,
    header.y + header.height,
    "fileview minimal account/header divider y",
  );
  expectClose(
    header.x + header.width,
    accountSection.x,
    "fileview minimal header/sidebar divider x",
  );
  expectClose(
    accountSection.x,
    rightSidebar.x,
    "fileview minimal right sidebar x",
  );
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

  {
    const fixtureBox = await fixture.boundingBox();
    const headerBox = await header.boundingBox();

    if (fixtureBox === null || headerBox === null) {
      throw new Error("Expected fileview fixture and header boxes to exist.");
    }

    const rightSidebarBox = await rightSidebar.boundingBox();
    if (rightSidebarBox === null) {
      throw new Error("Expected the right sidebar to be measurable.");
    }

    expectClose(
      headerBox.x + headerBox.width,
      rightSidebarBox.x,
      "fileview open header/right sidebar divider x",
    );
  }

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

test("fileview mobile scrim closes the sidebar without activating the main pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bodyCounter = page.getByTestId("fileview-layout-body-counter");
  const header = page.getByTestId("fileview-layout-header");

  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeLessThanOrEqual(1);

  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(100);

  const headerBox = await header.boundingBox();
  if (headerBox === null) {
    throw new Error("Expected the main-pane header to be measurable.");
  }

  await page.mouse.click(headerBox.x + headerBox.width - 16, headerBox.y + 16);
  await expect(bodyCounter).toHaveText("0");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
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
