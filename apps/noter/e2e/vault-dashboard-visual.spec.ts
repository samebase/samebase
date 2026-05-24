import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";

async function expectInlinePadding(locator: Locator, expectedPx: string) {
  await expect(locator).toHaveCSS("padding-left", expectedPx);
  await expect(locator).toHaveCSS("padding-right", expectedPx);
}

async function expectElementsDoNotOverlap(first: Locator, second: Locator) {
  await expect
    .poll(async () => {
      const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
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

async function expectOptionalCheckboxUnchecked(locator: Locator) {
  if ((await locator.count()) === 0) {
    return;
  }
  await expect(locator).not.toBeChecked();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

/**
 * expectElementInsideContainer checks boundingBox containment with 1px of
 * tolerance for sub-pixel layout rounding; missing boxes fail closed.
 */
async function expectElementInsideContainer(element: Locator, container: Locator) {
  await expect
    .poll(async () => {
      const [elementBox, containerBox] = await Promise.all([
        element.boundingBox(),
        container.boundingBox(),
      ]);
      if (elementBox === null || containerBox === null) {
        return false;
      }

      return (
        elementBox.x >= containerBox.x - 1 &&
        elementBox.y >= containerBox.y - 1 &&
        elementBox.x + elementBox.width <= containerBox.x + containerBox.width + 1 &&
        elementBox.y + elementBox.height <= containerBox.y + containerBox.height + 1
      );
    })
    .toBe(true);
}

/**
 * expectElementInsideViewportInline checks that an element fits inside the
 * viewport with the 16px inline margin used by mobile dialogs. It allows 1px
 * of tolerance for sub-pixel layout rounding; missing boxes fail closed.
 */
async function expectElementInsideViewportInline(page: Page, element: Locator) {
  const [box, viewportWidth] = await Promise.all([
    element.boundingBox(),
    page.evaluate(() => document.documentElement.clientWidth),
  ]);

  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error("Expected element bounds");
  }

  expect(box.width).toBeLessThanOrEqual(viewportWidth - 32 + 1);
  expect(box.x).toBeGreaterThanOrEqual(16 - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth - 16 + 1);
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

          const iconElement = rowElement.querySelector(`[data-testid="${testIds.iconTestId}"]`);
          const textElement = rowElement.querySelector(`[data-testid="${testIds.textTestId}"]`);
          if (!(iconElement instanceof HTMLElement) || !(textElement instanceof HTMLElement)) {
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
  await page.goto("/visual-fixture?mode=vault-create-control", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture.getByRole("button", { name: "Connect existing app" })).toHaveAttribute(
    "href",
    "/add",
  );
  await expect(fixture).toHaveScreenshot("vault-create-control.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (sidebar account clamp)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 760 });
  await page.goto("/visual-fixture?mode=vault-sidebar-account-clamp", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expectInlinePadding(page.getByTestId("dashboard-sidebar-account-section"), "4px");
  await expectInlinePadding(page.getByTestId("dashboard-sidebar-providers-section"), "4px");
  await expectInlinePadding(page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID), "4px");
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-account-icon",
    row: page.getByTestId("dashboard-sidebar-account-row"),
    textTestId: "dashboard-sidebar-account-text",
  });
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-provider-icon",
    row: page.getByTestId("dashboard-sidebar-provider-row").filter({ hasText: "GitHub" }),
    textTestId: "dashboard-sidebar-provider-text",
  });
  await expect(fixture).toHaveScreenshot("vault-sidebar-account-clamp.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (mobile sidebar min width)", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for mobile fixture tests.");
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  await page.goto("/visual-fixture?mode=vault-sidebar-account-mobile-min", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.locator("[data-workspace-layout-v2='mobile']")).toHaveAttribute(
    "data-mobile-pane",
    "right",
  );
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  await expect(rightPane).toHaveCSS("width", "96px");
  await expectInlinePadding(page.getByTestId("dashboard-sidebar-account-section"), "4px");
  await expectInlinePadding(page.getByTestId("dashboard-sidebar-providers-section"), "4px");
  await expectInlinePadding(page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID), "4px");
  await expect
    .poll(() => rightPane.evaluate((pane) => pane.scrollWidth <= pane.clientWidth))
    .toBe(true);
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-account-icon",
    row: page.getByTestId("dashboard-sidebar-account-row"),
    textTestId: "dashboard-sidebar-account-text",
  });
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-provider-icon",
    row: page.getByTestId("dashboard-sidebar-provider-row").filter({ hasText: "GitHub" }),
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
  await page.goto("/visual-fixture?mode=vault-branch-pr-labels", {
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

test("vault dashboard fixture (developer tools query spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 260 });
  await page.goto("/visual-fixture?mode=vault-dashboard-dev-tools-hidden", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const hiddenFixture = page.getByTestId("vault-dashboard-visual-fixture");
  const hiddenCard = page.getByTestId("vault-dashboard-dev-tools-card");
  await expect(hiddenFixture.getByRole("button", { name: "Developer tools" })).toHaveCount(0);

  const hiddenBox = await hiddenCard.boundingBox();
  expect(hiddenBox).not.toBeNull();
  if (hiddenBox === null) {
    throw new Error("Expected hidden developer tools fixture card bounds");
  }

  await expect(hiddenFixture).toHaveScreenshot("vault-dashboard-dev-tools-hidden.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await page.goto("/visual-fixture?mode=vault-dashboard-dev-tools-visible", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const visibleFixture = page.getByTestId("vault-dashboard-visual-fixture");
  const visibleCard = page.getByTestId("vault-dashboard-dev-tools-card");
  await expect(visibleFixture.getByRole("button", { name: "Developer tools" })).toBeVisible();

  const visibleBox = await visibleCard.boundingBox();
  expect(visibleBox).not.toBeNull();
  if (visibleBox === null) {
    throw new Error("Expected visible developer tools fixture card bounds");
  }
  expect(Math.round(visibleBox.height)).toBe(Math.round(hiddenBox.height));
});

test("vault dashboard fixture (delete dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await page.goto("/visual-fixture?mode=vault-dashboard-delete-open", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const deleteDialog = page.getByRole("dialog", {
    name: "Remove Vault noter-md/noter",
  });
  await expect(deleteDialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Vault" })).toBeVisible();
  await expect(
    deleteDialog.getByRole("checkbox", {
      name: "Also remove GitHub repository",
    }),
  ).not.toBeChecked();
  await expectOptionalCheckboxUnchecked(
    deleteDialog.getByRole("checkbox", {
      name: /^Also remove all Codespaces/,
    }),
  );
  await expect(
    deleteDialog.getByRole("checkbox", {
      name: "Also remove Convex project/deployment",
    }),
  ).not.toBeChecked();
  await expect(
    deleteDialog.getByRole("checkbox", {
      name: "Also remove Cloudflare Worker",
    }),
  ).not.toBeChecked();
  await expect(page).toHaveScreenshot("vault-dashboard-delete-dialog.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (connect Cloudflare dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await page.goto("/visual-fixture?mode=vault-dashboard-connect-cloudflare-open", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const connectDialog = page.getByRole("dialog", {
    name: "Connect Cloudflare samebase/atelier",
  });
  await expect(connectDialog).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Existing" })).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Create" })).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Connect Worker" })).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-connect-cloudflare-dialog.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (connect Cloudflare worker select mobile)", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for mobile fixture tests.");
  }

  const context = await browser.newContext({
    viewport: { width: 376, height: 815 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    baseURL,
    reducedMotion: "reduce",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();

  await page.goto("/visual-fixture?mode=vault-dashboard-connect-cloudflare-mobile-shell-open", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const connectDialog = page.getByRole("dialog", {
    name: "Connect Cloudflare samebase/atelier",
  });
  await expectElementInsideViewportInline(page, connectDialog);

  const beforeOpen = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    htmlClientWidth: document.documentElement.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    visualViewportPageTop: Math.round(window.visualViewport?.pageTop ?? 0),
  }));
  expect(beforeOpen.innerWidth).toBe(beforeOpen.htmlClientWidth);
  expect(beforeOpen.htmlScrollWidth).toBe(beforeOpen.htmlClientWidth);
  expect(beforeOpen.bodyScrollWidth).toBeLessThanOrEqual(beforeOpen.htmlClientWidth);
  await expectElementInsideViewportInline(page, connectDialog);

  const workerSelect = connectDialog.getByRole("combobox", {
    name: "Cloudflare Worker",
  });
  await expectElementInsideViewportInline(page, workerSelect);
  await workerSelect.tap();
  const popup = page.getByRole("listbox").filter({ hasText: "tmp-my-asdf-app" });
  await expect(page.getByRole("option", { name: "tmp-my-asdf-app" })).toBeVisible();

  const afterOpen = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    htmlClientWidth: document.documentElement.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    visualViewportPageTop: Math.round(window.visualViewport?.pageTop ?? 0),
  }));
  expect(afterOpen.visualViewportPageTop).toBe(beforeOpen.visualViewportPageTop);
  await expectElementInsideViewportInline(page, connectDialog);
  await expectElementInsideViewportInline(page, workerSelect);
  await expectElementInsideViewportInline(page, popup);

  await expect(page).toHaveScreenshot(
    "vault-dashboard-connect-cloudflare-worker-select-mobile.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );

  await context.close();
});

test("vault dashboard fixture (connect Convex dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await page.goto("/visual-fixture?mode=vault-dashboard-connect-convex-open", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const connectDialog = page.getByRole("dialog", {
    name: "Connect Convex noter-md/noter-app",
  });
  await expect(connectDialog).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Existing" })).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Create" })).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Connect Project" })).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-connect-convex-dialog.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (delete dialog mobile)", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for mobile fixture tests.");
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  await page.goto("/visual-fixture?mode=vault-dashboard-delete-open", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const deleteDialog = page.getByRole("dialog", {
    name: "Remove Vault noter-md/noter",
  });
  await expect(deleteDialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Vault" })).toBeVisible();
  await expect(
    deleteDialog.getByRole("checkbox", {
      name: "Also remove GitHub repository",
    }),
  ).not.toBeChecked();
  await expectOptionalCheckboxUnchecked(
    deleteDialog.getByRole("checkbox", {
      name: /^Also remove all Codespaces/,
    }),
  );
  await expect(
    deleteDialog.getByRole("checkbox", {
      name: "Also remove Convex project/deployment",
    }),
  ).not.toBeChecked();
  await expect(
    deleteDialog.getByRole("checkbox", {
      name: "Also remove Cloudflare Worker",
    }),
  ).not.toBeChecked();
  await expect(page).toHaveScreenshot("vault-dashboard-delete-dialog-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await context.close();
});

test("vault dashboard fixture (provisioning log)", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 300 });
  await page.goto("/visual-fixture?mode=vault-dashboard-provisioning-log", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(
    fixture.getByRole("region", {
      name: "Provisioning log for noter-md/noter-app",
    }),
  ).toBeVisible();
  await expect(fixture.locator(".monaco-editor")).toHaveCount(4);
  await expect(fixture).toHaveScreenshot("vault-dashboard-provisioning-log.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (infra setup progress)", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 300 });
  await page.goto("/visual-fixture?mode=vault-dashboard-infra-setup", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture.getByText("Infra: provisioning")).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Provision infra" })).toHaveCount(0);
  await expect(fixture.getByRole("button", { name: "Retry infra" })).toHaveCount(0);
  await expect(fixture).toHaveScreenshot("vault-dashboard-infra-setup.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (mobile list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto("/visual-fixture?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault noter-md/noter",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/?delete#noter");
  await expect(fixture.getByRole("link", { name: "Project settings" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Cloudflare preview" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Preview deploy" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Production deploy" })).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "PR #321 Use the full dashboard main pane",
    }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Edit" }).first()).toBeVisible();
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
  await page.goto("/visual-fixture?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault noter-md/noter",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/?delete#noter");
  await expect(fixture.getByRole("link", { name: "Project settings" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Cloudflare preview" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Preview deploy" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Production deploy" })).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "PR #321 Use the full dashboard main pane",
    }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Edit" }).first()).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "codex/dashboard-main-pane-spacing",
    }),
  ).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-dashboard-list-spacing-desktop.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (bottom target can align at top)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 520 });
  await page.goto("/visual-fixture?mode=vault-dashboard-bottom-target-scroll", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const scrollport = page
    .getByTestId("workspace-layout-v2-main-viewport")
    .locator("section > div")
    .nth(1);
  const target = page.getByTestId("vault-dashboard-bottom-target-card");
  const targetHeader = target.locator("[data-vault-dashboard-repository-header]");
  const targetRepositoryLink = page.getByRole("link", {
    name: "#noter-bottom-target",
    exact: true,
  });
  const targetLastBranchLink = page.getByRole("link", {
    name: "Open codex/bottom-target-last-branch branch on GitHub",
  });

  await target.evaluate((element) => {
    element.scrollIntoView({ block: "start", inline: "nearest" });
  });

  await expect
    .poll(async () => {
      const [targetBox, scrollportBox] = await Promise.all([
        target.boundingBox(),
        scrollport.boundingBox(),
      ]);
      if (targetBox === null || scrollportBox === null) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.abs(targetBox.y - scrollportBox.y);
    })
    .toBeLessThanOrEqual(1);
  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(async () => {
      const [headerBox, scrollportBox] = await Promise.all([
        targetHeader.boundingBox(),
        scrollport.boundingBox(),
      ]);
      if (headerBox === null || scrollportBox === null) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.abs(headerBox.y - scrollportBox.y);
    })
    .toBeLessThanOrEqual(1);
  // Rows covered by the sticky repository header do not count as visible at
  // max scroll; only the final branch should remain below it.
  await expect
    .poll(() =>
      target.evaluate((targetElement) => {
        if (!(targetElement instanceof HTMLElement)) {
          return [];
        }

        const header = targetElement.querySelector("[data-vault-dashboard-repository-header]");
        const scrollportElement = targetElement
          .closest('[data-testid="workspace-layout-v2-main-viewport"]')
          ?.querySelector("section > div:nth-of-type(2)");
        if (!(header instanceof HTMLElement) || !(scrollportElement instanceof HTMLElement)) {
          return [];
        }

        const headerBox = header.getBoundingClientRect();
        const scrollportBox = scrollportElement.getBoundingClientRect();
        return Array.from(targetElement.querySelectorAll("[data-vault-dashboard-branch-row]"))
          .filter((rowElement) => {
            if (!(rowElement instanceof HTMLElement)) {
              return false;
            }

            const rowBox = rowElement.getBoundingClientRect();
            const visibleTop = Math.max(rowBox.top, headerBox.bottom, scrollportBox.top);
            const visibleBottom = Math.min(rowBox.bottom, scrollportBox.bottom);
            return visibleBottom - visibleTop > 1;
          })
          .map((rowElement) => {
            const branchLink = rowElement.querySelector(
              'a[aria-label^="Open "][aria-label$=" branch on GitHub"]',
            );
            return branchLink instanceof HTMLElement ? branchLink.textContent.trim() : "";
          });
      }),
    )
    .toEqual(["codex/bottom-target-last-branch"]);
  await expect(targetRepositoryLink).toBeVisible();
  await expect(targetLastBranchLink).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-bottom-target-scroll.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (sticky repository header)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 520 });
  await page.goto("/visual-fixture?mode=vault-dashboard-sticky-header", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const scrollport = page
    .getByTestId("workspace-layout-v2-main-viewport")
    .locator("section > div")
    .nth(1);
  const header = page.getByTestId("vault-dashboard-repository-header");

  await page.getByRole("button", { name: "Show 23 more branches" }).click();
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
  await expect(page.getByRole("link", { name: "#noter", exact: true })).toBeVisible();
  const branchExpansionButton = header.getByRole("button", {
    name: "Show less branches",
    exact: true,
  });
  const branchFilterCount = header.getByText("28 of 32", { exact: true });
  const branchFiltersButton = header.getByRole("button", {
    name: "Filters",
    exact: true,
  });
  await expect(branchExpansionButton).toBeVisible();
  await expect(branchFilterCount).toBeVisible();
  await expect(branchFiltersButton).toBeVisible();
  await expectElementInsideContainer(branchExpansionButton, header);
  await expectElementInsideContainer(branchFilterCount, header);
  await expectElementInsideContainer(branchFiltersButton, header);
  await expect(page.getByText("codex/sticky-dashboard-branch-05")).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-sticky-header.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (list spacing expansion)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  await page.goto("/visual-fixture?mode=vault-dashboard-list-spacing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("codex/archive-doc-taxonomy")).toHaveCount(0);
  await page.getByRole("button", { name: "Show 5 more branches" }).click();

  await expect(page.getByText("codex/archive-doc-taxonomy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show less branches" })).toBeVisible();
  await page.getByRole("button", { name: "Show less branches" }).click();

  await expect(page.getByText("codex/archive-doc-taxonomy")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show 5 more branches" })).toBeVisible();
});

test("vault dashboard fixture (branch filters popover)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto("/visual-fixture?mode=vault-branch-filters", {
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

test("vault dashboard fixture (branch filters mobile sheet)", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for mobile fixture tests.");
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  await page.goto("/visual-fixture?mode=vault-branch-filters", {
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
  await page.goto("/visual-fixture?mode=vault-branch-mobile-alignment", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault noter-md/noter",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/?delete#noter");
  await expect(fixture).toHaveScreenshot("vault-branch-mobile-alignment.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
