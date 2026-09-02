import { devices, expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import {
  APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_GITHUB_AUTH_SLOT_TEST_ID,
  PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID,
  PUBLIC_LANDING_PRIMARY_ACTION_TEST_ID,
} from "../src/lib/publicLanding";
import { signInIfNeeded } from "./liveHelpers";
import {
  applyOrganizationContextAcceptanceFixture,
  createOrganizationContextAcceptanceAccount,
} from "./organizationContextAcceptance";
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
  timeout: 30_000,
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
  return page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
}

function getRightPane(page: Page) {
  return page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
}

function getAccountSection(page: Page) {
  return getRightSidebar(page).locator(".repository-dashboard-sidebar-inset").first();
}

function getSignedInAccountSection(page: Page) {
  return getAccountSection(page);
}

function getPrivateAccountMask(accountSection: Locator) {
  return accountSection.getByTestId("dashboard-sidebar-account-text");
}

async function openSignedInApp(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/");
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
      accountLabelAfterContent: readAfterContent("[data-app-auth-prehydration-account-label]"),
      signedOutAfterContent: readAfterContent("[data-app-auth-prehydration-signed-out-label]"),
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
  await expect(accountSection.getByRole("link", { name: "Account settings" })).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expectNoHorizontalOverflow(rightPane);
  await expectSidebarTextOwnsWrappedLine({
    iconTestId: "dashboard-sidebar-account-icon",
    row: accountSection.getByTestId("dashboard-sidebar-account-row"),
    textTestId: "dashboard-sidebar-account-text",
  });
  await expect(accountSection).toHaveScreenshot("app-right-sidebar-signed-in-account-narrow.png", {
    ...appRightSidebarScreenshotOptions,
    mask: [getPrivateAccountMask(accountSection)],
    maskColor: "#d1d5db",
  });

  const onboardingSection = rightPane
    .getByRole("heading", { name: "First time using Samebase?" })
    .locator("..");
  await expect(onboardingSection).toHaveScreenshot(
    "app-right-sidebar-onboarding-video-narrow.png",
    {
      ...appRightSidebarScreenshotOptions,
    },
  );
});

test("signed-in app right sidebar shows the product-update email choice", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedAppWorkspaceSidebarState(page, APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE);
  await openSignedInApp(page);

  const rightPane = getRightPane(page);
  const consentSection = rightPane.getByRole("heading", { name: "Product updates" }).locator("..");
  await expect(
    consentSection.getByText("Hear about new Samebase features by email."),
  ).toBeVisible();
  await expect(consentSection.getByRole("button", { name: "Email me" })).toBeVisible();
  await expect(consentSection.getByRole("button", { name: "No thanks" })).toBeVisible();
  await expect(rightPane.getByRole("heading", { name: "Help improve Samebase" })).toHaveCount(0);
  await expectNoHorizontalOverflow(consentSection);
  await expect(consentSection).toHaveScreenshot(
    "app-right-sidebar-product-update-email-consent.png",
    appRightSidebarScreenshotOptions,
  );
});

test("signed-in app right sidebar shows the session-recording choice", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedAppWorkspaceSidebarState(page, APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE);
  const email = `app-right-sidebar-recording-${testInfo.workerIndex}-${Date.now()}@example.test`;
  await createOrganizationContextAcceptanceAccount(page, email);
  await applyOrganizationContextAcceptanceFixture({ email, organizations: [] });
  await page.reload({ waitUntil: "domcontentloaded" });

  const rightPane = getRightPane(page);
  const productUpdateSection = rightPane
    .getByRole("heading", { name: "Product updates" })
    .locator("..");
  await productUpdateSection.getByRole("button", { name: "No thanks" }).click();

  const consentSection = rightPane
    .getByRole("heading", { name: "Help improve Samebase" })
    .locator("..");
  const allowButton = consentSection.getByRole("button", { name: "Allow" });
  await expect(
    consentSection.getByText(
      "Share recordings of how you use Samebase. Inputs and code stay hidden.",
    ),
  ).toBeVisible();
  await expect(allowButton).toHaveClass(/bg-primary/u);
  await expect(consentSection.getByRole("button", { name: "No thanks" })).toBeVisible();
  await expect(consentSection.getByRole("link", { name: "What gets recorded" })).toHaveCount(0);
  await expectNoHorizontalOverflow(consentSection);
  await expect(consentSection).toHaveScreenshot(
    "app-right-sidebar-session-recording-consent.png",
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
      rightMobileWidthPx: 130,
    });
    await openSignedInApp(page);

    await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );
    const rightPane = getRightPane(page);
    const accountSection = page.getByTestId(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID);
    await expect(rightPane).toHaveCSS("width", "130px");
    await expect(accountSection).toBeVisible();
    await expectNoHorizontalOverflow(rightPane);
    await expectSidebarTextOwnsWrappedLine({
      iconTestId: "dashboard-sidebar-account-icon",
      row: accountSection.getByTestId("dashboard-sidebar-account-row"),
      textTestId: "dashboard-sidebar-account-text",
    });
    await expect(rightPane).toHaveScreenshot("app-right-sidebar-mobile-right-pane-min.png", {
      ...appRightSidebarScreenshotOptions,
      mask: [getPrivateAccountMask(accountSection)],
      maskColor: "#d1d5db",
    });
  } finally {
    await context.close();
  }
});

test("signed-out GitHub sign-in fits the minimum mobile right pane", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAppWorkspaceSidebarState(page, {
    ...APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE,
    mobilePane: "right",
    rightMobileWidthPx: 130,
  });
  await page.goto("/?prod-ui", { waitUntil: "networkidle" });

  const rightPane = getRightPane(page);
  const githubButton = rightPane.getByRole("button", { name: "Continue with GitHub" });

  await expect(rightPane).toHaveCSS("width", "130px");
  await expect(rightPane.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(githubButton).toBeVisible();
  await expect(githubButton).toHaveCSS("white-space", "normal");
  await expectNoHorizontalOverflow(rightPane);
  await expect(githubButton).toHaveScreenshot("app-right-sidebar-github-button-mobile-min.png", {
    ...appRightSidebarScreenshotOptions,
  });
});

test("signed-in app right sidebar prehydration matches the account row", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSignedInApp(page);
  await waitForFonts(page);

  const rightSidebar = getRightSidebar(page);
  const hydratedAccountSection = getSignedInAccountSection(page);
  const hydratedLandingActions = page.getByTestId(PUBLIC_LANDING_PRIMARY_ACTION_TEST_ID);
  await expect(hydratedLandingActions).toHaveCount(2);
  await expect(hydratedLandingActions.getByRole("link", { name: "Go to dashboard" })).toHaveCount(
    2,
  );
  await expect(
    hydratedLandingActions.getByRole("button", { name: "Continue with GitHub" }),
  ).toHaveCount(0);
  await expect(hydratedAccountSection.getByText("Signed in with", { exact: false })).toHaveCount(0);
  for (const linkName of ["Account settings", "All repositories", "Organizations"]) {
    const navigationLink = rightSidebar.getByRole("link", { name: linkName, exact: true });
    await expect(navigationLink).toHaveCSS("font-size", "16px");
    await expect(navigationLink).toHaveCSS("line-height", "24px");
    await expect(navigationLink).toHaveCSS("text-decoration-line", "underline");
  }
  await expect(hydratedAccountSection).toHaveScreenshot(
    "app-right-sidebar-signed-in-account-section.png",
    {
      ...appRightSidebarScreenshotOptions,
      mask: [getPrivateAccountMask(hydratedAccountSection)],
      maskColor: "#d1d5db",
    },
  );
  const hydratedScreenshot = await hydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    mask: [getPrivateAccountMask(hydratedAccountSection)],
    maskColor: "#d1d5db",
    scale: "css",
  });

  await blockHydrationScripts(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await waitForFonts(page);

  const prehydratedLandingActions = page.getByTestId(PUBLIC_LANDING_PRIMARY_ACTION_TEST_ID);
  await expect(prehydratedLandingActions).toHaveCount(2);
  await expect(
    prehydratedLandingActions.getByRole("link", { name: "Go to dashboard" }),
  ).toHaveCount(2);
  await expect(
    prehydratedLandingActions.getByRole("button", { name: "Continue with GitHub" }),
  ).toHaveCount(0);

  await expectPrehydratedAccountSectionToMatchHydrated({
    artifactPrefix: "app-right-sidebar-signed-in-account-prehydration",
    hydratedScreenshot,
    page,
    testInfo,
  });
});

test("signed-out app right sidebar prehydration matches the hydrated account row", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await waitForFonts(page);

  const hydratedAccountSection = getAccountSection(page);
  await expect(
    hydratedAccountSection.getByText("Sign in or create an account", { exact: true }),
  ).toBeVisible();
  await expect(
    hydratedAccountSection.getByTestId(PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID),
  ).toHaveCount(0);
  await expect(
    hydratedAccountSection.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeVisible();
  const hydratedScreenshot = await hydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await blockHydrationScripts(page);
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await waitForFonts(page);

  const prehydratedAccountSection = getAccountSection(page);
  await expect(prehydratedAccountSection).toBeVisible();
  await expect(
    prehydratedAccountSection.getByTestId(PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID),
  ).toHaveCount(0);
  await expect(
    prehydratedAccountSection.getByTestId(PUBLIC_LANDING_GITHUB_AUTH_SLOT_TEST_ID),
  ).toHaveCount(1);
  const prehydratedTextEvidence = await readAccountTextEvidence(prehydratedAccountSection);
  expect(
    accountTextEvidenceIncludes(
      prehydratedTextEvidence,
      "Sign in or create an account",
      prehydratedTextEvidence.signedOutAfterContent,
    ),
  ).toBe(true);

  const prehydratedScreenshot = await prehydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await expectScreenshotsToMatch({
    actual: prehydratedScreenshot,
    artifactPrefix: "app-right-sidebar-signed-out-account-prehydration",
    artifactWritePaths: {
      actual: testInfo.outputPath(
        "app-right-sidebar-signed-out-account-prehydration-prehydrated.png",
      ),
      diff: testInfo.outputPath("app-right-sidebar-signed-out-account-prehydration-diff.png"),
      diffMask: testInfo.outputPath(
        "app-right-sidebar-signed-out-account-prehydration-diff-mask.png",
      ),
      expected: testInfo.outputPath(
        "app-right-sidebar-signed-out-account-prehydration-hydrated.png",
      ),
    },
    expected: hydratedScreenshot,
    maxDiffPixelRatio: 0.0001,
    pixelmatchOptions: {
      includeAA: true,
      threshold: 0,
    },
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
  await expect(
    prehydratedAccountSection.getByRole("link", { name: "Account settings" }),
  ).toBeVisible();
  await expect(prehydratedAccountSection.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(prehydratedAccountSection.locator("[aria-expanded]:visible")).toHaveCount(0);
  const prehydratedTextEvidence = await readAccountTextEvidence(prehydratedAccountSection);
  expect(
    accountTextEvidenceIncludes(
      prehydratedTextEvidence,
      LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
      prehydratedTextEvidence.accountLabelAfterContent,
    ),
  ).toBe(true);
  expect(prehydratedTextEvidence.textContent).not.toContain("Signed in with");

  const prehydratedScreenshot = await prehydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    mask: [getPrivateAccountMask(prehydratedAccountSection)],
    maskColor: "#d1d5db",
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
    maxDiffPixelRatio: 0.0001,
    pixelmatchOptions: {
      includeAA: true,
      threshold: 0,
    },
    testInfo,
  });
}
