import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import type { VaultDashboardVisualMode } from "../src/components/vault-dashboard/VaultDashboardVisualFixture";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";
import { seedVisualFixtureWorkspaceSidebarState } from "./visualFixtureTest";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;
const VAULT_DASHBOARD_VISUAL_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

type RgbaPixel = {
  alpha: number;
  blue: number;
  green: number;
  red: number;
};

async function expectMobileSafeTextEntrySize(locator: Locator) {
  await expect(locator).toHaveCSS("font-size", "16px");
}

async function seedAppWorkspaceSidebarState(page: Page, state: WorkspaceSidebarState) {
  await page.addInitScript(
    ({ state, storageKey, version }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ state, version }));
    },
    {
      state,
      storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      version: STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION,
    },
  );
}

async function openVaultDashboardVisualFixture(page: Page, mode: VaultDashboardVisualMode) {
  await seedVisualFixtureWorkspaceSidebarState(page);
  await page.goto(`/visual-fixture?mode=${mode}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

function readPngPixel(png: PNG, x: number, y: number): RgbaPixel {
  const clampedX = Math.max(0, Math.min(png.width - 1, x));
  const clampedY = Math.max(0, Math.min(png.height - 1, y));
  const index = (clampedY * png.width + clampedX) * 4;

  return {
    red: png.data[index] ?? 0,
    green: png.data[index + 1] ?? 0,
    blue: png.data[index + 2] ?? 0,
    alpha: png.data[index + 3] ?? 0,
  };
}

async function readVaultDashboardRightSidebarSeparatorPaint(
  page: Page,
  layout: Locator,
): Promise<{
  referencePixel: RgbaPixel;
  samplePixels: RgbaPixel[];
}> {
  const geometry = await layout.evaluate((layoutRoot) => {
    const mainPane = layoutRoot.querySelector("[data-workspace-layout-v2-mobile-main-pane] > div");
    const stickyHeader = layoutRoot.querySelector(
      '[data-testid="vault-dashboard-repository-header"]',
    );

    if (!(mainPane instanceof HTMLElement)) {
      throw new Error("Expected mobile dashboard main pane.");
    }
    if (!(stickyHeader instanceof HTMLElement)) {
      throw new Error("Expected mobile dashboard sticky header.");
    }

    const mainPaneRect = mainPane.getBoundingClientRect();
    const stickyHeaderRect = stickyHeader.getBoundingClientRect();
    const referenceY = Math.max(0, Math.round(stickyHeaderRect.top) - 1);
    const midHeaderY = Math.round(stickyHeaderRect.top + stickyHeaderRect.height / 2);

    return {
      referenceY,
      sampleYs: [
        Math.round(stickyHeaderRect.top),
        Math.round(stickyHeaderRect.top) + 8,
        midHeaderY,
        Math.round(stickyHeaderRect.bottom) - 1,
      ],
      separatorX: Math.round(mainPaneRect.right) - 1,
    };
  });
  const screenshot = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const png = PNG.sync.read(screenshot);

  return {
    referencePixel: readPngPixel(png, geometry.separatorX, geometry.referenceY),
    samplePixels: geometry.sampleYs.map((sampleY) =>
      readPngPixel(png, geometry.separatorX, sampleY),
    ),
  };
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

async function readRequiredBounds(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error(`Expected ${label} bounds`);
  }
  return box;
}

async function waitForAnimationFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<null>((resolve) => {
        window.requestAnimationFrame(() => {
          resolve(null);
        });
      }),
  );
}

async function readReactFlowViewportTransform(container: Locator): Promise<string> {
  return await container.locator(".react-flow__viewport").evaluate((viewport) => {
    return viewport.getAttribute("transform") ?? window.getComputedStyle(viewport).transform;
  });
}

test("vault dashboard fixture (branch PR labels)", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 180 });
  await openVaultDashboardVisualFixture(page, "vault-branch-pr-labels");

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
  await openVaultDashboardVisualFixture(page, "vault-dashboard-dev-tools-hidden");

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

test("vault dashboard fixture (Convex schema graph)", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await openVaultDashboardVisualFixture(page, "vault-convex-schema-graph");

  const fixture = page.getByTestId("vault-convex-schema-graph-fixture");
  const graphViewport = fixture.locator("[data-schema-graph-layout]");
  await expect(fixture.getByText("Convex schema")).toBeVisible();
  await expect(graphViewport).toHaveAttribute("data-schema-graph-layout", "ready");
  await expect(
    fixture.getByTestId("rf__node-users").getByText("users", { exact: true }),
  ).toBeVisible();
  await expect(
    fixture.getByTestId("rf__node-fileStaging").getByText("fileStaging", { exact: true }),
  ).toBeVisible();
  const longTableName = fixture
    .getByTestId("rf__node-vaultInfrastructureOwnershipRecords")
    .getByText("vaultInfrastructureOwnershipRecords", { exact: true });
  await expect(longTableName).toBeVisible();
  await expect(longTableName).not.toHaveCSS("text-overflow", "ellipsis");
  await expect(fixture.locator(".react-flow__edge")).toHaveCount(4);
  const [fileStagingBox, vaultsBox, usersBox] = await Promise.all([
    readRequiredBounds(fixture.getByTestId("rf__node-fileStaging"), "fileStaging node"),
    readRequiredBounds(fixture.getByTestId("rf__node-vaults"), "vaults node"),
    readRequiredBounds(fixture.getByTestId("rf__node-users"), "users node"),
  ]);
  expect(fileStagingBox.x).toBeLessThan(vaultsBox.x);
  expect(vaultsBox.x).toBeLessThan(usersBox.x);
  await expect(fixture).toHaveScreenshot("vault-convex-schema-graph.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (Convex schema graph drag keeps viewport)", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await openVaultDashboardVisualFixture(page, "vault-convex-schema-graph");

  const fixture = page.getByTestId("vault-convex-schema-graph-fixture");
  const graphViewport = fixture.locator("[data-schema-graph-layout]");
  await expect(graphViewport).toHaveAttribute("data-schema-graph-layout", "ready");
  await waitForAnimationFrame(page);

  const transformBeforeDrag = await readReactFlowViewportTransform(fixture);
  const usersNode = fixture.getByTestId("rf__node-users");
  const usersBoxBeforeDrag = await readRequiredBounds(usersNode, "users node");
  const dragStart = {
    x: usersBoxBeforeDrag.x + usersBoxBeforeDrag.width / 2,
    y: usersBoxBeforeDrag.y + usersBoxBeforeDrag.height / 2,
  };

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 80, dragStart.y + 48, { steps: 6 });
  await page.mouse.up();

  await expect(graphViewport).toHaveAttribute("data-schema-graph-layout", "ready");
  await waitForAnimationFrame(page);

  const usersBoxAfterDrag = await readRequiredBounds(usersNode, "users node after drag");
  expect(Math.round(usersBoxAfterDrag.x)).not.toBe(Math.round(usersBoxBeforeDrag.x));
  await expect.poll(async () => readReactFlowViewportTransform(fixture)).toBe(transformBeforeDrag);
});

test("vault dashboard fixture (Convex schema route mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openVaultDashboardVisualFixture(page, "vault-convex-schema-route-mobile");

  const fixtureLayout = page.locator("[data-workspace-layout-v2]");
  const routeMain = page.getByTestId("vault-schema-page");
  await expect(fixtureLayout).toHaveAttribute("data-mobile-pane", "main");
  await expect(page.getByTestId("workspace-layout-v2-pane-right")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Toggle Right Sidebar" })).toBeVisible();
  await expect(routeMain.locator("[data-schema-graph-layout]")).toHaveAttribute(
    "data-schema-graph-layout",
    "ready",
  );
  await expect(routeMain.getByText("Convex schema")).toHaveCount(0);
  await expect(
    routeMain.getByTestId("rf__node-users").getByText("users", { exact: true }),
  ).toBeVisible();
  await expect(routeMain.locator(".react-flow__edge")).toHaveCount(4);
  await expect(routeMain).toHaveScreenshot("vault-convex-schema-route-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (delete dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-delete-open");

  const deleteDialog = page.getByRole("dialog", {
    name: "Remove Vault samebase/samebase",
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

test("vault dashboard fixture (add app root dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-add-app-root-open");

  const appRootDialog = page.getByRole("dialog", {
    name: "Add app root samebase/samebase",
  });
  await expect(appRootDialog).toBeVisible();
  await expect(appRootDialog.getByText("convert this repository to a monorepo")).toBeVisible();
  await expect(appRootDialog.getByRole("textbox", { name: "App root" })).toBeVisible();
  await expect(
    appRootDialog.getByRole("button", {
      name: "Add app root",
    }),
  ).toBeDisabled();
  await expect(page).toHaveScreenshot("vault-dashboard-add-app-root-dialog.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (add first app root dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-add-first-app-root-open");

  const appRootDialog = page.getByRole("dialog", {
    name: "Add app root samebase/atelier",
  });
  await expect(appRootDialog).toBeVisible();
  await expect(appRootDialog.getByText("one app or a monorepo")).toBeVisible();
  await expect(appRootDialog.getByRole("button", { name: "App", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(appRootDialog.getByRole("textbox", { name: "App root" })).toHaveCount(0);
  await expect(
    appRootDialog.getByRole("button", {
      name: "Use as app",
    }),
  ).toBeEnabled();
  await expect(page).toHaveScreenshot("vault-dashboard-add-first-app-root-dialog.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (connect Cloudflare dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-connect-cloudflare-open");

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

  await openVaultDashboardVisualFixture(
    page,
    "vault-dashboard-connect-cloudflare-mobile-shell-open",
  );

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
  await openVaultDashboardVisualFixture(page, "vault-dashboard-connect-convex-open");

  const connectDialog = page.getByRole("dialog", {
    name: "Connect Convex samebase/app",
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

  await openVaultDashboardVisualFixture(page, "vault-dashboard-delete-open");

  const deleteDialog = page.getByRole("dialog", {
    name: "Remove Vault samebase/samebase",
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
  await openVaultDashboardVisualFixture(page, "vault-dashboard-provisioning-log");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(
    fixture.getByRole("region", {
      name: "Provisioning log for samebase/app",
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
  await openVaultDashboardVisualFixture(page, "vault-dashboard-infra-setup");

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

test("vault dashboard fixture (Cloudflare GitHub App authorization failure)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-cloudflare-github-app-auth-failure");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture.getByText("Cloudflare cannot access this GitHub repo.")).toBeVisible();
  await expect(fixture.getByText("Cloudflare's recovery steps")).toBeVisible();
  await expect(fixture.getByText("uninstall the")).toBeVisible();
  await expect(fixture.getByText("first, then reconnect GitHub")).toBeVisible();
  await expect(fixture.getByText("Create application")).toBeVisible();
  await expect(fixture.getByText("Include noter-guest/tmp-manual-test")).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Cloudflare's recovery steps" })).toHaveAttribute(
    "href",
    "https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app",
  );
  await expect(
    fixture.getByRole("link", { name: "Cloudflare Workers and Pages GitHub App" }),
  ).toHaveAttribute("href", "https://github.com/apps/cloudflare-workers-and-pages");
});

test("vault dashboard fixture (mobile list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-list-spacing");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault samebase/samebase",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/home?delete#samebase");
  const repositoryCard = fixture.locator("[data-vault-dashboard-repository-hash-id]").first();
  await expect(repositoryCard).toBeVisible();
  const resourceLinksTrigger = fixture.getByRole("button", {
    name: "Show resource links",
  });
  await expect(resourceLinksTrigger).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Open Convex: nicu/samebase" })).toHaveCount(0);
  await expect(repositoryCard).toHaveScreenshot("vault-dashboard-list-spacing.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await resourceLinksTrigger.click();
  await expect(fixture.getByRole("button", { name: "Hide resource links" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Open GitHub: samebase/samebase" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Open Convex: nicu/samebase" })).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Open Cloudflare: nicu/samebase-worker" }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Production: calm-swan-123" })).toBeVisible();
  await expect(fixture.getByText("apps/domain-router").first()).toBeVisible();
  await expect(fixture.getByText("apps/samebase").first()).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "domain-router.nicu.workers.dev",
    }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "samebase-worker.nicu.workers.dev",
    }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "PR #321 Use the full dashboard main pane",
    }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "2 checks pending" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Edit" }).first()).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "codex/dashboard-main-pane-spacing",
    }),
  ).toBeVisible();
});

test("vault dashboard mobile right sidebar keeps pane separator above sticky headers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAppWorkspaceSidebarState(page, {
    ...VAULT_DASHBOARD_VISUAL_SIDEBAR_STATE,
    mobilePane: "right",
  });
  await page.goto("/visual-fixture?mode=vault-dashboard-sticky-header", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixtureLayout = page
    .getByTestId("vault-dashboard-visual-fixture-shell")
    .locator("[data-workspace-layout-v2]");
  await expect(fixtureLayout).toHaveAttribute("data-mobile-pane", "right");
  await expect
    .poll(() =>
      fixtureLayout
        .locator("[data-workspace-layout-v2-mobile-main-pane] > div")
        .evaluate((mainPane) => getComputedStyle(mainPane, "::after").width),
    )
    .toBe("1px");

  const separatorPaint = await readVaultDashboardRightSidebarSeparatorPaint(page, fixtureLayout);
  for (const samplePixel of separatorPaint.samplePixels) {
    expect(samplePixel).toEqual(separatorPaint.referencePixel);
  }
});

test("vault dashboard fixture (desktop list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1100 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-list-spacing");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault samebase/samebase",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/home?delete#samebase");
  const repositoryCard = fixture.locator("[data-vault-dashboard-repository-hash-id]").first();
  await expect(repositoryCard).toBeVisible();
  const resourceLinksTrigger = fixture.getByRole("button", {
    name: "Show resource links",
  });
  await expect(resourceLinksTrigger).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Open Convex: nicu/samebase" })).toHaveCount(0);
  await expect(repositoryCard).toHaveScreenshot("vault-dashboard-list-spacing-desktop.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await resourceLinksTrigger.click();
  await expect(fixture.getByRole("button", { name: "Hide resource links" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Open GitHub: samebase/samebase" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Open Convex: nicu/samebase" })).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Open Cloudflare: nicu/samebase-worker" }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Production: calm-swan-123" })).toBeVisible();
  await expect(fixture.getByText("apps/domain-router").first()).toBeVisible();
  await expect(fixture.getByText("apps/samebase").first()).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "domain-router.nicu.workers.dev",
    }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "samebase-worker.nicu.workers.dev",
    }),
  ).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "PR #321 Use the full dashboard main pane",
    }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "2 checks pending" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Edit" }).first()).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "codex/dashboard-main-pane-spacing",
    }),
  ).toBeVisible();
});

test("vault dashboard fixture (bottom target can align at top)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 520 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-bottom-target-scroll");

  const scrollport = page
    .getByTestId("workspace-layout-v2-main-viewport")
    .locator("section > div")
    .nth(1);
  const target = page.getByTestId("vault-dashboard-bottom-target-card");
  const targetHeader = target.locator("[data-vault-dashboard-repository-header]");
  const targetRepositoryLink = page.getByRole("link", {
    name: "#samebase-bottom-target",
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
  await openVaultDashboardVisualFixture(page, "vault-dashboard-sticky-header");

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
  await expect(page.getByRole("link", { name: "#samebase", exact: true })).toBeVisible();
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
  await openVaultDashboardVisualFixture(page, "vault-dashboard-list-spacing");

  await expect(page.getByText("codex/archive-doc-taxonomy")).toHaveCount(0);
  await page.getByRole("button", { name: "Show 6 more branches" }).click();

  await expect(page.getByText("codex/archive-doc-taxonomy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show less branches" })).toBeVisible();
  await page.getByRole("button", { name: "Show less branches" }).click();

  await expect(page.getByText("codex/archive-doc-taxonomy")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show 6 more branches" })).toBeVisible();
});

test("vault dashboard fixture (branch filters popover)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 560 });
  await openVaultDashboardVisualFixture(page, "vault-branch-filters");
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  await expectMobileSafeTextEntrySize(page.getByPlaceholder("Filter labels"));
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

  await openVaultDashboardVisualFixture(page, "vault-branch-filters");
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  const sheet = page.locator("[data-slot='sheet-content']");
  await expectMobileSafeTextEntrySize(sheet.getByPlaceholder("Filter labels"));
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
  await openVaultDashboardVisualFixture(page, "vault-branch-mobile-alignment");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault samebase/samebase",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/home?delete#samebase");
  await expect(fixture).toHaveScreenshot("vault-branch-mobile-alignment.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
