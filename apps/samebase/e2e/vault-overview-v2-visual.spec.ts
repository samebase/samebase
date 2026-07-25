import { expect, test, type Page } from "@playwright/test";
import type { VaultOverviewVisualMode } from "../src/components/vault-dashboard/VaultOverviewVisualFixture";
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
  VaultOverviewVisualMode,
  | "vault-overview-v2"
  | "vault-overview-v2-auto-pagination"
  | "vault-overview-v2-dev"
  | "vault-overview-v2-loading"
  | "vault-overview-v2-partial-loading"
  | "vault-overview-v2-provisioning-source"
  | "vault-overview-v2-provisioning-github"
  | "vault-overview-v2-provisioning-early-empty"
  | "vault-overview-v2-provisioning-complete-empty"
  | "vault-overview-v2-provisioning-stale-empty"
  | "vault-overview-v2-provisioning-commit"
  | "vault-overview-v2-provisioning-worker"
  | "vault-overview-v2-provisioning-ready"
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

  const samebaseLink = vaultNavigation.getByRole("link", {
    name: "samebase/samebase",
    exact: true,
  });
  await expect(samebaseLink).toHaveAttribute("href", "/vault/samebase/samebase");
  await expect(
    vaultNavigation.getByRole("link", { name: "noter/guestbook", exact: true }),
  ).toHaveAttribute("href", "/vault/noter/guestbook");
  await expect(fixture).toHaveScreenshot("vault-overview-v2-root.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  const linkBounds = await samebaseLink.boundingBox();
  const rowBounds = await samebaseLink.locator("..").boundingBox();
  expect(linkBounds).not.toBeNull();
  expect(rowBounds).not.toBeNull();
  if (linkBounds && rowBounds) {
    expect(Math.abs(linkBounds.width - rowBounds.width)).toBeLessThanOrEqual(1);
  }
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
  await expect(fixture.getByRole("button", { name: "Filters" })).toHaveCount(0);
  const deploymentActions = fixture.getByRole("button", {
    name: "Open calm-swan-123 actions",
  });
  await deploymentActions.click();
  await expect(page.getByRole("menuitem", { name: "Data" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Schema" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fixture.getByText("apps/domain-router", { exact: true })).toBeVisible();
  await expect(fixture.getByText("apps/samebase", { exact: true }).first()).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-overview-v2-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("opens the production Convex Schema route", async ({ page }) => {
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2");

  await fixture.getByRole("button", { name: "Open calm-swan-123 actions" }).click();
  await page.getByRole("menuitem", { name: "Schema" }).click();

  await expect(page).toHaveURL(
    "/vault/samebase/samebase/schema/main/project/convex-project-samebase",
  );
});

test("loads the next pull request page at the scroll end", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 520 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2-auto-pagination");
  const pullRequests = fixture.getByRole("region", { name: "Open pull requests" });
  const sentinel = pullRequests.locator("[data-pull-request-load-more-sentinel]");

  await expect(pullRequests.locator("[data-pull-request-number]")).toHaveCount(6);
  await expect(pullRequests.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expect(sentinel).toHaveCount(1);

  await sentinel.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await expect(pullRequests.locator("[data-pull-request-number]")).toHaveCount(8);
  await expect(sentinel).toHaveCount(0);
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

  await firstPullRequest.click();
  await expect(fixture.getByRole("link", { name: "Branch preview" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Built" }).first()).toBeVisible();
  await expect(fixture.getByRole("link", { name: "View changes" }).first()).toBeVisible();
  await expect(
    fixture.getByRole("link", { name: "precise-otter-1260", exact: true }),
  ).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-overview-v2-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
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
  await expect(partialFixture.getByLabel("Loading Convex deployment")).toBeVisible();
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

test("reproduces the observed new repository provisioning states", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 995 });

  const sourceFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-source");
  await expect(sourceFixture.getByRole("status")).toHaveText("Creating GitHub repository");
  await expect(sourceFixture.getByText("The GitHub repository is not ready yet.")).toHaveCount(0);
  await expect(sourceFixture.getByRole("heading", { name: "Open pull requests" })).toHaveCount(0);

  const githubFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-github");
  await expect(githubFixture.getByRole("status")).toHaveText("Syncing repository files");
  await expect(githubFixture.getByLabel("Loading default branch")).toHaveCount(0);
  await expect(githubFixture.getByRole("heading", { name: "Open pull requests" })).toHaveCount(0);

  const earlyEmptyFixture = await openVaultOverviewV2(
    page,
    "vault-overview-v2-provisioning-early-empty",
  );
  await expect(earlyEmptyFixture.getByRole("status")).toHaveText("Connecting Cloudflare Worker");
  await expect(earlyEmptyFixture.getByText("No default branch commit is available.")).toHaveCount(
    0,
  );
  await expect(earlyEmptyFixture.getByText("No open pull requests.")).toHaveCount(0);

  const completeEmptyFixture = await openVaultOverviewV2(
    page,
    "vault-overview-v2-provisioning-complete-empty",
  );
  await expect(completeEmptyFixture.getByRole("status")).toHaveCount(0);
  await expect(
    completeEmptyFixture.getByText("No default branch commit is available."),
  ).toBeVisible();
  await expect(completeEmptyFixture.getByText("No open pull requests.")).toBeVisible();

  const staleEmptyFixture = await openVaultOverviewV2(
    page,
    "vault-overview-v2-provisioning-stale-empty",
  );
  await expect(
    staleEmptyFixture.getByText("Some pull request data may be out of date."),
  ).toBeVisible();

  const commitFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-commit");
  await expect(commitFixture.getByText("chore: seed starter template")).toBeVisible();
  await expect(commitFixture.getByLabel("Loading Convex deployment")).toBeVisible();

  const workerFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-worker");
  await expect(
    workerFixture.getByText("tmp-f149-vault-loading-states.pfp.workers.dev"),
  ).toBeVisible();
  await expect(workerFixture.getByLabel("Loading Convex deployment")).toBeVisible();

  const readyFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-ready");
  await expect(readyFixture.getByText("dazzling-pheasant-894")).toBeVisible();
  await expect(readyFixture.getByText("No open pull requests.")).toBeVisible();
});

test("preserves repository identity at the minimum sidebar width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2", {
    ...VAULT_OVERVIEW_V2_SIDEBAR_STATE,
    leftMobileWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
    mobilePane: "left",
  });
  const vaultNavigation = fixture.getByRole("navigation", { name: "Vaults" });

  const selectedVault = vaultNavigation.getByRole("link", {
    name: "samebase/samebase",
    exact: true,
  });
  await expect(selectedVault).toBeVisible();
  await expect(selectedVault.getByText("samebase/", { exact: true })).toBeHidden();
  await expect(selectedVault.getByText("samebase", { exact: true })).toBeVisible();
  await expect(selectedVault.getByText("4/4 passed", { exact: true })).toBeVisible();
  await expect(vaultNavigation).toHaveScreenshot("vault-overview-v2-minimum-sidebar.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
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
