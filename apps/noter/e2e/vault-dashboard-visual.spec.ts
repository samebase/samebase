import { devices, expect, test, type Locator } from "@playwright/test";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";
import { LANDING_MARKDOWN_PREVIEW_ROUTE } from "../src/lib/landingMarkdownPreview";
import { MACHINE_CONNECT_ROUTE, MACHINES_ROUTE } from "../src/lib/noterSync";

async function expectInlinePadding(locator: Locator, expectedPx: string) {
  await expect(locator).toHaveCSS("padding-left", expectedPx);
  await expect(locator).toHaveCSS("padding-right", expectedPx);
}

async function expectElementsDoNotOverlap(first: Locator, second: Locator) {
  await expect
    .poll(async () => {
      const [firstBox, secondBox] = await Promise.all([
        first.boundingBox(),
        second.boundingBox(),
      ]);
      if (firstBox === null || secondBox === null) {
        return false;
      }

      const horizontalOverlap =
        Math.min(firstBox.x + firstBox.width, secondBox.x + secondBox.width) -
        Math.max(firstBox.x, secondBox.x);
      const verticalOverlap =
        Math.min(firstBox.y + firstBox.height, secondBox.y + secondBox.height) -
        Math.max(firstBox.y, secondBox.y);

      return horizontalOverlap <= 0 || verticalOverlap <= 0;
    })
    .toBe(true);
}

async function expectSidebarTextOwnsWrappedLine({
  iconTestId,
  row,
  textTestId,
}: {
  iconTestId: string;
  row: Locator;
  textTestId: string;
}) {
  await expect
    .poll(() =>
      row.evaluate(
        (rowElement, testIds) => {
          if (!(rowElement instanceof HTMLElement)) {
            return false;
          }

          const iconElement = rowElement.querySelector(
            `[data-testid="${testIds.iconTestId}"]`,
          );
          const textElement = rowElement.querySelector(
            `[data-testid="${testIds.textTestId}"]`,
          );
          if (
            !(iconElement instanceof HTMLElement) ||
            !(textElement instanceof HTMLElement)
          ) {
            return false;
          }

          const rowRect = rowElement.getBoundingClientRect();
          const iconRect = iconElement.getBoundingClientRect();
          const textRect = textElement.getBoundingClientRect();

          return (
            textRect.top >= iconRect.bottom - 1 &&
            Math.abs(textRect.left - rowRect.left) <= 1 &&
            Math.abs(textRect.width - rowRect.width) <= 1
          );
        },
        { iconTestId, textTestId },
      ),
    )
    .toBe(true);
}

async function expectTwoLineSidebarMetaLink(locator: Locator) {
  await expect(locator).toHaveCSS("-webkit-line-clamp", "2");
  await expect(locator).toHaveCSS("overflow-wrap", "anywhere");
}

test("vault dashboard fixture (create control)", async ({ page }) => {
  // Keep the shared dashboard shell and right-rail framing aligned with the
  // visual baselines; changing this viewport changes snapshot cropping.
  await page.setViewportSize({ width: 960, height: 760 });
  await page.goto("/visual-fixture.html?mode=vault-create-control", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(
    fixture.getByRole("button", { name: "Connect existing app" }),
  ).toHaveAttribute("href", "/add");
  await expect(fixture).toHaveScreenshot("vault-create-control.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (sidebar machine links)", async ({ page }) => {
  // Keep the shared dashboard shell and right-rail framing aligned with the
  // visual baselines; changing this viewport changes snapshot cropping.
  await page.setViewportSize({ width: 960, height: 760 });
  await page.goto("/visual-fixture.html?mode=vault-sidebar-machine-links", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expectTwoLineSidebarMetaLink(
    fixture.getByRole("link", { name: MACHINES_ROUTE, exact: true }),
  );
  await expectTwoLineSidebarMetaLink(
    fixture.getByRole("link", { name: MACHINE_CONNECT_ROUTE }),
  );
  await expectTwoLineSidebarMetaLink(
    fixture.getByRole("link", { name: LANDING_MARKDOWN_PREVIEW_ROUTE }),
  );
  await expect(
    fixture.getByRole("link", { name: LANDING_MARKDOWN_PREVIEW_ROUTE }),
  ).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-sidebar-machine-links.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (sidebar account clamp)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 760 });
  await page.goto("/visual-fixture.html?mode=vault-sidebar-account-clamp", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expectInlinePadding(
    page.getByTestId("dashboard-sidebar-account-section"),
    "4px",
  );
  await expectInlinePadding(
    page.getByTestId("dashboard-sidebar-providers-section"),
    "4px",
  );
  await expectInlinePadding(
    page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID),
    "4px",
  );
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-account-icon",
    row: page.getByTestId("dashboard-sidebar-account-row"),
    textTestId: "dashboard-sidebar-account-text",
  });
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-provider-icon",
    row: page
      .getByTestId("dashboard-sidebar-provider-row")
      .filter({ hasText: "GitHub" }),
    textTestId: "dashboard-sidebar-provider-text",
  });
  await expect(fixture).toHaveScreenshot("vault-sidebar-account-clamp.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (mobile sidebar min width)", async ({
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

  await page.goto(
    "/visual-fixture.html?mode=vault-sidebar-account-mobile-min",
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForLoadState("networkidle");

  await expect(
    page.locator("[data-workspace-layout-v2='mobile']"),
  ).toHaveAttribute("data-mobile-pane", "right");
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  await expect(rightPane).toHaveCSS("width", "96px");
  await expectInlinePadding(
    page.getByTestId("dashboard-sidebar-account-section"),
    "4px",
  );
  await expectInlinePadding(
    page.getByTestId("dashboard-sidebar-providers-section"),
    "4px",
  );
  await expectInlinePadding(
    page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID),
    "4px",
  );
  await expect
    .poll(() =>
      rightPane.evaluate((pane) => pane.scrollWidth <= pane.clientWidth),
    )
    .toBe(true);
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-account-icon",
    row: page.getByTestId("dashboard-sidebar-account-row"),
    textTestId: "dashboard-sidebar-account-text",
  });
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-provider-icon",
    row: page
      .getByTestId("dashboard-sidebar-provider-row")
      .filter({ hasText: "GitHub" }),
    textTestId: "dashboard-sidebar-provider-text",
  });

  await expect(page).toHaveScreenshot("vault-sidebar-account-mobile-min.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await context.close();
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

test("vault dashboard fixture (developer tools query spacing)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 260 });
  await page.goto(
    "/visual-fixture.html?mode=vault-dashboard-dev-tools-hidden",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const hiddenFixture = page.getByTestId("vault-dashboard-visual-fixture");
  const hiddenCard = page.getByTestId("vault-dashboard-dev-tools-card");
  await expect(
    hiddenFixture.getByRole("button", { name: "Developer tools" }),
  ).toHaveCount(0);

  const hiddenBox = await hiddenCard.boundingBox();
  expect(hiddenBox).not.toBeNull();
  if (hiddenBox === null) {
    throw new Error("Expected hidden developer tools fixture card bounds");
  }

  await expect(hiddenFixture).toHaveScreenshot(
    "vault-dashboard-dev-tools-hidden.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );

  await page.goto(
    "/visual-fixture.html?mode=vault-dashboard-dev-tools-visible",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const visibleFixture = page.getByTestId("vault-dashboard-visual-fixture");
  const visibleCard = page.getByTestId("vault-dashboard-dev-tools-card");
  await expect(
    visibleFixture.getByRole("button", { name: "Developer tools" }),
  ).toBeVisible();

  const visibleBox = await visibleCard.boundingBox();
  expect(visibleBox).not.toBeNull();
  if (visibleBox === null) {
    throw new Error("Expected visible developer tools fixture card bounds");
  }
  expect(Math.round(visibleBox.height)).toBe(Math.round(hiddenBox.height));
});

test("vault dashboard fixture (delete popover)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-delete-open", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const deleteLink = page.getByRole("link", {
    name: "Remove vault noter-md/noter",
  });
  await expect(deleteLink).toHaveAttribute("href", "/?delete=noter-md%2Fnoter");
  await expect(
    page.getByRole("button", { name: "Remove vault" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-delete-popover.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (delete mobile sheet)", async ({
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

  await page.goto("/visual-fixture.html?mode=vault-dashboard-delete-open", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("button", { name: "Remove vault" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-delete-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await context.close();
});

test("vault dashboard fixture (mobile list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault noter-md/noter",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/?delete=noter-md%2Fnoter");
  await expect(
    fixture.getByRole("link", { name: "Project settings" }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Cloudflare preview" }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Preview deploy" }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Production deploy" }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "PR #321 Use the full dashboard main pane",
    }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Edit" }).first(),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "codex/dashboard-main-pane-spacing",
    }),
  ).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-dashboard-list-spacing.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (desktop list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 360 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault noter-md/noter",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/?delete=noter-md%2Fnoter");
  await expect(
    fixture.getByRole("link", { name: "Project settings" }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Cloudflare preview" }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Preview deploy" }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Production deploy" }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "PR #321 Use the full dashboard main pane",
    }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Edit" }).first(),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "codex/dashboard-main-pane-spacing",
    }),
  ).toBeVisible();
  await expect(fixture).toHaveScreenshot(
    "vault-dashboard-list-spacing-desktop.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("vault dashboard fixture (sticky repository header)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 520 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-sticky-header", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const scrollport = page
    .getByTestId("workspace-layout-v2-main-viewport")
    .locator("section > div")
    .nth(1);
  const header = page.getByTestId("vault-dashboard-repository-header");

  await page.getByRole("button", { name: "Show 29 more" }).click();
  await scrollport.evaluate((element) => {
    element.scrollTop = 560;
  });

  await expect
    .poll(async () => {
      const [headerBox, scrollportBox] = await Promise.all([
        header.boundingBox(),
        scrollport.boundingBox(),
      ]);
      if (headerBox === null || scrollportBox === null) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.abs(headerBox.y - scrollportBox.y);
    })
    .toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("link", { name: "noter-md/noter", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("codex/sticky-dashboard-branch-05"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-sticky-header.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (list spacing expansion)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("codex/archive-doc-taxonomy")).toHaveCount(0);
  await page.getByRole("button", { name: "Show 5 more" }).click();

  await expect(page.getByText("codex/archive-doc-taxonomy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
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

  const sheet = page.locator("[data-slot='sheet-content']");
  await expectElementsDoNotOverlap(
    sheet.getByRole("button", { name: "Reset all" }),
    sheet.getByRole("button", { name: "Close" }),
  );
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
