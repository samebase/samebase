import { expect, test } from "@playwright/test";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;
const PROVIDERS_PAGE_VISUAL_SIDEBAR_STATE = {
  leftDesktopOpen: false,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

test("providers page keeps the right sidebar available", async ({ page }) => {
  await page.addInitScript(
    ({ sidebarState, storageKey, version }) => {
      localStorage.setItem(storageKey, JSON.stringify({ state: sidebarState, version }));
    },
    {
      sidebarState: PROVIDERS_PAGE_VISUAL_SIDEBAR_STATE,
      storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      version: STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION,
    },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/visual-fixture?mode=providers-page", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("providers-page-provider-row")).toHaveCount(3, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("workspace-layout-v2-pane-right")).toContainText("/home");
  await expect(page.getByTestId("providers-sidebar-home")).toHaveCount(0);
  await expect(page).toHaveScreenshot("providers-page-right-sidebar.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
