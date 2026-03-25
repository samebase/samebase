import { devices, expect, test, type Page } from "@playwright/test";

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
  tolerance = 1.5,
) {
  expect(
    Math.abs(actual - expected),
    `${description}: expected ${actual} to be within ${tolerance}px of ${expected}`,
  ).toBeLessThanOrEqual(tolerance);
}

test("vault dashboard fixture (shared sidebar)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=dashboard-shared-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-dashboard-shared-sidebar.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture grid lines stay aligned", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=dashboard-shared-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const sidebarHeader = await getBox(page, "dashboard-layout-sidebar-header");
  const sidebarContent = await getBox(page, "dashboard-layout-sidebar-content");
  const header = await getBox(page, "dashboard-layout-header");
  const body = await getBox(page, "dashboard-layout-body");

  const sidebarDividerX = sidebarHeader.x + sidebarHeader.width;
  const headerDividerY = header.y + header.height;

  expectClose(sidebarHeader.height, header.height, "header row heights");
  expectClose(sidebarDividerX, header.x, "sidebar/header divider x");
  expectClose(sidebarDividerX, body.x, "sidebar/body divider x");
  expectClose(headerDividerY, sidebarContent.y, "left lower row start");
  expectClose(headerDividerY, body.y, "right lower row start");
  expectClose(sidebarHeader.x, sidebarContent.x, "left column x");
  expectClose(sidebarHeader.width, sidebarContent.width, "left column width");
});

test("vault dashboard fixture (shared sidebar narrow)", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 760 });
  await page.goto("/visual-fixture.html?mode=dashboard-shared-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot(
    "vault-dashboard-shared-sidebar-narrow.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("vault dashboard fixture (mobile chat dock)", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-chat",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot(
    "vault-dashboard-shared-sidebar-mobile-chat.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("vault dashboard fixture (branch PR labels)", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 180 });
  await page.goto("/visual-fixture.html?mode=vault-branch-pr-labels", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-branch-pr-labels.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (branch filters popover)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto("/visual-fixture.html?mode=vault-branch-filters", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  await expect(page).toHaveScreenshot("vault-branch-filters-popover.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (branch filters mobile sheet)", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for mobile fixture tests.");
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
  });
  const page = await context.newPage();

  await page.goto("/visual-fixture.html?mode=vault-branch-filters", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  await expect(page).toHaveScreenshot("vault-branch-filters-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await context.close();
});

test("vault dashboard fixture (mobile branch alignment)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=vault-branch-mobile-alignment", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-branch-mobile-alignment.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
