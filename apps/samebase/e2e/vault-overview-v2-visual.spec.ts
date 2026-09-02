import { expect, test, type Page } from "@playwright/test";
import type { VaultOverviewVisualMode } from "../src/components/vault-dashboard/VaultOverviewVisualFixture";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;
const MOBILE_MINIMUM_SIDEBAR_WIDTH_PX = 130;
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

type VaultOverviewV2VisualMode = VaultOverviewVisualMode;

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

  const fixture =
    mode === "vault-overview-v2-convex-schema"
      ? page.getByTestId(mode)
      : mode.includes("-dialog") || mode === "vault-overview-v2-cloudflare-builds-repair"
        ? page.getByRole("dialog")
        : page.locator('[data-sidebar-layout-part="root"]');
  await expect(fixture).toBeVisible();
  return fixture;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("uses the overview repository rows on the canonical root route", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 640 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2-root");
  const vaultNavigation = fixture.getByRole("navigation", { name: "Repositories" });

  const samebaseLink = vaultNavigation.getByRole("link", {
    name: "samebase/samebase, 4/4 passed, 2 Cloudflare Workers, 1 Convex project, 3 open pull requests",
    exact: true,
  });
  await expect(samebaseLink).toHaveAttribute("href", "/repo/samebase/samebase");
  await expect(
    vaultNavigation.getByRole("link", {
      name: "samebase/marketing-site, 4/4 passed, 2 Cloudflare Workers, 3 open pull requests",
      exact: true,
    }),
  ).toHaveAttribute("href", "/repo/samebase/marketing-site");
  await expect(
    vaultNavigation.getByRole("link", {
      name: "noter/guestbook, 4/4 passed, 1 Convex project",
      exact: true,
    }),
  ).toHaveAttribute("href", "/repo/noter/guestbook");
  const emptyOwnerButton = vaultNavigation.getByRole("button", {
    name: "empty-owner",
    exact: true,
  });
  const noterButton = vaultNavigation.getByRole("button", { name: "noter", exact: true });
  const samebaseButton = vaultNavigation.getByRole("button", {
    name: "samebase",
    exact: true,
  });
  await expect(emptyOwnerButton).toHaveAttribute("aria-expanded", "true");
  await expect(noterButton).toHaveAttribute("aria-expanded", "true");
  await expect(samebaseButton).toHaveAttribute("aria-expanded", "true");
  await expect(fixture.getByText("No repositories", { exact: true })).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-overview-v2-root.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("centers the root repository list in a wide main pane", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 640 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2-root");

  await expect(fixture).toHaveScreenshot("vault-overview-v2-root-wide.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("shows the shared overview model on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2");
  const vaultNavigation = fixture.getByRole("navigation", { name: "Repositories" });

  await expect(
    vaultNavigation.getByRole("button", { name: "empty-owner", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(vaultNavigation.getByRole("button", { name: "noter", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(
    vaultNavigation.getByRole("button", { name: "samebase", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    vaultNavigation.getByRole("link", {
      name: "noter/guestbook, 4/4 passed, 2 Cloudflare Workers, 1 Convex project, 3 open pull requests",
    }),
  ).toHaveCount(0);

  await expect(fixture.getByRole("link", { name: "main", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/samebase/samebase/tree/main",
  );
  await expect(fixture.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
    "href",
    "/repo/samebase/samebase",
  );
  await expect(fixture.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "href",
    "/repo/samebase/samebase/settings",
  );
  await expect(
    fixture.getByRole("link", { name: "Open pull request #1260 on GitHub" }),
  ).toHaveAttribute("href", "https://github.com/samebase/samebase/pull/1260");
  await expect(fixture.getByRole("button", { name: "Filters" })).toHaveCount(0);
  await expect(fixture.locator('[data-pull-request-number="1258"]')).toBeVisible();
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
    "/repo/samebase/samebase/schema/main/project/convex-project-samebase",
  );
});

test("shows comment-discovered hosting previews on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2");
  const pullRequestRow = fixture.locator('[data-pull-request-number="1260"]');

  await pullRequestRow.getByRole("button", { name: "Show pull request #1260 details" }).click();
  await expect(pullRequestRow.getByText("apps/domain-router", { exact: true })).toBeVisible();
  await expect(pullRequestRow.getByText("apps/samebase", { exact: true })).toBeVisible();
  await expect(pullRequestRow.getByText("Cloudflare Workers", { exact: true })).toHaveCount(0);
  const otherPreviews = pullRequestRow.getByRole("group", { name: "Other previews" });
  await expect(otherPreviews).toBeVisible();
  await expect(
    otherPreviews.getByRole("link", {
      name: "Connect Cloudflare Worker unconnected-preview-worker in repository settings",
    }),
  ).toHaveAttribute(
    "href",
    "/repo/samebase/samebase/settings?mode=vault-overview-v2&add-cloudflare",
  );
  await expect(
    otherPreviews.getByRole("link", {
      name: "Cloudflare Worker unconnected-preview-worker: Branch preview",
    }),
  ).toHaveAttribute(
    "href",
    "https://codex-live-provider-truth-01-unconnected-preview-worker.samebase.workers.dev",
  );
  await expect(
    otherPreviews.getByRole("link", { name: "Netlify samebase: Deploy preview" }),
  ).toHaveAttribute("href", "https://deploy-preview-1260--samebase.netlify.app");
  await expect(pullRequestRow).toHaveScreenshot("vault-overview-v2-other-previews-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("shows one Cloudflare build status error for an unreadable comment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openVaultOverviewV2(
    page,
    "vault-overview-v2-cloudflare-build-status-unavailable",
  );
  const pullRequestRow = fixture.locator('[data-pull-request-number="1260"]');

  await pullRequestRow.getByRole("button", { name: "Show pull request #1260 details" }).click();
  await expect(
    pullRequestRow.getByText("Could not load Cloudflare build status", { exact: true }),
  ).toBeVisible();
  await expect(pullRequestRow.getByText("Unavailable", { exact: true })).toHaveCount(0);
  await expect(pullRequestRow).toHaveScreenshot(
    "vault-overview-v2-cloudflare-build-status-unavailable-mobile.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("loads the next pull request page at the scroll end", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 520 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2-auto-pagination");
  const pullRequests = fixture.getByRole("region", { name: "Open pull requests" });
  const sentinel = pullRequests.locator("[data-pull-request-load-more-sentinel]");

  await expect(
    pullRequests.getByRole("heading", { name: "8 open pull requests", exact: true }),
  ).toBeVisible();
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
  const firstPullRequestRow = firstPullRequest.locator("xpath=ancestor::article");
  await expect(firstPullRequestRow).toContainText("+40");
  await expect(firstPullRequestRow).toContainText("−10");
  await expect(firstPullRequestRow).toContainText("3 files");

  await firstPullRequest.click();
  await expect(firstPullRequestRow.getByText("apps/domain-router", { exact: true })).toBeVisible();
  await expect(firstPullRequestRow.getByText("apps/samebase", { exact: true })).toBeVisible();
  await expect(firstPullRequestRow.getByText("Cloudflare Workers", { exact: true })).toHaveCount(0);
  await expect(firstPullRequestRow.getByRole("link", { name: "Building" })).toHaveAttribute(
    "href",
    "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/samebase-worker/production/builds/comment-build-1260",
  );
  await expect(
    firstPullRequestRow.getByRole("link", { name: "Branch preview", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://codex-restore-convex-dashboard-links-samebase-worker.samebase.workers.dev",
  );
  await expect(
    firstPullRequestRow
      .getByRole("group", { name: "Cloudflare Worker samebase-worker", exact: true })
      .getByText("May be from an earlier commit", { exact: true }),
  ).toBeVisible();
  await expect(firstPullRequestRow.getByRole("link", { name: "Built", exact: true })).toBeVisible();
  await expect(
    firstPullRequestRow.getByRole("link", { name: "precise-otter-1260", exact: true }),
  ).toBeVisible();
  await expect(
    firstPullRequestRow
      .getByRole("group", { name: "Convex deployment precise-otter-1260", exact: true })
      .getByText("May be from an earlier commit", { exact: true }),
  ).toBeVisible();
  const otherPreviews = firstPullRequestRow.getByRole("group", { name: "Other previews" });
  await expect(otherPreviews).toBeVisible();
  await expect(
    otherPreviews.getByRole("link", {
      name: "Connect Cloudflare Worker unconnected-preview-worker in repository settings",
    }),
  ).toBeVisible();
  await expect(
    otherPreviews.getByRole("link", { name: "Netlify samebase: Deploy preview" }),
  ).toBeVisible();
  await firstPullRequestRow
    .getByRole("button", { name: "Open precise-otter-1260 actions" })
    .click();
  await expect(page.getByRole("menuitem", { name: "Data" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Schema" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, 0));
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
    fixture.getByRole("button", {
      name: "Configure Workers Builds for GitHub for Cloudflare Worker Samebase/domain-router",
      exact: true,
    }),
  ).toBeVisible();
  await fixture
    .getByRole("button", {
      name: "Actions for Cloudflare Worker Samebase/domain-router",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("menuitem", {
      name: "Remove from repository for Cloudflare Worker Samebase/domain-router",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await fixture
    .getByRole("button", {
      name: "Actions for Convex project samebase/samebase",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("menuitem", {
      name: "Remove from repository for Convex project samebase/samebase",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fixture).toHaveScreenshot("vault-overview-v2-settings-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("covers the mobile repository removal dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openVaultOverviewV2(page, "vault-overview-v2-delete-dialog");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Remove .* from Samebase/ })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(3);
  await expect(dialog).toHaveScreenshot("vault-overview-v2-delete-dialog-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("covers Convex connection dialog states", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  const cases = [
    ["vault-overview-v2-convex-dialog", "vault-overview-v2-convex-dialog.png"],
    ["vault-overview-v2-convex-dialog-loading", "vault-overview-v2-convex-dialog-loading.png"],
    ["vault-overview-v2-convex-dialog-error", "vault-overview-v2-convex-dialog-error.png"],
  ] as const satisfies readonly [VaultOverviewV2VisualMode, string][];

  for (const [mode, screenshotName] of cases) {
    await openVaultOverviewV2(page, mode);
    if (mode === "vault-overview-v2-convex-dialog-loading") {
      await page.addStyleTag({ content: ".animate-spin { animation: none !important; }" });
    }
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot(screenshotName, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    });
  }
});

test("covers Cloudflare connection and Builds repair states", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cases = [
    ["vault-overview-v2-cloudflare-dialog", "vault-overview-v2-cloudflare-dialog-mobile.png"],
    [
      "vault-overview-v2-cloudflare-dialog-normalized-name",
      "vault-overview-v2-cloudflare-dialog-normalized-name-mobile.png",
    ],
    [
      "vault-overview-v2-cloudflare-dialog-loading",
      "vault-overview-v2-cloudflare-dialog-loading-mobile.png",
    ],
    [
      "vault-overview-v2-cloudflare-builds-repair",
      "vault-overview-v2-cloudflare-builds-repair-mobile.png",
    ],
  ] as const satisfies readonly [VaultOverviewV2VisualMode, string][];

  for (const [mode, screenshotName] of cases) {
    await openVaultOverviewV2(page, mode);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    if (mode === "vault-overview-v2-cloudflare-dialog-normalized-name") {
      await expect(dialog.getByRole("status")).toContainText("Samebase will use samebase-app.");
      await expect(dialog.getByRole("button", { name: "Use samebase-app" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Create Worker" })).toBeEnabled();
    }
    if (
      mode === "vault-overview-v2-cloudflare-dialog-normalized-name" ||
      mode === "vault-overview-v2-cloudflare-builds-repair"
    ) {
      const apiToken = dialog.getByRole("combobox", { name: "API token" });
      await expect(apiToken).toBeVisible();
      await expect(apiToken).toContainText("Last used");
    }
    if (mode === "vault-overview-v2-cloudflare-builds-repair") {
      const repositoryRoot = dialog.getByRole("combobox", { name: "Repository root" });
      await expect(dialog.getByText("Samebase will use the saved repository root.")).toBeVisible();
      await expect(dialog).toBeFocused();
      await expect(repositoryRoot).not.toBeFocused();
      await expect(repositoryRoot).toBeDisabled();
      await expect(repositoryRoot).toHaveAttribute("aria-expanded", "false");
      await expect(
        dialog.getByRole("listbox", { name: "Repository folder suggestions" }),
      ).toHaveCount(0);
    }
    await expect(dialog).toHaveScreenshot(screenshotName, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    });
  }
});

test("covers default-branch and pull-request check details", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2");

  await fixture.getByTitle("Show main checks").click();
  const defaultBranchPopover = page.getByRole("dialog", { name: "main checks" });
  await expect(defaultBranchPopover).toBeVisible();
  await expect(defaultBranchPopover).toHaveScreenshot(
    "vault-overview-v2-default-branch-checks.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );

  await page.keyboard.press("Escape");
  await fixture.getByTitle("Show pull request #1260 checks").click();
  const pullRequestPopover = page.getByRole("dialog", {
    name: "Pull request #1260 checks",
  });
  await expect(pullRequestPopover).toBeVisible();
  await expect(pullRequestPopover).toHaveScreenshot("vault-overview-v2-pull-request-checks.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("renders and drags the production Convex schema graph", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopFixture = await openVaultOverviewV2(page, "vault-overview-v2-convex-schema");
  const schemaNodes = desktopFixture.locator(".react-flow__node-schemaTable");
  await expect(schemaNodes).toHaveCount(5);
  await expect(desktopFixture).toHaveScreenshot("vault-overview-v2-convex-schema-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  const firstNode = schemaNodes.first();
  const beforeDrag = await firstNode.boundingBox();
  expect(beforeDrag).not.toBeNull();
  if (beforeDrag) {
    await page.mouse.move(
      beforeDrag.x + beforeDrag.width / 2,
      beforeDrag.y + beforeDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      beforeDrag.x + beforeDrag.width / 2 + 60,
      beforeDrag.y + beforeDrag.height / 2 + 40,
      { steps: 5 },
    );
    await page.mouse.up();
    const afterDrag = await firstNode.boundingBox();
    expect(afterDrag).not.toBeNull();
    if (afterDrag) {
      expect(afterDrag.x).toBeGreaterThan(beforeDrag.x + 30);
      expect(afterDrag.y).toBeGreaterThan(beforeDrag.y + 20);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFixture = await openVaultOverviewV2(page, "vault-overview-v2-convex-schema");
  await expect(mobileFixture.locator(".react-flow__node-schemaTable")).toHaveCount(5);
  await expect(mobileFixture).toHaveScreenshot("vault-overview-v2-convex-schema-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("uses stable shells while independent data sources load", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const loadingFixture = await openVaultOverviewV2(page, "vault-overview-v2-loading");

  await expect(loadingFixture.getByLabel("Loading repository overview")).toBeVisible();
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

  const settingsFixture = await openVaultOverviewV2(page, "vault-overview-v2-settings-loading");
  await expect(settingsFixture.getByLabel("Loading repository settings")).toBeVisible();
  await expect(settingsFixture).toHaveScreenshot("vault-overview-v2-settings-loading-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("keeps available resources visible when one provider fails", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  const fixture = await openVaultOverviewV2(page, "vault-overview-v2-provider-failed");

  await expect(fixture.getByText("Deploy status unavailable.")).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(fixture.getByText("calm-swan-123")).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-overview-v2-provider-failed.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("shows Cloudflare GitHub App authorization recovery", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
  const fixture = await openVaultOverviewV2(
    page,
    "vault-overview-v2-cloudflare-github-authorization-failed",
  );
  const repositoryFullName = "noter-guest/tmp-testing-waters";
  const recoveryUrl =
    "https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#reinstall-the-cloudflare-github-app";

  await expect(
    fixture.getByRole("heading", {
      name: `Cloudflare Workers and Pages GitHub App is not authorized for ${repositoryFullName}.`,
    }),
  ).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Cloudflare recovery guide" })).toHaveAttribute(
    "href",
    recoveryUrl,
  );
  await expect(
    fixture.getByRole("link", { name: "Open the Cloudflare Workers and Pages GitHub App" }),
  ).toHaveAttribute("href", "https://github.com/apps/cloudflare-workers-and-pages");
  await expect(fixture.getByRole("link", { name: "Open Workers & Pages" })).toHaveAttribute(
    "href",
    "https://dash.cloudflare.com/",
  );
  await expect(fixture.locator("ol > li")).toHaveCount(3);
  await expect(fixture.getByText(`then include ${repositoryFullName}.`)).toBeVisible();
  await expect(fixture.getByText("Return to Samebase and select Retry.")).toBeVisible();
  await expect(fixture).toHaveScreenshot(
    "vault-overview-v2-cloudflare-github-authorization-failed.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("reproduces the observed new repository provisioning states", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 995 });

  const sourceFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-source");
  await expect(sourceFixture.getByRole("status")).toHaveText("Creating GitHub repository");
  await expect(sourceFixture.getByText("The GitHub repository is not ready yet.")).toHaveCount(0);
  await expect(sourceFixture.getByRole("heading", { name: "Open pull requests" })).toHaveCount(0);

  const githubFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-github");
  await expect(githubFixture.getByRole("status")).toHaveText("Setting up");
  await expect(githubFixture.getByLabel("Loading default branch")).toBeVisible();
  await expect(githubFixture.getByRole("heading", { name: "Open pull requests" })).toBeVisible();

  const earlyEmptyFixture = await openVaultOverviewV2(
    page,
    "vault-overview-v2-provisioning-early-empty",
  );
  await expect(earlyEmptyFixture.getByRole("status")).toHaveText("Setting up");
  await expect(earlyEmptyFixture.getByText("No default branch commit is available.")).toBeVisible();
  await expect(earlyEmptyFixture.getByText(/^No open pull requests\.?$/)).toHaveCount(1);

  const completeEmptyFixture = await openVaultOverviewV2(
    page,
    "vault-overview-v2-provisioning-complete-empty",
  );
  await expect(completeEmptyFixture.getByRole("status")).toHaveCount(0);
  await expect(
    completeEmptyFixture.getByText("No default branch commit is available."),
  ).toBeVisible();
  await expect(completeEmptyFixture.getByText(/^No open pull requests\.?$/)).toHaveCount(1);

  const staleEmptyFixture = await openVaultOverviewV2(
    page,
    "vault-overview-v2-provisioning-stale-empty",
  );
  await expect(
    staleEmptyFixture.getByText("Some pull request data may be out of date."),
  ).toBeVisible();
  await expect(staleEmptyFixture.getByText(/^No open pull requests\.?$/)).toHaveCount(1);

  const commitFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-commit");
  await expect(commitFixture.getByText("Initialize Samebase app")).toBeVisible();
  await expect(commitFixture.getByLabel("Loading Convex deployment")).toBeVisible();

  const workerFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-worker");
  await expect(
    workerFixture.getByText("tmp-f149-vault-loading-states.pfp.workers.dev"),
  ).toBeVisible();
  await expect(workerFixture.getByLabel("Loading Convex deployment")).toBeVisible();

  const readyFixture = await openVaultOverviewV2(page, "vault-overview-v2-provisioning-ready");
  await expect(readyFixture.getByText("dazzling-pheasant-894")).toBeVisible();
  await expect(readyFixture.getByText(/^No open pull requests\.?$/)).toHaveCount(1);
});

test("shows stable provider setup states in Settings", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 995 });

  const activeFixture = await openVaultOverviewV2(page, "vault-overview-v2-settings-active");
  const activeConnections = activeFixture
    .getByRole("heading", { name: "Connections" })
    .locator("..")
    .locator("..");
  await expect(activeConnections.getByText("Setting up", { exact: true })).toHaveCount(1);
  await expect(
    activeConnections.getByText("Setting up in 🇪🇺 EU West (Ireland)", { exact: true }),
  ).toBeVisible();
  await expect(activeFixture.getByText("38516/", { exact: true })).toBeVisible();
  await expect(activeFixture.getByText("Attention required")).toHaveCount(0);
  await expect(activeFixture.getByText("A provider operation is in progress.")).toBeVisible();
  await expect(activeFixture.getByRole("button", { name: "Add Cloudflare Worker" })).toBeDisabled();
  await expect(activeFixture.getByRole("button", { name: "Add Convex project" })).toBeDisabled();
  await expect(activeFixture.getByRole("button", { name: "Remove from Samebase" })).toBeDisabled();
  await expect(activeFixture).toHaveScreenshot("vault-overview-v2-settings-active.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  const checkingFixture = await openVaultOverviewV2(page, "vault-overview-v2-settings-checking");
  await expect(checkingFixture.getByText("Checking", { exact: true })).toHaveCount(2);
  await expect(checkingFixture.getByText("Attention required")).toHaveCount(0);
  await expect(checkingFixture.getByRole("button", { name: "Reload" })).toHaveCount(0);
  await expect(checkingFixture).toHaveScreenshot("vault-overview-v2-settings-checking.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  const completedFixture = await openVaultOverviewV2(page, "vault-overview-v2-settings-completed");
  await expect(completedFixture.getByText("Setting up", { exact: true })).toHaveCount(0);
  await expect(completedFixture.getByText("Checking", { exact: true })).toHaveCount(0);
  const completedConnections = completedFixture
    .getByRole("heading", { name: "Connections" })
    .locator("..")
    .locator("..");
  await expect(
    completedConnections.getByText("tmp-f149-vault-loading-states", { exact: true }),
  ).toHaveCount(2);
  await expect(completedFixture.getByText("Attention required")).toHaveCount(0);
  await expect(completedFixture).toHaveScreenshot("vault-overview-v2-settings-completed.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  const driftFixture = await openVaultOverviewV2(page, "vault-overview-v2-settings-drift");
  await expect(
    driftFixture.getByText(/Cloudflare now uses the name tmp-f149-vault-loading-states-renamed\./),
  ).toBeVisible();
  await expect(driftFixture.getByText(/Cloudflare now builds from apps\/web\./)).toBeVisible();
  await expect(driftFixture.getByRole("button", { name: /^Update name for/ })).toBeEnabled();
  await expect(driftFixture.getByRole("button", { name: /^Update root for/ })).toBeEnabled();
  await expect(driftFixture).toHaveScreenshot("vault-overview-v2-settings-drift.png", {
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
    leftMobileWidthPx: MOBILE_MINIMUM_SIDEBAR_WIDTH_PX,
    mobilePane: "left",
  });
  const vaultNavigation = fixture.getByRole("navigation", { name: "Repositories" });

  const selectedVault = vaultNavigation.getByRole("link", {
    name: "samebase/samebase, 4/4 passed, 2 Cloudflare Workers, 1 Convex project, 3 open pull requests",
    exact: true,
  });
  await expect(selectedVault).toBeVisible();
  await expect(selectedVault.getByText("samebase/", { exact: true })).toBeHidden();
  await expect(selectedVault.getByText("samebase", { exact: true })).toBeVisible();
  await expect(selectedVault.getByText("4/4 passed", { exact: true })).toBeVisible();
  for (const organizationName of ["noter", "empty-owner", "samebase"]) {
    await expect(
      vaultNavigation
        .getByRole("button", { name: organizationName, exact: true })
        .locator(".lucide-chevron-down"),
    ).toBeHidden();
  }
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
  const sectionHeadings = await fixture.getByRole("heading", { level: 2 }).allTextContents();
  expect(sectionHeadings.indexOf("Data inspector")).toBeLessThan(
    sectionHeadings.indexOf("3 open pull requests"),
  );
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
