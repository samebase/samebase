import { devices, expect, test, type Locator } from "@playwright/test";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";
import { LANDING_MARKDOWN_PREVIEW_ROUTE } from "../src/lib/landingMarkdownPreview";

async function expectInlinePadding(locator: Locator, expectedPx: string) {
  await expect(locator).toHaveCSS("padding-left", expectedPx);
  await expect(locator).toHaveCSS("padding-right", expectedPx);
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

test("vault dashboard fixture (mobile list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
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
  await expect(fixture.getByRole("link", { name: "PR #321" })).toBeVisible();
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
  await expect(fixture.getByRole("link", { name: "PR #321" })).toBeVisible();
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

test("vault dashboard fixture (list spacing expansion)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  await page.goto("/visual-fixture.html?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("codex/quiet-mobile-frame")).toHaveCount(0);
  await page.getByRole("button", { name: "Show 2 more" }).click();

  await expect(page.getByText("codex/quiet-mobile-frame")).toBeVisible();
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
