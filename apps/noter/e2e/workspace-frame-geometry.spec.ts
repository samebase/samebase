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
});

test("fileview minimal frame lines stay aligned", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const accountSection = await getBox(page, "fileview-layout-account-section");
  const header = await getBox(page, "fileview-layout-header");

  expectClose(
    accountSection.y + accountSection.height,
    header.y + header.height,
    "fileview minimal account/header divider y",
  );
  expectClose(
    accountSection.x + accountSection.width,
    header.x,
    "fileview minimal sidebar/header divider x",
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
  const scrollContainer = page.getByTestId("fileview-layout-sidebar-scroll");

  await page.getByTestId("fileview-layout-counter-button").click();
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

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
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

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
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

  {
    const fixtureBox = await fixture.boundingBox();
    const headerBox = await header.boundingBox();

    if (fixtureBox === null || headerBox === null) {
      throw new Error("Expected fileview fixture and header boxes to exist.");
    }

    expectClose(
      headerBox.x + headerBox.width,
      fixtureBox.x + fixtureBox.width,
      "fileview open header right edge",
    );
  }

  await expect(page.getByTestId("fileview-layout-counter-value")).toHaveText(
    "1",
  );
  await expect
    .poll(async () => scrollContainer.evaluate((element) => element.scrollTop))
    .toBe(scrollTopBeforeCollapse);
});

test("fileview mobile main click closes the sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const body = page.getByTestId("fileview-layout-body");

  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(100);

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeLessThanOrEqual(1);

  await body.click({ position: { x: 100, y: 120 } });
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(100);
});
