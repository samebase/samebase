import { devices, expect, test, type Page } from "@playwright/test";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import {
  APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID,
} from "../src/lib/publicLanding";
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
} as const;

async function openSettings(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/settings");
  await page.waitForLoadState("networkidle");
}

async function createPendingAccount(page: Page, email: string) {
  const passwordAuthSection = page.getByTestId(PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID);
  await passwordAuthSection.getByPlaceholder("you@example.com").waitFor({ state: "visible" });
  await passwordAuthSection.getByRole("button", { name: "Need an account?" }).click();
  await passwordAuthSection.getByPlaceholder("you@example.com").fill(email);
  await passwordAuthSection.getByPlaceholder("Password").fill("settings-test-pass-1234");
  await passwordAuthSection.getByRole("button", { exact: true, name: "Create account" }).click();
  await expect(page.getByRole("link", { exact: true, name: "/settings" })).toBeVisible();
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

async function readStoredAccountPresentation(page: Page) {
  return await page.evaluate(() => {
    const jwtStorageKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith("__convexAuthJWT_"),
    );
    if (jwtStorageKey === undefined) {
      throw new Error("Convex Auth JWT storage entry is missing.");
    }
    const token = window.localStorage.getItem(jwtStorageKey);
    const payloadPart = token?.split(".")[1];
    if (payloadPart === undefined) {
      throw new Error("Convex Auth JWT payload is missing.");
    }
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(window.atob(paddedBase64));
    if (payload === null || typeof payload !== "object") {
      throw new Error("Convex Auth JWT payload is invalid.");
    }
    const kindDescriptor = Object.getOwnPropertyDescriptor(payload, "accountLabelKind");
    const labelDescriptor = Object.getOwnPropertyDescriptor(payload, "accountLabel");
    if (
      kindDescriptor === undefined ||
      !("value" in kindDescriptor) ||
      typeof kindDescriptor.value !== "string" ||
      labelDescriptor === undefined ||
      !("value" in labelDescriptor) ||
      typeof labelDescriptor.value !== "string"
    ) {
      throw new Error("Convex Auth JWT account presentation is invalid.");
    }
    return {
      kind: kindDescriptor.value,
      label: labelDescriptor.value,
    };
  });
}

async function readPrehydratedAccountLabel(page: Page) {
  return await page.getByTestId(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID).evaluate((element) => {
    const label = element.querySelector("[data-app-auth-prehydration-account-label]");
    return label === null ? null : window.getComputedStyle(label, "::after").content;
  });
}

async function expectNoAccountEmailLeak(page: Page, email: string) {
  const accountSection = page.getByTestId(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection.getByText(email, { exact: true })).toHaveCount(0);
  const titles = await accountSection
    .locator("[title]")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("title")));
  expect(titles).not.toContain(email);
  expect(await page.title()).not.toContain(email);
}

test("Settings page uses the authenticated account surface", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await openSettings(page);

  const settingsPage = page.getByTestId("user-settings-page");
  const signInEmail = settingsPage.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL, { exact: true });
  await expect(settingsPage).toBeVisible();
  await expect(settingsPage.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(settingsPage.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(settingsPage.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(settingsPage.getByLabel("Display name")).toHaveCSS("font-size", "16px");
  await expect(settingsPage).toHaveScreenshot("settings-page-desktop.png", {
    ...screenshotOptions,
    mask: [signInEmail],
    maskColor: "#d1d5db",
  });

  await settingsPage.getByRole("button", { name: "Delete account" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete account?" });
  await expect(deleteDialog).toContainText(
    "Any uncommitted file changes in Samebase will be permanently deleted. They will not be pushed to GitHub.",
  );
  await expect(deleteDialog).toContainText(
    "Nothing outside Samebase is deleted: your apps, GitHub repositories, Convex projects, and Cloudflare Workers keep running.",
  );
  await expect(deleteDialog).toContainText("Type the phrase to confirm");
  await expect(deleteDialog.getByLabel("Type the phrase to confirm")).toHaveCSS(
    "font-size",
    "16px",
  );
  await expect(page).toHaveScreenshot("settings-delete-account-dialog-desktop.png", {
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
    await signInIfNeeded(page, "/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );

    await page.getByRole("link", { name: "/settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/u);
    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "main",
    );

    const settingsPage = page.getByTestId("user-settings-page");
    await expect(settingsPage).toBeVisible();
    await expect(settingsPage.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(settingsPage).toHaveScreenshot("settings-page-mobile.png", {
      ...screenshotOptions,
      mask: [settingsPage.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL, { exact: true })],
      maskColor: "#d1d5db",
    });

    await settingsPage.getByRole("button", { name: "Delete account" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete account?" });
    await expect(deleteDialog).toBeVisible();
    await expect(page).toHaveScreenshot("settings-delete-account-dialog-mobile.png", {
      ...screenshotOptions,
      mask: [settingsPage.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL, { exact: true })],
      maskColor: "#d1d5db",
    });
  } finally {
    await context.close();
  }
});

test("prehydrated mobile Settings navigation selects the main route pane", async ({
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
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );

    await blockHydrationScripts(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute(
      "data-app-auth-presentation-prehydrated",
      "signed-in",
    );
    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );

    const prehydratedSettingsLink = page
      .getByTestId(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID)
      .getByRole("link", { exact: true, name: "/settings" });
    await expect(prehydratedSettingsLink).toBeVisible();
    await prehydratedSettingsLink.click();
    await expect(page).toHaveURL(/\/settings$/u);
    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "main",
    );

    await page.unroute("**/*");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "main",
    );
    await expect(page.getByTestId("user-settings-page")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("pending users save a private display name and refresh prehydration", async ({
  page,
}, testInfo) => {
  test.slow();
  // A unique reserved-domain account avoids PII and keeps the fully parallel suite away from the
  // shared seeded account while this test performs real profile mutations.
  const email = `settings-route-${testInfo.workerIndex}-${Date.now()}@example.test`;
  const displayName = "Video Demo Account";

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPendingAccount(page, email);
  await page.goto("/vault", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/vault\/?$/u);
  await expect(page.getByRole("heading", { name: "Account access pending" })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.settingsNavigation = "spa";
  });
  await page.getByRole("link", { exact: true, name: "/settings" }).click();
  await expect(page).toHaveURL(/\/settings$/u);
  await expect(page.getByTestId("user-settings-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Account access pending" })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.settingsNavigation))
    .toBe("spa");

  const displayNameInput = page.getByLabel("Display name");
  await displayNameInput.fill(displayName);
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(readStoredAccountPresentation(page)).resolves.toEqual({
    kind: "displayName",
    label: displayName,
  });

  const accountSection = page.getByTestId(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection.getByText(displayName, { exact: true })).toBeVisible();
  await expectNoAccountEmailLeak(page, email);
  await expect(accountSection).toHaveScreenshot("settings-display-name-account-section.png", {
    ...screenshotOptions,
  });

  await blockHydrationScripts(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  expect(await readPrehydratedAccountLabel(page)).toBe(JSON.stringify(displayName));
  await expectNoAccountEmailLeak(page, email);

  await page.unroute("**/*");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("user-settings-page")).toBeVisible();
  await page.getByLabel("Display name").fill("");
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(readStoredAccountPresentation(page)).resolves.toEqual({
    kind: "email",
    label: email,
  });

  await blockHydrationScripts(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  expect(await readPrehydratedAccountLabel(page)).toBe(JSON.stringify(email));
});

test("signed-out direct Settings visits remain private", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "networkidle" });

  await expect(page).toHaveURL(/\/settings$/u);
  await expect(page.getByTestId("user-settings-page")).toHaveCount(0);
  const passwordAuthSection = page.getByTestId("public-landing-password-auth-section");
  await expect(passwordAuthSection.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(passwordAuthSection.getByPlaceholder("Password")).toBeVisible();
  await expect(
    passwordAuthSection.getByRole("button", { exact: true, name: "Sign in" }),
  ).toBeVisible();
});
