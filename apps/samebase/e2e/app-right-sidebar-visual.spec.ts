import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";
import {
  APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_PRIMARY_ACTION_TEST_ID,
} from "../src/lib/publicLanding";
import { signInIfNeeded } from "./liveHelpers";
import {
  applyOrganizationContextAcceptanceFixture,
  createOrganizationContextAcceptanceAccount,
} from "./organizationContextAcceptance";
import { saveWorkspaceSidebarState } from "./workspaceSidebarState";

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

/**
Signs in, saves the workspace sidebar state in Convex, and loads the landing page again, so its
server render has the saved pane geometry.
*/
async function openSignedInApp(page: Page, sidebarState: WorkspaceSidebarState) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/");
  await saveWorkspaceSidebarState(page, sidebarState);
  await page.reload({ waitUntil: "domcontentloaded" });
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

test("signed-in app right sidebar keeps the account row inside a narrow desktop rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 760 });
  await openSignedInApp(page, {
    ...APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE,
    rightDesktopWidthPx: 160,
  });

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
  await openSignedInApp(page, APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE);

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
  const email = `app-right-sidebar-recording-${testInfo.workerIndex}-${Date.now()}@example.test`;
  await createOrganizationContextAcceptanceAccount(page, email);
  await applyOrganizationContextAcceptanceFixture({ email, organizations: [] });
  await saveWorkspaceSidebarState(page, APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE);
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
    await openSignedInApp(page, {
      ...APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE,
      mobilePane: "right",
      rightMobileWidthPx: 130,
    });

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
  await page.goto("/?prod-ui", { waitUntil: "networkidle" });

  // A visitor without a session has no saved sidebar state, so the test opens the right pane and
  // narrows it to its minimum with the keyboard.
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).first().click();
  await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
    "data-mobile-pane",
    "right",
  );
  const rightResizeHandle = page.locator(
    '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
  );
  await rightResizeHandle.focus();
  await rightResizeHandle.press("Shift+ArrowRight");
  await rightResizeHandle.press("Shift+ArrowRight");

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

test("signed-in app right sidebar renders the account row and dashboard actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSignedInApp(page, APP_RIGHT_SIDEBAR_VISUAL_SIDEBAR_STATE);
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
});
