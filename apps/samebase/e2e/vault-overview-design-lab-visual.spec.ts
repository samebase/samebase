import { expect, test, type Page } from "@playwright/test";
import type { VaultOverviewDesignLabVisualMode } from "../src/components/vault-dashboard/VaultOverviewDesignLabVisualFixture";
import { WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX } from "../src/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;
const VAULT_OVERVIEW_DESIGN_LAB_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: false,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

async function openVaultOverviewDesignLab(
  page: Page,
  mode: VaultOverviewDesignLabVisualMode,
  sidebarState: WorkspaceSidebarState = VAULT_OVERVIEW_DESIGN_LAB_SIDEBAR_STATE,
  view: "overview" | "settings" = "overview",
) {
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
  const viewSearch = view === "settings" ? "&view=settings" : "";
  await page.goto(`/visual-fixture?mode=${mode}${viewSearch}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const lab = page.getByTestId("vault-overview-design-lab");
  await expect(lab).toBeVisible();
  return lab;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("shows default branch and pull request apps in the monorepo concept", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const lab = await openVaultOverviewDesignLab(page, "vault-overview-lab-monorepo");

  await expect(page.getByText("apps/domain-router", { exact: true })).toBeVisible();
  await expect(page.getByText("apps/samebase", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Discover default-layout Convex projects/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "14 passed" })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
  await expect(page.getByText("codex/discover-default-layout-convex-projects")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open pull request #1263 on GitHub" }),
  ).toHaveAttribute("href", "https://github.com/samebase/samebase/pull/1263");
  const defaultBranch = page.getByRole("region", { name: "Default branch" });
  await expect(
    defaultBranch.getByRole("link", { name: "domain-router", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://dash.cloudflare.com/?to=/fe57d01d7ab41f60d00ba1aade20eb33/workers/services/view/domain-router/production/settings",
  );
  await expect(
    defaultBranch.getByRole("link", { name: "Open domain-router deployment", exact: true }),
  ).toHaveAttribute("href", "https://domain-router.samebase.workers.dev");
  await expect(lab).toHaveScreenshot("vault-overview-design-lab-monorepo.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("keeps the large monorepo compact until apps are requested", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const lab = await openVaultOverviewDesignLab(page, "vault-overview-lab-stress");

  await expect(page.getByRole("button", { name: "Show 7 more apps" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Make checkout retries idempotent/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: /Retry partner webhooks with jitter/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(lab).toHaveScreenshot("vault-overview-design-lab-stress.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("keeps repository identity useful at the desktop sidebar floor", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  const lab = await openVaultOverviewDesignLab(page, "vault-overview-lab-stress", {
    ...VAULT_OVERVIEW_DESIGN_LAB_SIDEBAR_STATE,
    leftDesktopWidthPx: 160,
  });

  const activeVault = page.getByRole("link", {
    name: "samebase/commerce-order-fulfillment-platform, 24/24, 10 Cloudflare Workers, 5 Convex projects, 6 PRs",
  });
  await expect(activeVault).toBeVisible();
  await expect(activeVault.locator("[data-vault-sidebar-owner]")).toHaveText("samebase/");
  await expect(activeVault).toHaveCSS("text-decoration-line", "none");
  await expect(lab).toHaveScreenshot("vault-overview-design-lab-narrow-sidebar.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("keeps repair context beside the affected resource", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const lab = await openVaultOverviewDesignLab(page, "vault-overview-lab-attention");

  await expect(
    page.getByText("plugin-preview-router needs a root before new previews can build"),
  ).toBeVisible();
  await expect(page.getByText("Needs attention", { exact: true }).first()).toBeVisible();
  await expect(lab).toHaveScreenshot("vault-overview-design-lab-attention.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("keeps repository connections and uncommon repairs in settings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const lab = await openVaultOverviewDesignLab(
    page,
    "vault-overview-lab-stress",
    VAULT_OVERVIEW_DESIGN_LAB_SIDEBAR_STATE,
    "settings",
  );

  await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "Add Cloudflare Worker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Convex project" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repository" })).toHaveCount(0);
  await expect(page.locator('[data-settings-root="apps/checkout"]')).toBeVisible();
  await expect(page.getByText("Worker", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Production deployment", { exact: true })).toHaveCount(0);
  const checkoutRoot = page.locator('[data-settings-root="apps/checkout"]');
  await expect(checkoutRoot.getByText("Commerce Platform/", { exact: true })).toBeVisible();
  await expect(checkoutRoot.getByText("commerce-platform/", { exact: true })).toBeVisible();
  await expect(
    checkoutRoot.getByRole("link", { name: "commerce-checkout", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://dash.cloudflare.com/?to=/commerce-platform/workers/services/view/commerce-checkout/production/settings",
  );
  await expect(checkoutRoot.getByRole("link", { name: "checkout", exact: true })).toHaveAttribute(
    "href",
    "https://dashboard.convex.dev/t/commerce-platform/checkout/settings",
  );
  await expect(
    checkoutRoot.getByRole("link", {
      name: "Open commerce-checkout deployment",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://checkout.commerce.example");
  await expect(lab).toHaveScreenshot("vault-overview-design-lab-settings.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("localizes root repair controls to the affected settings row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openVaultOverviewDesignLab(
    page,
    "vault-overview-lab-attention",
    VAULT_OVERVIEW_DESIGN_LAB_SIDEBAR_STATE,
    "settings",
  );

  const attentionRoot = page.locator('[data-settings-root="Needs attention"]');
  await expect(attentionRoot.getByText("plugin-preview-router")).toBeVisible();
  await expect(attentionRoot.getByRole("button", { name: "Configure Builds" })).toBeVisible();
  await expect(
    page.locator('[data-settings-root="packages/codex-plugin"]').getByRole("button", {
      name: "Configure Builds",
    }),
  ).toHaveCount(0);
});

test.describe("touch-first phone", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("keeps vault navigation readable at the minimum mobile pane width", async ({ page }) => {
    const lab = await openVaultOverviewDesignLab(page, "vault-overview-lab-stress", {
      ...VAULT_OVERVIEW_DESIGN_LAB_SIDEBAR_STATE,
      leftMobileWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
      mobilePane: "left",
    });

    const activeVault = page.getByRole("link", {
      name: "samebase/commerce-order-fulfillment-platform, 24/24, 10 Cloudflare Workers, 5 Convex projects, 6 PRs",
    });
    await expect(activeVault).toBeVisible();
    await expect(activeVault.locator("[data-vault-sidebar-owner]")).toBeHidden();
    await expect(activeVault.locator("[data-vault-sidebar-totals]")).toBeHidden();
    await expect(activeVault.locator("[data-vault-sidebar-checks]")).toHaveText("24/24");
    await expect(lab).toHaveScreenshot("vault-overview-design-lab-minimum-mobile-sidebar.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    });
  });

  test("collapses a single-root app without losing its resources", async ({ page }) => {
    const lab = await openVaultOverviewDesignLab(page, "vault-overview-lab-simple");

    const checks = page.getByRole("button", { name: "6 passed" });
    await expect(checks).toBeVisible();
    const checksBounds = await checks.boundingBox();
    if (!checksBounds) {
      throw new Error("Default branch checks button has no rendered bounds");
    }
    expect(checksBounds.height).toBeGreaterThanOrEqual(32);
    await expect(page.locator("[data-pull-request-title]")).toHaveCSS("-webkit-line-clamp", "3");
    const pullRequestLink = page.getByRole("link", {
      name: "Open pull request #48 on GitHub",
    });
    await expect(pullRequestLink).toHaveAttribute(
      "href",
      "https://github.com/noter-guest/guestbook/pull/48",
    );
    const pullRequestLinkBounds = await pullRequestLink.boundingBox();
    if (!pullRequestLinkBounds) {
      throw new Error("Pull request GitHub link has no rendered bounds");
    }
    expect(pullRequestLinkBounds.height).toBeGreaterThanOrEqual(32);
    await expect(page.getByText("guestbook", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Cloudflare").first()).toBeVisible();
    await expect(page.getByLabel("Convex").first()).toBeVisible();
    await expect(page.locator('[data-root-directory="/"]')).toHaveCount(0);
    await expect(lab).toHaveScreenshot("vault-overview-design-lab-simple-mobile.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    });
    await checks.click();
    await expect(page.getByText("Default branch checks", { exact: true })).toBeVisible();
  });

  test("keeps repository roots distinct from their settings resources", async ({ page }) => {
    const lab = await openVaultOverviewDesignLab(
      page,
      "vault-overview-lab-stress",
      VAULT_OVERVIEW_DESIGN_LAB_SIDEBAR_STATE,
      "settings",
    );

    const checkoutRoot = page.locator('[data-settings-root="apps/checkout"]');
    await expect(checkoutRoot.getByText("apps/checkout", { exact: true })).toBeVisible();
    await expect(checkoutRoot.getByText("commerce-checkout", { exact: true })).toBeVisible();
    await expect(checkoutRoot.getByText("checkout", { exact: true })).toBeVisible();
    await expect(lab).toHaveScreenshot("vault-overview-design-lab-settings-mobile.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    });
  });
});
