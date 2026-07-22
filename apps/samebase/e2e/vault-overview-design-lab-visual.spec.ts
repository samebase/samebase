import { expect, test, type Page } from "@playwright/test";
import type { VaultOverviewDesignLabVisualMode } from "../src/components/vault-dashboard/VaultOverviewDesignLabVisualFixture";
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

async function openVaultOverviewDesignLab(page: Page, mode: VaultOverviewDesignLabVisualMode) {
  await page.addInitScript(
    ({ state, storageKey, version }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ state, version }));
    },
    {
      state: VAULT_OVERVIEW_DESIGN_LAB_SIDEBAR_STATE,
      storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      version: STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION,
    },
  );
  await page.goto(`/visual-fixture?mode=${mode}`, {
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

test.describe("touch-first phone", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("collapses a single-root app without losing its resources", async ({ page }) => {
    const lab = await openVaultOverviewDesignLab(page, "vault-overview-lab-simple");

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
  });
});
