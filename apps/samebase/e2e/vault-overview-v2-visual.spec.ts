import { expect, test, type Page } from "@playwright/test";
import type { VaultDashboardVisualMode } from "../src/components/vault-dashboard/VaultDashboardVisualFixture";
import { WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX } from "../src/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;
const VAULT_OVERVIEW_V2_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: false,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

type VaultOverviewV2VisualMode = Extract<
  VaultDashboardVisualMode,
  | "vault-overview-v2"
  | "vault-overview-v2-dev"
  | "vault-overview-v2-loading"
  | "vault-overview-v2-partial-loading"
  | "vault-overview-v2-root"
  | "vault-overview-v2-settings"
>;

async function openVaultOverviewV2(
  page: Page,
  mode: VaultOverviewV2VisualMode,
  sidebarState: WorkspaceSidebarState = VAULT_OVERVIEW_V2_SIDEBAR_STATE,
) {
  await page.route("https://samebase.com/favicon.ico", async (route) => {
    await route.fulfill({
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#30383a"/><path d="M4 5h8v2H6v2h6v2H4z" fill="white"/></svg>`,
      contentType: "image/svg+xml",
    });
  });
  await page.addInitScript(
    ({ state, storageKey, version }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ state, version }));
    },
    {
      state: sidebarState,
      storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      version: STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION,
    },
  );
  await page.goto(`/visual-fixture?mode=${mode}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId(mode);
  await expect(fixture).toBeVisible();
  return fixture;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("uses the overview vault rows on the canonical root route", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 640 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2-root");
  const vaultNavigation = fixture.getByRole("navigation", { name: "Vaults" });

  await expect(vaultNavigation.getByRole("link", { name: /^samebase\/samebase,/ })).toHaveAttribute(
    "href",
    "/vault/samebase/samebase",
  );
  await expect(vaultNavigation.getByRole("link", { name: /^noter\/guestbook,/ })).toHaveAttribute(
    "href",
    "/vault/noter/guestbook",
  );
  await expect(fixture).toHaveScreenshot("vault-overview-v2-root.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("shows the shared overview model on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2");

  await expect(fixture.getByRole("link", { name: "main", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/samebase/samebase/tree/main",
  );
  await expect(fixture.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
    "href",
    "/vault/samebase/samebase",
  );
  await expect(fixture.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "href",
    "/vault/samebase/samebase/settings",
  );
  await expect(
    fixture.getByRole("link", { name: "Open pull request #1260 on GitHub" }),
  ).toHaveAttribute("href", "https://github.com/samebase/samebase/pull/1260");
  await expect(fixture.getByText("apps/domain-router", { exact: true })).toBeVisible();
  await expect(fixture.getByText("apps/samebase", { exact: true }).first()).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-overview-v2-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("keeps the overview hierarchy and pull request actions clear on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2");

  const firstPullRequest = fixture.getByRole("button", {
    name: /Show the exact preview for each pull request/,
  });
  await expect(firstPullRequest).toBeVisible();
  await expect(firstPullRequest).toContainText("+40");
  await expect(firstPullRequest).toContainText("−10");
  await expect(firstPullRequest).toContainText("3 files");
  await expect(fixture).toHaveScreenshot("vault-overview-v2-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  await firstPullRequest.click();
  await expect(fixture.getByRole("link", { name: "Branch preview" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Build logs" }).first()).toBeVisible();
  await expect(fixture.getByRole("link", { name: "View changes" }).first()).toBeVisible();
});

test("keeps provider ownership and actions together in mobile settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2-settings");

  await expect(fixture.getByRole("button", { name: "Add Cloudflare Worker" })).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Add Convex project" })).toBeVisible();
  await expect(fixture.getByText("Samebase/", { exact: true })).toHaveCount(2);
  await expect(
    fixture.getByRole("button", { name: "Configure Workers Builds for GitHub" }).first(),
  ).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-overview-v2-settings-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("uses stable shells while independent data sources load", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const loadingFixture = await openVaultOverviewV2(page, "vault-overview-v2-loading");

  await expect(loadingFixture.getByLabel("Loading vault overview")).toBeVisible();
  await expect(loadingFixture).toHaveScreenshot("vault-overview-v2-loading-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  const partialFixture = await openVaultOverviewV2(page, "vault-overview-v2-partial-loading");
  await expect(partialFixture.getByRole("link", { name: "main", exact: true })).toBeVisible();
  await expect(partialFixture.getByLabel("Loading production destinations")).toBeVisible();
  await expect(
    partialFixture.getByRole("button", {
      name: /Show the exact preview for each pull request/,
    }),
  ).toBeVisible();
  await expect(partialFixture).toHaveScreenshot("vault-overview-v2-partial-loading-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("preserves repository identity at the minimum sidebar width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2", {
    ...VAULT_OVERVIEW_V2_SIDEBAR_STATE,
    leftMobileWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
    mobilePane: "left",
  });

  const selectedVault = fixture.getByRole("link", {
    name: /samebase\/samebase, 4\/4 passed/,
  });
  await expect(selectedVault).toBeVisible();
  await expect(selectedVault.getByText("samebase/", { exact: true })).toBeHidden();
  await expect(selectedVault.getByText("samebase", { exact: true })).toBeVisible();
  await expect(selectedVault.getByText("4/4 passed", { exact: true })).toBeVisible();
  await expect(fixture.getByRole("navigation", { name: "Vaults" })).toHaveScreenshot(
    "vault-overview-v2-minimum-sidebar.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("exposes each raw source separately in developer mode", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2-dev");

  await expect(fixture.getByRole("heading", { name: "Data inspector" })).toBeVisible();
  const vaultContract = fixture.getByText("Vault contract", { exact: true });
  await vaultContract.click();
  await expect(vaultContract.locator("..").locator("pre")).toContainText(
    '"repositoryFullName": "samebase/samebase"',
  );
  await expect(fixture.getByText("GitHub observations", { exact: true })).toBeVisible();
  await expect(fixture.getByText("Cloudflare observations", { exact: true })).toBeVisible();
  await expect(fixture.getByText("Convex observations", { exact: true })).toBeVisible();
  await expect(fixture.getByText("Derived presentation", { exact: true })).toBeVisible();
});
