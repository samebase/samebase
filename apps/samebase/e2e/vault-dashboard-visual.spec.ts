import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import type { VaultDashboardVisualMode } from "../src/components/vault-dashboard/VaultDashboardVisualFixture";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";
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
    const separator = layoutRoot.querySelector(
      '[data-workspace-layout-v2-mobile-separator="main-right"]',
    );
    const stickyHeader = layoutRoot.querySelector(
      '[data-testid="vault-dashboard-repository-header"]',
    );

    if (!(separator instanceof HTMLElement)) {
      throw new Error("Expected mobile dashboard main-right separator.");
    }
    if (!(stickyHeader instanceof HTMLElement)) {
      throw new Error("Expected mobile dashboard sticky header.");
    }

    const separatorRect = separator.getBoundingClientRect();
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
      separatorX: Math.round(separatorRect.left + separatorRect.width / 2),
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
    fixture.getByTestId("rf__node-vaultStagedFiles").getByText("vaultStagedFiles", { exact: true }),
  ).toBeVisible();
  const longTableName = fixture
    .getByTestId("rf__node-workflow_vaultProvisioning_writeLocks")
    .getByText("workflow_vaultProvisioning_writeLocks", { exact: true });
  await expect(longTableName).toBeVisible();
  await expect(longTableName).not.toHaveCSS("text-overflow", "ellipsis");
  await expect(fixture.locator(".react-flow__edge")).toHaveCount(10);
  await expect(fixture.locator('[data-schema-graph-zone="identity"]')).toBeVisible();
  await expect(fixture.locator('[data-schema-graph-zone="machines"]')).toBeVisible();
  await expect(fixture.locator('[data-schema-graph-zone="vault"]')).toBeVisible();
  await expect(fixture.locator('[data-schema-graph-zone="repository"]')).toBeVisible();
  await expect(fixture.locator('[data-schema-graph-zone="infrastructure"]')).toBeVisible();
  await expect(fixture.locator('[data-schema-graph-zone="files"]')).toBeVisible();
  await expect(fixture.locator('[data-schema-graph-zone="agent"]')).toBeVisible();
  await expect(fixture.locator('[data-schema-graph-zone="mcp"]')).toBeVisible();
  const [identityZoneBox, vaultZoneBox, infrastructureZoneBox] = await Promise.all([
    readRequiredBounds(fixture.locator('[data-schema-graph-zone="identity"]'), "identity zone"),
    readRequiredBounds(fixture.locator('[data-schema-graph-zone="vault"]'), "vault zone"),
    readRequiredBounds(
      fixture.locator('[data-schema-graph-zone="infrastructure"]'),
      "infrastructure zone",
    ),
  ]);
  expect(identityZoneBox.x).toBeLessThan(vaultZoneBox.x);
  expect(vaultZoneBox.x).toBeLessThan(infrastructureZoneBox.x);
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
  await expect(routeMain.locator('[data-schema-graph-zone="vault"]')).toBeVisible();
  await expect(routeMain.locator(".react-flow__edge")).toHaveCount(10);
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

test("vault dashboard fixture (add Cloudflare dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-connect-cloudflare-open");

  const connectDialog = page.getByRole("dialog", {
    name: "Add Cloudflare to samebase/atelier",
  });
  await expect(connectDialog).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Existing" })).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Create" })).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Add 2 Workers" })).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-connect-cloudflare-dialog.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await connectDialog.getByRole("button", { name: "Connect another Worker" }).click();
  const workerDialog = page.getByRole("dialog", { name: "Connect a Worker" });
  await workerDialog.getByLabel("Worker").click();
  await page.getByRole("option", { name: "app-workers", exact: true }).click();
  const rootInput = workerDialog.getByLabel("Repository root");
  await expect(rootInput).toHaveValue("");
  await rootInput.click();
  const folderSuggestions = workerDialog.getByRole("listbox", {
    name: "Repository folder suggestions",
  });
  await expect(folderSuggestions.getByRole("option")).toHaveText([
    "apps",
    "apps/admin",
    "apps/atelier",
    "apps/portal",
    "packages/shared",
  ]);
  await expect(page).toHaveScreenshot("vault-dashboard-cloudflare-root-suggestions.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
  await folderSuggestions.getByRole("option", { name: "apps/portal", exact: true }).click();
  await expect(rootInput).toHaveValue("apps/portal");
  await expect(workerDialog.getByRole("button", { name: "Connect and add" })).toBeEnabled();
  await expect(page).toHaveScreenshot("vault-dashboard-connect-cloudflare-unconnected-worker.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (add Cloudflare Workers mobile)", async ({ browser }, testInfo) => {
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
    name: "Add Cloudflare to samebase/atelier",
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

  const rootWorker = connectDialog.getByRole("checkbox", { name: "app-start-workers" });
  const adminWorker = connectDialog.getByRole("checkbox", { name: "app-admin" });
  await expect(rootWorker).toBeChecked();
  await expect(adminWorker).toBeChecked();

  const afterOpen = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    htmlClientWidth: document.documentElement.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    visualViewportPageTop: Math.round(window.visualViewport?.pageTop ?? 0),
  }));
  expect(afterOpen.visualViewportPageTop).toBe(beforeOpen.visualViewportPageTop);
  await expectElementInsideViewportInline(page, connectDialog);
  await expectElementInsideViewportInline(page, rootWorker);
  await expectElementInsideViewportInline(page, adminWorker);

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

test("vault dashboard fixture (add Convex dialog)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-connect-convex-open");

  const connectDialog = page.getByRole("dialog", {
    name: "Add Convex to samebase/app",
  });
  await expect(connectDialog).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Existing" })).toBeVisible();
  await expect(connectDialog.getByRole("button", { name: "Create" })).toBeVisible();
  await expect(connectDialog.getByRole("checkbox").first()).toHaveAccessibleName(
    /samebase-app.*Used by app-start-workers/,
  );
  for (const checkbox of await connectDialog.getByRole("checkbox").all()) {
    await expect(checkbox).not.toBeChecked();
  }
  await expect(connectDialog.getByRole("button", { name: "Add projects" })).toBeDisabled();
  await expect(page).toHaveScreenshot("vault-dashboard-connect-convex-dialog.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (retry Convex dialog after error)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 640 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-connect-convex-error");

  const connectDialog = page.getByRole("dialog", {
    name: "Add Convex to samebase/app",
  });
  await expect(
    connectDialog.getByText("Could not attach the selected Convex project."),
  ).toBeVisible();
  await expect(connectDialog.getByRole("checkbox", { name: /samebase-app/ })).toBeChecked();
  await expect(connectDialog.getByRole("button", { name: "Add 1 project" })).toBeEnabled();
  await expect(page).toHaveScreenshot("vault-dashboard-connect-convex-error.png", {
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
  await expect(fixture.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-dashboard-cloudflare-github-app-auth-failure.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (Cloudflare missing Builds trigger repair)", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-cloudflare-build-trigger-missing");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(
    fixture.getByRole("link", {
      name: "Open GitHub: nicu-chiciuc/tmp-my-super-app-2",
    }),
  ).toBeVisible();
  await expect(fixture.getByText("pfp/tmp-my-super-app-234")).toBeVisible();
  await expect(
    fixture.getByText("Cloudflare is not connected to this GitHub repository."),
  ).toBeVisible();
  const configureBuilds = fixture.getByRole("button", {
    name: "Configure Workers Builds for GitHub Cloudflare",
  });
  await expect(configureBuilds).toBeVisible();
  await expect(
    fixture.getByRole("button", {
      name: "Repair Convex deploy keys for tmp-my-super-app-2 in Workers Builds (nicu-team-id/tmp-my-super-app-2)",
    }),
  ).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-dashboard-cloudflare-build-trigger-missing.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await configureBuilds.click();
  const repairDialog = page.getByRole("dialog", {
    name: "Configure tmp-my-super-app-234 Builds",
  });
  await expect(repairDialog).toBeVisible();
  await expect(repairDialog.getByRole("combobox", { name: "Repository root" })).toHaveValue("/");
  await expect(
    repairDialog.getByRole("button", { name: "Configure Workers Builds" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-cloudflare-builds-repair-dialog.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (mobile list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-list-spacing");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const deleteLink = fixture.getByRole("link", {
    name: "Remove vault samebase/samebase",
  });
  await expect(deleteLink).toBeVisible();
  await expect(deleteLink).toHaveAttribute("href", "/vault/samebase/samebase?delete");
  const repositoryCard = fixture.locator("[data-vault-dashboard-repository-card]").first();
  await expect(repositoryCard).toBeVisible();
  const resourceRail = fixture.getByTestId("vault-resource-rail");
  const resourceLinksTrigger = fixture.getByRole("button", {
    name: "Show resource links",
  });
  await expect(resourceLinksTrigger).toBeVisible();
  await expect(resourceRail.getByRole("link", { name: "Open Convex: nicu/samebase" })).toHaveCount(
    0,
  );
  await expect(repositoryCard).toHaveScreenshot("vault-dashboard-list-spacing.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await resourceLinksTrigger.click();
  await expect(fixture.getByRole("button", { name: "Hide resource links" })).toBeVisible();
  await expect(
    resourceRail.getByRole("link", { name: "Open GitHub: samebase/samebase" }),
  ).toBeVisible();
  await expect(resourceRail.getByText("Loading from Convex...")).toBeVisible();
  await expect(resourceRail.getByText("Loading from Cloudflare...")).toHaveCount(2);
  await expect(resourceRail.getByText("apps/samebase", { exact: true })).toBeVisible();
  await expect(resourceRail.getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(resourceRail.getByText("domain-router", { exact: true })).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "Open pull request 1260 on GitHub",
    }),
  ).toBeVisible();
  await expect(fixture.getByText("4 passed", { exact: true })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "View changes" }).first()).toBeVisible();
  await expect(
    fixture
      .getByRole("region", { name: "Open pull requests" })
      .getByText("samebase-worker", { exact: true }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "precise-otter-1260" })).toBeVisible();
});

test("vault dashboard keeps live pull requests available after source setup fails", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-source-setup-failed");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture.getByText("Initial tree sync failed.")).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "Open pull request 1260 on GitHub" }),
  ).toBeVisible();
  await expect(fixture.getByText("Add app root")).toHaveCount(0);
  await expect(fixture.getByRole("button", { name: "Add Convex" })).toHaveCount(0);
  await expect(fixture.getByRole("button", { name: "Add Cloudflare" })).toHaveCount(0);
  await expect(fixture).toHaveScreenshot("vault-dashboard-source-setup-failed.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (sidebar list)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await seedAppWorkspaceSidebarState(page, {
    ...VAULT_DASHBOARD_VISUAL_SIDEBAR_STATE,
    rightDesktopOpen: false,
  });
  await page.goto("/visual-fixture?mode=vault-dashboard-sidebar-list", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const vaultNavigation = page.getByRole("navigation", { name: "Vaults" });
  await expect(vaultNavigation).toBeVisible();
  await expect(page.getByTestId("vault-dashboard-visual-fixture-shell")).toContainText("Vaults");
  await expect(
    vaultNavigation.getByRole("link", { name: "samebase/marketing-site" }),
  ).toBeVisible();
  await expect(vaultNavigation.getByRole("link", { name: "noter/guestbook" })).toHaveAttribute(
    "href",
    "/vault/noter/guestbook?mode=vault-dashboard-sidebar-list",
  );
  await expect(page.getByTestId("vault-dashboard-visual-fixture-shell")).toHaveScreenshot(
    "vault-dashboard-sidebar-list.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("vault dashboard fixture (root picker)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto("/visual-fixture?mode=vault-dashboard-root-picker", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const vaultNavigation = fixture.getByRole("navigation", { name: "Vaults" });
  await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(0);
  await expect(vaultNavigation).toBeVisible();
  await expect(
    vaultNavigation.getByRole("link", { name: "samebase/marketing-site" }),
  ).toBeVisible();
  await expect(vaultNavigation.getByRole("link", { name: "noter/guestbook" })).toHaveAttribute(
    "href",
    /^\/vault\/noter\/guestbook(?:\?|$)/,
  );
  await expect(fixture).toHaveScreenshot("vault-dashboard-root-picker.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
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
  const mainRightSeparator = fixtureLayout.locator(
    '[data-workspace-layout-v2-mobile-separator="main-right"]',
  );
  await expect(fixtureLayout).toHaveAttribute("data-mobile-pane", "right");
  await expect(mainRightSeparator).toHaveCount(1);
  await expect(mainRightSeparator).toHaveCSS("width", "1px");

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
  await expect(deleteLink).toHaveAttribute("href", "/vault/samebase/samebase?delete");
  const repositoryCard = fixture.locator("[data-vault-dashboard-repository-card]").first();
  await expect(repositoryCard).toBeVisible();
  const resourceRail = fixture.getByTestId("vault-resource-rail");
  const resourceLinksTrigger = fixture.getByRole("button", {
    name: "Show resource links",
  });
  await expect(resourceLinksTrigger).toBeVisible();
  await expect(resourceRail.getByRole("link", { name: "Open Convex: nicu/samebase" })).toHaveCount(
    0,
  );
  await expect(repositoryCard).toHaveScreenshot("vault-dashboard-list-spacing-desktop.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await resourceLinksTrigger.click();
  await expect(fixture.getByRole("button", { name: "Hide resource links" })).toBeVisible();
  await expect(
    resourceRail.getByRole("link", { name: "Open GitHub: samebase/samebase" }),
  ).toBeVisible();
  await expect(resourceRail.getByText("Loading from Convex...")).toBeVisible();
  await expect(resourceRail.getByText("Loading from Cloudflare...")).toHaveCount(2);
  await expect(resourceRail.getByText("apps/samebase", { exact: true })).toBeVisible();
  await expect(resourceRail.getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(resourceRail.getByText("domain-router", { exact: true })).toBeVisible();
  await expect(
    fixture.getByRole("link", {
      name: "Open pull request 1260 on GitHub",
    }),
  ).toBeVisible();
  await expect(fixture.getByText("4 passed", { exact: true })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "View changes" }).first()).toBeVisible();
  await expect(
    fixture
      .getByRole("region", { name: "Open pull requests" })
      .getByText("samebase-worker", { exact: true }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "precise-otter-1260" })).toBeVisible();
});

test("vault dashboard fixture (sticky repository header)", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 520 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-sticky-header");

  const scrollport = page
    .getByTestId("workspace-layout-v2-main-viewport")
    .locator('[data-scroll-restoration-id="workspace-layout-v2-main"]');
  const header = page.getByTestId("vault-dashboard-repository-header");

  await expect(page.getByRole("button", { name: /Show .* branches/ })).toHaveCount(0);
  await expect(page.locator("[data-pull-request-row]")).toHaveCount(25);
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
  await expect(header.getByText("samebase", { exact: true })).toBeVisible();
  const pullRequestFiltersButton = header.getByRole("button", {
    name: "Filters",
    exact: true,
  });
  await expect(pullRequestFiltersButton).toBeVisible();
  await expectElementInsideContainer(pullRequestFiltersButton, header);
  await expect(page.getByRole("link", { name: "Open pull request 1255 on GitHub" })).toBeVisible();
  await expect(page).toHaveScreenshot("vault-dashboard-sticky-header.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (list spacing)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  await openVaultDashboardVisualFixture(page, "vault-dashboard-list-spacing");

  await expect(page.getByRole("link", { name: "Open pull request 1260 on GitHub" })).toBeVisible();
  await expect(
    page.getByText("codex/live-provider-truth-01 → main", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open pull request 1258 on GitHub" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Show .* branches/ })).toHaveCount(0);
});

test("vault dashboard automatically loads the next pull request page at the scroll end", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 520 });
  await openVaultDashboardVisualFixture(page, "vault-pull-request-auto-pagination");

  const list = page.getByRole("region", { name: "Open pull requests" });
  const sentinel = list.locator("[data-pull-request-load-more-sentinel]");
  await expect(list.locator("[data-pull-request-row]")).toHaveCount(6);
  await expect(list.getByText("Pull request data may be out of date")).toBeVisible();
  await expect(list.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expect(list.getByRole("link", { name: "GitHub", exact: true })).toHaveCount(0);
  await expect(sentinel).toHaveCount(1);
  await expect(page).toHaveScreenshot("vault-pull-request-auto-pagination.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await sentinel.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await expect(list.locator("[data-pull-request-row]")).toHaveCount(8);
  await expect(sentinel).toHaveCount(0);
});

test("vault dashboard fixture (pull request filters popover)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 560 });
  await openVaultDashboardVisualFixture(page, "vault-pull-request-filters");
  await expect(page.getByRole("link", { name: "Open pull request 1260 on GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open pull request 1259 on GitHub" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open pull request 1258 on GitHub" })).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  await expectMobileSafeTextEntrySize(page.getByPlaceholder("Filter labels"));
  await expect(page).toHaveScreenshot("vault-pull-request-filters-popover.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (pull request filters mobile sheet)", async ({
  browser,
}, testInfo) => {
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

  await openVaultDashboardVisualFixture(page, "vault-pull-request-filters");
  await page.getByRole("button", { name: "Filters", exact: true }).click();

  const sheet = page.locator("[data-slot='sheet-content']");
  await expectMobileSafeTextEntrySize(sheet.getByPlaceholder("Filter labels"));
  await expectElementsDoNotOverlap(
    sheet.getByRole("button", { name: "Reset all" }),
    sheet.getByRole("button", { name: "Close" }),
  );
  await expect(page).toHaveScreenshot("vault-pull-request-filters-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await context.close();
});
