import { devices, expect, test, type Page } from "@playwright/test";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";
import { signInIfNeeded } from "./liveHelpers";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;
const MOBILE_RIGHT_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "right",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;
const screenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
  timeout: 30_000,
} as const;

async function openSettings(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/settings");
  await page.waitForLoadState("networkidle");
}

async function createPendingAccount(page: Page, email: string) {
  const passwordAuthSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  await passwordAuthSection.getByPlaceholder("you@example.com").waitFor({ state: "visible" });
  await passwordAuthSection.getByRole("button", { name: "Need an account?" }).click();
  await passwordAuthSection.getByPlaceholder("you@example.com").fill(email);
  await passwordAuthSection.getByPlaceholder("Password").fill("settings-test-pass-1234");
  await passwordAuthSection.getByRole("button", { exact: true, name: "Create account" }).click();
  await expect(page.getByRole("link", { exact: true, name: "Account settings" })).toBeVisible();
}

async function blockHydrationScripts(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "script") {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: "",
      contentType: "text/javascript",
      status: 200,
    });
  });
}

test("Settings page uses the authenticated account surface", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await openSettings(page);

  const settingsPage = page.getByTestId("user-settings-page");
  const signInEmail = settingsPage.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL, { exact: true });
  await expect(settingsPage).toBeVisible();
  await expect(settingsPage.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(settingsPage.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(settingsPage.getByRole("heading", { name: "Sign-in methods" })).toBeVisible();
  await expect(settingsPage.getByText("Google", { exact: true })).toHaveCount(0);
  await expect(settingsPage.getByRole("button", { name: "Connect Google" })).toHaveCount(0);
  await expect(settingsPage.getByText("GitHub", { exact: true })).toBeVisible();
  await expect(settingsPage.getByRole("heading", { name: "GitHub access" })).toHaveCount(0);
  await expect(settingsPage.getByRole("heading", { exact: true, name: "Account" })).toBeVisible();
  await expect(settingsPage.getByRole("button", { name: "Authorize GitHub access" })).toHaveCount(
    0,
  );
  await expect(settingsPage.getByRole("heading", { name: "Billing" })).toHaveCount(0);
  await expect(settingsPage.getByRole("button", { name: "Install GitHub App" })).toHaveCount(0);
  await expect(settingsPage.getByRole("button", { name: "Upgrade to Pro, $4/month" })).toHaveCount(
    0,
  );
  await expect(settingsPage.getByText("Cloudflare Workers", { exact: true })).toHaveCount(0);
  await expect(settingsPage.getByText("Convex projects", { exact: true })).toHaveCount(0);
  await expect(settingsPage.getByLabel("Display name")).toHaveCSS("font-size", "16px");
  await expect(settingsPage).toHaveScreenshot("settings-page-desktop.png", {
    ...screenshotOptions,
    mask: [signInEmail],
    maskColor: "#d1d5db",
  });

  await settingsPage.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL(/\/settings\?delete-account$/u);
  const deleteDialog = page.getByRole("dialog", { name: "Delete account?" });
  await expect(
    deleteDialog.getByText(
      "Your account will be disabled now. Permanent deletion will start seven days after you continue.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    deleteDialog.getByText(
      "During those seven days, email contact@samebase.com to restore your account or for other inquiries. Samebase will send you a confirmation email as account deletion finishes.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    deleteDialog.getByText(
      "First, leave or delete every organization. GitHub repositories, Convex projects, Cloudflare Workers, and domains are not deleted.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(deleteDialog).not.toContainText(
    "uncommitted file changes will be permanently deleted",
  );
  await expect(deleteDialog).toContainText("Type the phrase to confirm");
  await expect(deleteDialog.getByRole("button", { name: "Schedule deletion" })).toBeDisabled();
  await expect(deleteDialog.getByLabel("Type the phrase to confirm")).toHaveCSS(
    "font-size",
    "16px",
  );
  const accountDeletionConfirmationText = deleteDialog.locator("code");
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await accountDeletionConfirmationText.click();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await accountDeletionConfirmationText.selectText();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe((await accountDeletionConfirmationText.textContent())?.trim());
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await expect(deleteDialog).toHaveScreenshot(
    "settings-delete-account-dialog-desktop.png",
    screenshotOptions,
  );

  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/settings$/u);
  await expect(deleteDialog).toBeHidden();
});

test("Pending-approval Settings shows only account exit actions on mobile", async ({
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
  const email = `settings-mobile-${testInfo.workerIndex}-${Date.now()}@example.test`;
  await page.addInitScript(
    ({ state, storageKey, version }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ state, version }));
    },
    {
      state: MOBILE_RIGHT_SIDEBAR_STATE,
      storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      version: STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION,
    },
  );

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await createPendingAccount(page, email);
    await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );

    await page.getByRole("link", { name: "Account settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/u);
    await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );
    await page.locator('[data-sidebar-layout-part="carousel"]').evaluate((element) => {
      const mainPane = element.querySelector(
        '[data-sidebar-layout-part="pane"][data-pane-side="main"]',
      );
      if (!(mainPane instanceof HTMLElement)) {
        throw new Error("Expected mobile carousel main pane.");
      }
      const panePeekPx = Number.parseFloat(window.getComputedStyle(element).paddingLeft);

      element.scrollLeft = mainPane.offsetLeft - panePeekPx;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
      "data-mobile-pane",
      "main",
    );

    const settingsPage = page.getByTestId("user-settings-page");
    await expect(settingsPage).toBeVisible();
    await expect(settingsPage.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(settingsPage.getByRole("button", { name: "Delete account" })).toBeVisible();
    await expect(settingsPage.getByRole("heading", { name: "Profile" })).toHaveCount(0);
    await expect(settingsPage.getByRole("heading", { name: "Sign-in methods" })).toHaveCount(0);
    await expect(settingsPage.getByText("MCP clients", { exact: true })).toHaveCount(0);
    await expect(settingsPage).toHaveScreenshot("settings-page-mobile.png", {
      ...screenshotOptions,
      mask: [settingsPage.getByText(email, { exact: true })],
      maskColor: "#d1d5db",
    });

    await settingsPage.getByRole("button", { name: "Delete account" }).click();
    await expect(page).toHaveURL(/\/settings\?delete-account$/u);
    const deleteDialog = page.getByRole("dialog", { name: "Delete account?" });
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog).toHaveScreenshot(
      "settings-delete-account-dialog-mobile.png",
      screenshotOptions,
    );
  } finally {
    await context.close();
  }
});

test("prehydrated mobile Settings reload preserves the selected sidebar", async ({
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
  const email = `settings-prehydration-${testInfo.workerIndex}-${Date.now()}@example.test`;
  await page.addInitScript(
    ({ state, storageKey, version }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ state, version }));
    },
    {
      state: MOBILE_RIGHT_SIDEBAR_STATE,
      storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      version: STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION,
    },
  );

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await createPendingAccount(page, email);
    await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );
    await blockHydrationScripts(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );

    await page.unroute("**/*");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );
    const rightResizeGrip = page.locator(
      '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
    );
    await expect(rightResizeGrip).toBeVisible();
    await expect(
      rightResizeGrip.locator('[data-sidebar-layout-part="resize-grip-indicator"]'),
    ).toBeVisible();
    await expect(rightResizeGrip).toHaveScreenshot(
      "settings-sidebar-resize-grip-mobile.png",
      screenshotOptions,
    );
  } finally {
    await context.close();
  }
});
