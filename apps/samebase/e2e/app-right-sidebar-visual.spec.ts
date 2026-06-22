import { devices, expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import { PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY } from "../src/lib/authStorageKeys";
import { APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";
import { signInIfNeeded } from "./liveHelpers";
import { expectScreenshotsToMatch } from "./visualDiff";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;
const APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

const appRightSidebarScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

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

async function waitForFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

function getRightSidebar(page: Page) {
  return page.locator('[data-workspace-layout-v2-mobile-pane="right"]');
}

function getRightPane(page: Page) {
  return page.getByTestId("workspace-layout-v2-pane-right");
}

function getSignedInAccountSection(page: Page) {
  return getRightSidebar(page).locator(".vault-dashboard-sidebar-inset").first();
}

async function openSignedInApp(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/");
  await page.waitForLoadState("networkidle");
}

async function expectNoHorizontalOverflow(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
}

async function expectSidebarTextOwnsWrappedLine({
  iconTestId,
  row,
  textTestId,
}: {
  iconTestId: string;
  row: Locator;
  textTestId: string;
}) {
  await expect
    .poll(() =>
      row.evaluate(
        (rowElement, testIds) => {
          if (!(rowElement instanceof HTMLElement)) {
            return false;
          }

          const iconElement = rowElement.querySelector(`[data-testid="${testIds.iconTestId}"]`);
          const textElement = rowElement.querySelector(`[data-testid="${testIds.textTestId}"]`);
          if (!(iconElement instanceof HTMLElement) || !(textElement instanceof HTMLElement)) {
            return false;
          }

          const rowRect = rowElement.getBoundingClientRect();
          const iconRect = iconElement.getBoundingClientRect();
          const textRect = textElement.getBoundingClientRect();

          return (
            textRect.top >= iconRect.bottom - 1 &&
            Math.abs(textRect.left - rowRect.left) <= 1 &&
            Math.abs(textRect.width - rowRect.width) <= 1
          );
        },
        { iconTestId, textTestId },
      ),
    )
    .toBe(true);
}

async function readAccountTextEvidence(accountSection: Locator) {
  return accountSection.evaluate((element) => {
    const readAfterContent = (selector: string) => {
      const target = element.querySelector(selector);
      if (!target) {
        return null;
      }

      return window.getComputedStyle(target, "::after").content;
    };

    return {
      emailAfterContent: readAfterContent("[data-app-auth-prehydration-email]"),
      providerAfterContent: readAfterContent("[data-app-auth-prehydration-provider]"),
      textContent: element.textContent ?? "",
    };
  });
}

function accountTextEvidenceIncludes(
  evidence: Awaited<ReturnType<typeof readAccountTextEvidence>>,
  text: string,
  pseudoContent: string | null,
) {
  return evidence.textContent.includes(text) || pseudoContent === JSON.stringify(text);
}

test("signed-in app right sidebar renders a static account section", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSignedInApp(page);

  const rightSidebar = getRightSidebar(page);
  const accountSection = getSignedInAccountSection(page);

  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByText("not logged in", { exact: true })).toHaveCount(0);
  await expect(accountSection.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL)).toBeVisible();
  await expect(accountSection.getByText("Signed in with Password", { exact: true })).toBeVisible();
  await expect(accountSection.getByTestId("dashboard-sidebar-account-icon")).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(accountSection.locator("[aria-expanded]")).toHaveCount(0);
  await expect(rightSidebar.getByRole("link", { name: "Providers", exact: true })).toHaveAttribute(
    "href",
    "/providers",
  );
  await expect(rightSidebar.getByTestId("dashboard-sidebar-providers-section")).toHaveCount(0);
  await expect(accountSection).toHaveScreenshot(
    "app-right-sidebar-signed-in-account-section.png",
    appRightSidebarScreenshotOptions,
  );
});

test("signed-in app right sidebar keeps the account row inside a narrow desktop rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 760 });
  await seedAppWorkspaceSidebarState(page, {
    ...APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE,
    rightDesktopWidthPx: 160,
  });
  await openSignedInApp(page);

  const rightPane = getRightPane(page);
  const accountSection = page.getByTestId(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID);
  await expect(rightPane).toHaveCSS("width", "160px");
  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expectNoHorizontalOverflow(rightPane);
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-account-icon",
    row: accountSection.getByTestId("dashboard-sidebar-account-row"),
    textTestId: "dashboard-sidebar-account-text",
  });
  await expect(accountSection).toHaveScreenshot(
    "app-right-sidebar-signed-in-account-narrow.png",
    appRightSidebarScreenshotOptions,
  );
});

test("signed-in app right sidebar keeps the account row inside the minimum mobile right pane", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for mobile app right-sidebar tests.");
  }

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    await seedAppWorkspaceSidebarState(page, {
      ...APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE,
      mobilePane: "right",
      rightMobileWidthPx: 96,
    });
    await openSignedInApp(page);

    await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );
    const rightPane = getRightPane(page);
    const accountSection = page.getByTestId(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID);
    await expect(rightPane).toHaveCSS("width", "96px");
    await expect(accountSection).toBeVisible();
    await expectNoHorizontalOverflow(rightPane);
    await expectSidebarTextOwnsWrappedLine({
      iconTestId: "dashboard-sidebar-account-icon",
      row: accountSection.getByTestId("dashboard-sidebar-account-row"),
      textTestId: "dashboard-sidebar-account-text",
    });
    await expect(rightPane).toHaveScreenshot(
      "app-right-sidebar-mobile-right-pane-min.png",
      appRightSidebarScreenshotOptions,
    );
  } finally {
    await context.close();
  }
});

test("signed-in app right sidebar prehydration includes the password provider label", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSignedInApp(page);
  await waitForFonts(page);

  const hydratedAccountSection = getSignedInAccountSection(page);
  await expect(
    hydratedAccountSection.getByText("Signed in with Password", { exact: true }),
  ).toBeVisible();
  const hydratedScreenshot = await hydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await blockHydrationScripts(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await waitForFonts(page);

  await expectPrehydratedAccountSectionToMatchHydrated({
    artifactPrefix: "app-right-sidebar-signed-in-account-prehydration",
    hydratedScreenshot,
    page,
    testInfo,
  });
});

test("signed-in app right sidebar prehydration includes password provider for existing sessions without provider markers", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSignedInApp(page);
  await waitForFonts(page);

  const hydratedAccountSection = getSignedInAccountSection(page);
  await expect(
    hydratedAccountSection.getByText("Signed in with Password", { exact: true }),
  ).toBeVisible();
  const hydratedScreenshot = await hydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await page.evaluate(
    ({ passwordAuthModeStorageKey }) => {
      window.localStorage.removeItem("samebase_auth_provider");
      window.localStorage.removeItem(passwordAuthModeStorageKey);
    },
    {
      passwordAuthModeStorageKey: PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY,
    },
  );
  await blockHydrationScripts(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await waitForFonts(page);

  await expectPrehydratedAccountSectionToMatchHydrated({
    artifactPrefix: "app-right-sidebar-signed-in-account-legacy-prehydration",
    hydratedScreenshot,
    page,
    testInfo,
  });
});

async function expectPrehydratedAccountSectionToMatchHydrated({
  artifactPrefix,
  hydratedScreenshot,
  page,
  testInfo,
}: {
  artifactPrefix: string;
  hydratedScreenshot: Buffer;
  page: Page;
  testInfo: TestInfo;
}) {
  const prehydratedAccountSection = getSignedInAccountSection(page);
  await expect(prehydratedAccountSection).toBeVisible();
  await expect(prehydratedAccountSection.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(prehydratedAccountSection.locator("[aria-expanded]:visible")).toHaveCount(0);
  const prehydratedTextEvidence = await readAccountTextEvidence(prehydratedAccountSection);
  expect(
    accountTextEvidenceIncludes(
      prehydratedTextEvidence,
      LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
      prehydratedTextEvidence.emailAfterContent,
    ),
  ).toBe(true);
  expect(
    accountTextEvidenceIncludes(
      prehydratedTextEvidence,
      "Signed in with Password",
      prehydratedTextEvidence.providerAfterContent,
    ),
  ).toBe(true);

  const prehydratedScreenshot = await prehydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await expectScreenshotsToMatch({
    actual: prehydratedScreenshot,
    artifactPrefix,
    artifactWritePaths: {
      actual: testInfo.outputPath(`${artifactPrefix}-prehydrated.png`),
      diff: testInfo.outputPath(`${artifactPrefix}-diff.png`),
      diffMask: testInfo.outputPath(`${artifactPrefix}-diff-mask.png`),
      expected: testInfo.outputPath(`${artifactPrefix}-hydrated.png`),
    },
    expected: hydratedScreenshot,
    maxDiffPixelRatio: 0,
    pixelmatchOptions: {
      includeAA: true,
      threshold: 0,
    },
    testInfo,
  });
}
