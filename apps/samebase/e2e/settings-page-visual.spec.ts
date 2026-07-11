import { devices, expect, test, type Page } from "@playwright/test";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import { signInIfNeeded } from "./liveHelpers";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;
const screenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

async function openSettings(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/settings");
  await page.waitForLoadState("networkidle");
}

test("Settings page uses the authenticated account surface", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await openSettings(page);

  const settingsPage = page.getByTestId("user-settings-page");
  const signInEmail = settingsPage.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL, { exact: true });
  await expect(settingsPage).toBeVisible();
  await expect(settingsPage.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(settingsPage.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(settingsPage.getByLabel("Display name")).toHaveCSS("font-size", "16px");
  await expect(settingsPage).toHaveScreenshot("settings-page-desktop.png", {
    ...screenshotOptions,
    mask: [signInEmail],
    maskColor: "#d1d5db",
  });
});

test("Settings link returns the mobile workspace to the main pane", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for mobile Settings tests.");
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const sidebarState = {
    leftDesktopOpen: true,
    leftDesktopWidthPx: 240,
    leftMobileWidthPx: 240,
    mobilePane: "right",
    mobileSurface: { kind: "unmerged" },
    rightDesktopOpen: true,
    rightDesktopWidthPx: 288,
    rightMobileWidthPx: 288,
  } satisfies WorkspaceSidebarState;
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

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(page, "/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/u);
    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "main",
    );

    const settingsPage = page.getByTestId("user-settings-page");
    await expect(settingsPage).toBeVisible();
    await expect(settingsPage).toHaveScreenshot("settings-page-mobile.png", {
      ...screenshotOptions,
      mask: [settingsPage.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL, { exact: true })],
      maskColor: "#d1d5db",
    });
  } finally {
    await context.close();
  }
});
