import { devices, expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

import {
  applyOrganizationContextAcceptanceFixture,
  createOrganizationContextAcceptanceAccount,
  signInOrganizationContextAcceptanceAccount,
} from "./organizationContextAcceptance";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";
import { VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE } from "./visualFixtureTest";
import { saveWorkspaceSidebarState } from "./workspaceSidebarState";

const MAIN_HEADER_SELECTOR =
  '[data-sidebar-layout-part="pane"][data-pane-side="main"] [data-sidebar-layout-part="pane-header"]';
const screenshotOptions = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.03,
  scale: "css",
  timeout: 30_000,
} as const;

type AcceptanceOrganizations = Parameters<
  typeof applyOrganizationContextAcceptanceFixture
>[0]["organizations"];

/** Creates an approved account whose saved sidebar state has both sidebars closed. */
async function createApprovedAccount(
  page: Page,
  testInfo: TestInfo,
  label: string,
  organizations: AcceptanceOrganizations,
  sidebarState: WorkspaceSidebarState = VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE,
) {
  const email =
    "organization-context-" +
    label +
    "-" +
    testInfo.workerIndex +
    "-" +
    Date.now() +
    "@example.test";
  await createOrganizationContextAcceptanceAccount(page, email);
  const fixture = await applyOrganizationContextAcceptanceFixture({ email, organizations });
  await saveWorkspaceSidebarState(page, sidebarState);
  return { email, organizationIds: fixture.organizationIds };
}

async function openRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
}

async function openDesktopRightPane(page: Page) {
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveAttribute(
    "data-viewport-measured",
    "",
  );
  const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
  if ((await rightPane.getAttribute("data-desktop-open")) === null) {
    await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  }
  await expect(rightPane).toHaveAttribute("data-desktop-open", "");
  return rightPane;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 900, width: 1200 });
});

test("shows the explicit zero-membership global inventory", async ({ page }, testInfo) => {
  await createApprovedAccount(page, testInfo, "zero", []);
  await openRoute(page, "/repo");

  const header = page.locator(MAIN_HEADER_SELECTOR);
  await expect(header.getByText("All repositories", { exact: true })).toHaveCount(0);
  const emptyInventory = page.getByRole("heading", { name: "No organizations" }).locator("..");
  await expect(emptyInventory).toBeVisible();
  await expect(
    page.getByText("Connect a GitHub account or organization to Samebase.", { exact: true }),
  ).toBeVisible();
  await expect(emptyInventory.getByRole("button", { name: "Add organization" })).toBeVisible();
  await expect(page).toHaveScreenshot("organization-context-zero-membership.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
  await expect(rightPane.getByRole("link", { name: "All repositories" })).toBeVisible();
  await expect(rightPane.getByRole("link", { name: "Organizations" })).toBeVisible();
  await expect(rightPane.getByTestId("organization-context-control")).toHaveCount(0);
  await expect(rightPane.getByRole("navigation", { name: "Organization" })).toHaveCount(0);

  await emptyInventory.getByRole("button", { name: "Add organization" }).click();
  await expect(page).toHaveURL(/\/org$/u);
  await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
});

test("groups the global inventory and exposes every organization context", async ({
  page,
}, testInfo) => {
  const fixture = await createApprovedAccount(page, testInfo, "global", [
    {
      access: "retain",
      ownerLogin: "org-context-zeta",
      repositories: ["web-app"],
    },
    {
      access: "retain",
      ownerLogin: "org-context-alpha",
      repositories: [],
    },
    {
      access: "retain",
      ownerLogin: "org-context-beta",
      repositories: ["inventory-app"],
    },
  ]);
  await openRoute(page, "/repo");

  const repositoryNavigation = page.getByRole("navigation", { name: "Repositories" });
  const organizationButtons = repositoryNavigation.locator('button[aria-expanded="true"]');
  await expect(organizationButtons).toHaveCount(3);
  expect((await organizationButtons.allTextContents()).map((label) => label.trim())).toEqual([
    "org-context-alpha",
    "org-context-beta",
    "org-context-zeta",
  ]);
  const alphaButton = repositoryNavigation.getByRole("button", {
    name: "org-context-alpha",
    exact: true,
  });
  await expect(alphaButton).toHaveAttribute("aria-expanded", "true");
  await expect(repositoryNavigation.getByText("No repositories", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /org-context-beta\/inventory-app,/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /org-context-zeta\/web-app,/u })).toBeVisible();

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
  await expect(rightPane).toBeVisible();
  await expect(rightPane.locator('a[aria-current="page"]')).toHaveText("All repositories");
  await expect(rightPane.locator('a[aria-current="page"]')).toHaveCSS("font-weight", "400");
  await expect(rightPane.locator('a[aria-current="page"]')).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await rightPane.getByRole("button", { name: "Switch organization" }).click();
  const contextMenu = page.getByRole("menu");
  await expect(contextMenu.getByRole("menuitem", { name: "All repositories" })).toHaveCount(0);
  await expect(rightPane.getByRole("link", { name: "All repositories" })).toBeVisible();
  await expect(rightPane.getByRole("link", { name: "Organizations" })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "org-context-alpha" })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "org-context-beta" })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "org-context-zeta" })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "Organizations" })).toHaveCount(0);
  const renderedMarkup = await page.locator("body").innerHTML();
  for (const organizationId of fixture.organizationIds) {
    expect(renderedMarkup).not.toContain(organizationId);
  }
  await expect(page).toHaveScreenshot("organization-context-global-inventory.png", {
    ...screenshotOptions,
    fullPage: true,
    mask: [page.locator('iframe[title="Samebase onboarding: Complete setup from scratch"]')],
    maskColor: "#d1d5db",
  });

  await page.keyboard.press("Escape");
  await rightPane.getByRole("link", { name: "Organizations" }).click();
  await expect(page).toHaveURL(/\/org$/u);
  await expect(rightPane.locator('a[aria-current="page"]')).toHaveText("Organizations");
  await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
  for (const ownerLogin of ["org-context-alpha", "org-context-beta", "org-context-zeta"]) {
    await expect(
      page.getByRole("button", { name: `Open ${ownerLogin} in Samebase` }),
    ).toBeVisible();
  }
});

test("persists one user's collapsed organization across repository routes", async ({
  page,
}, testInfo) => {
  const ownerLogin = `org-context-tree-${testInfo.workerIndex}-${Date.now()}`;
  await createApprovedAccount(page, testInfo, "tree", [
    {
      access: "retain",
      ownerLogin,
      repositories: ["inventory-app"],
    },
  ]);
  await openRoute(page, "/repo");

  const repositoryNavigation = page.getByRole("navigation", { name: "Repositories" });
  const organizationButton = repositoryNavigation.getByRole("button", {
    name: ownerLogin,
    exact: true,
  });
  const repositoryLink = repositoryNavigation.locator(
    `a[href="/repo/${ownerLogin}/inventory-app"]`,
  );
  await expect(organizationButton).toHaveAttribute("aria-expanded", "true");
  await expect(repositoryLink).toBeVisible();

  await organizationButton.click();
  await expect(organizationButton).toHaveAttribute("aria-expanded", "false");
  await expect(repositoryLink).toHaveCount(0);

  await openRoute(page, `/repo/${ownerLogin}/inventory-app`);
  await expect(
    page
      .locator('[data-sidebar-layout-part="pane"][data-pane-side="left"]')
      .getByRole("button", { name: ownerLogin, exact: true }),
  ).toHaveAttribute("aria-expanded", "false");

  await openRoute(page, "/repo");
  await expect(
    page
      .getByRole("navigation", { name: "Repositories" })
      .getByRole("button", { name: ownerLogin, exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("shows one organization context across global pages, settings, providers, and billing", async ({
  page,
}, testInfo) => {
  await createApprovedAccount(page, testInfo, "one", [
    {
      access: "retain",
      ownerLogin: "org-context-solo",
      repositories: ["solo-app"],
    },
  ]);

  await openRoute(page, "/repo");
  const rightPane = await openDesktopRightPane(page);
  const organizationContext = rightPane.getByTestId("organization-context-control");
  const currentSidebarLink = rightPane.locator('a[aria-current="page"]');
  await expect(currentSidebarLink).toHaveText("All repositories");
  await expect(organizationContext).toHaveText("org-context-solo");
  await expect(organizationContext.getByRole("button")).toHaveCount(0);
  await expect(rightPane.getByRole("link", { name: "New app", exact: true })).toHaveAttribute(
    "href",
    "/org/org-context-solo/new-app",
  );
  await expect(
    rightPane.getByRole("link", { name: "Connect repository", exact: true }),
  ).toHaveAttribute("href", "/org/org-context-solo/connect-repo");
  await expect(page).toHaveURL(/\/repo$/u);

  await rightPane.getByRole("link", { name: "Organizations", exact: true }).click();
  await expect(page).toHaveURL(/\/org$/u);
  await expect(page.getByRole("heading", { name: "Organizations", exact: true })).toBeVisible();
  await expect(organizationContext).toHaveText("org-context-solo");
  await expect(organizationContext.getByRole("button")).toHaveCount(0);
  await rightPane.getByRole("link", { name: "Organization settings", exact: true }).click();
  await expect(page).toHaveURL(/\/org\/org-context-solo\/settings$/u);
  await expect(currentSidebarLink).toHaveText("Organization settings");
  await expect(currentSidebarLink).toHaveCSS("font-weight", "400");
  await expect(currentSidebarLink).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const header = page.locator(MAIN_HEADER_SELECTOR);
  await expect(header.getByText("org-context-solo", { exact: true })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Switch organization" })).toHaveCount(0);
  await expect(organizationContext).toHaveText("org-context-solo");
  await expect(organizationContext.getByRole("button")).toHaveCount(0);
  const organizationSettings = page.getByTestId("organization-settings-page");
  await expect(
    organizationSettings.getByRole("heading", { name: "Organization settings" }),
  ).toBeVisible();
  await expect(organizationSettings.getByText("org-context-solo", { exact: true })).toBeVisible();
  await expect(organizationSettings.getByText("Owner", { exact: true })).toBeVisible();
  await expect(
    organizationSettings.getByRole("combobox", { name: "Default production region" }),
  ).toHaveCount(0);
  await expect(organizationSettings.getByTestId("organization-billing-section")).toBeVisible();
  await expect(rightPane.getByRole("heading", { name: "Product updates" })).toBeVisible();
  const onboardingPoster = rightPane
    .getByRole("heading", { name: "First time using Samebase?" })
    .locator("..")
    .locator("img");
  await expect(onboardingPoster).toBeVisible();
  await expect
    .poll(() => onboardingPoster.evaluate((image) => image.complete && image.naturalWidth > 0))
    .toBe(true);
  await expect(page).toHaveScreenshot("organization-context-one-organization-settings.png", {
    ...screenshotOptions,
    fullPage: true,
  });
  await organizationSettings.getByRole("button", { name: "Delete organization" }).click();
  const deleteOrganizationDialog = page.getByRole("dialog", { name: "Delete organization?" });
  const organizationDeletionConfirmationText = deleteOrganizationDialog.getByText(
    "org-context-solo",
    { exact: true },
  );
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await organizationDeletionConfirmationText.click();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await organizationDeletionConfirmationText.selectText();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("org-context-solo");
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await expect(deleteOrganizationDialog).toHaveScreenshot(
    "organization-context-delete-organization-dialog.png",
    screenshotOptions,
  );
  await deleteOrganizationDialog.getByRole("button", { name: "Cancel" }).click();
  await rightPane.getByRole("link", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/org\/org-context-solo\/settings\/members$/u);
  await expect(currentSidebarLink).toHaveText("Members");
  await page.goBack();
  await expect(currentSidebarLink).toHaveText("Organization settings");
  await page.goForward();
  await expect(currentSidebarLink).toHaveText("Members");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(currentSidebarLink).toHaveText("Members");
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();

  await openRoute(
    page,
    "/org/org-context-unavailable/providers?authorization-provider=github-app&authorization-error=organization-owner-required#github",
  );
  await expect(page.getByRole("heading", { name: "Organization unavailable" })).toBeVisible();
  await expect(
    page.getByText("You do not have Samebase access to org-context-unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "already connected to a Samebase organization" }),
  ).toBeVisible();
  await expect(page.getByText("Personal repository creation", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/org\/org-context-unavailable\/providers#github$/u);
  if (!(await rightPane.isVisible())) {
    await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  }
  await expect(organizationContext).toBeVisible();
  await expect(organizationContext).toHaveText("org-context-unavailable");
  await expect(
    rightPane.getByRole("navigation", { name: "Organization", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveScreenshot("organization-providers-authorization-error.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await openRoute(page, "/org/org-context-solo/settings?checkout=cancel#billing");
  const settingsWithBilling = page.getByTestId("organization-settings-page");
  const billingSection = settingsWithBilling.getByTestId("organization-billing-section");
  await expect(billingSection.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(
    billingSection.getByText("Checkout canceled. Billing did not change.", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/org\/org-context-solo\/settings\?checkout=cancel#billing$/u);

  await openRoute(
    page,
    "/org/org-context-solo/settings?checkout=cancel&customer_session_token=test-token#billing",
  );
  await expect(page).toHaveURL(/\/org\/org-context-solo\/settings\?checkout=cancel#billing$/u);
});

test("keeps organization scope across direct links and browser history", async ({
  page,
}, testInfo) => {
  await createApprovedAccount(page, testInfo, "history", [
    {
      access: "retain",
      ownerLogin: "org-context-history-alpha",
      repositories: ["alpha-app"],
    },
    {
      access: "retain",
      ownerLogin: "org-context-history-beta",
      repositories: ["beta-app"],
    },
  ]);

  await openRoute(page, "/org/org-context-history-alpha/repositories");
  const scopedRepositoryNavigation = page.getByRole("navigation", { name: "Repositories" });
  await expect(
    scopedRepositoryNavigation.getByRole("button", {
      name: "org-context-history-alpha",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    scopedRepositoryNavigation.getByText("org-context-history-alpha", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /org-context-history-alpha\/alpha-app,/u }),
  ).toBeVisible();
  await expect(page.getByText("beta-app", { exact: true })).toHaveCount(0);
  await expect(page).toHaveScreenshot("organization-context-direct-repositories.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await openRoute(page, "/org/org-context-history-alpha");
  await expect(page).toHaveURL(/\/org\/org-context-history-alpha\/repositories$/u);

  await openRoute(page, "/org/org-context-history-alpha/settings?dev");
  const rightPane = await openDesktopRightPane(page);
  await rightPane.getByRole("button", { name: "Switch organization" }).click();
  await page.getByRole("menuitem", { name: "org-context-history-beta" }).click();
  await expect(page).toHaveURL(/\/org\/org-context-history-beta\/settings\?dev$/u);
  await expect(
    page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]').getByRole("button", {
      name: "Switch organization, current context org-context-history-beta",
    }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/org\/org-context-history-alpha\/settings\?dev$/u);
  await page.goForward();
  await expect(page).toHaveURL(/\/org\/org-context-history-beta\/settings\?dev$/u);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/org\/org-context-history-beta\/settings\?dev$/u);
  await expect(page.getByTestId("organization-settings-page")).toBeVisible();
});

test("keeps a lost organization route unavailable before its root redirect", async ({
  page,
}, testInfo) => {
  await createApprovedAccount(page, testInfo, "lost-org", [
    {
      access: "remove",
      ownerLogin: "org-context-lost-org",
      repositories: [],
    },
  ]);
  await openRoute(page, "/org/org-context-lost-org");

  await expect(page).toHaveURL(/\/org\/org-context-lost-org$/u);
  await expect(page.getByRole("heading", { name: "Organization unavailable" })).toBeVisible();
  await expect(
    page.getByText("You do not have Samebase access to org-context-lost-org.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "All repositories" })).toBeVisible();
  await expect(page).toHaveScreenshot("organization-context-lost-organization.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
  await expect(
    rightPane
      .getByTestId("organization-context-control")
      .getByText("org-context-lost-org", { exact: true }),
  ).toBeVisible();
  await expect(rightPane.getByRole("link", { name: "All repositories" })).toBeVisible();
  await expect(rightPane.getByRole("link", { name: "Organizations" })).toBeVisible();
  await expect(rightPane.getByRole("navigation", { name: "Organization" })).toHaveCount(0);

  await openRoute(page, "/org/org-context-lost-org/settings");
  await expect(page).toHaveURL(/\/org\/org-context-lost-org\/settings$/u);
  await expect(page.getByRole("heading", { name: "Organization unavailable" })).toBeVisible();
});

test("shows explicit lost access for a retained repository route", async ({ page }, testInfo) => {
  await createApprovedAccount(page, testInfo, "lost-repository", [
    {
      access: "remove",
      ownerLogin: "org-context-lost-repository",
      repositories: ["private-app"],
    },
  ]);
  await openRoute(page, "/repo/org-context-lost-repository/private-app");

  await expect(page).toHaveURL(/\/repo\/org-context-lost-repository\/private-app$/u);
  await expect(page.getByRole("heading", { name: "Repository unavailable" })).toBeVisible();
  await expect(page.getByRole("link", { name: "All repositories" })).toBeVisible();
  await expect(page).toHaveScreenshot("organization-context-lost-repository.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
  await expect(
    rightPane
      .getByTestId("organization-context-control")
      .getByText("org-context-lost-repository", { exact: true }),
  ).toBeVisible();
  await expect(rightPane.getByRole("link", { name: "All repositories" })).toBeVisible();
  await expect(rightPane.getByRole("link", { name: "Organizations" })).toBeVisible();
  await expect(rightPane.getByRole("navigation", { name: "Organization" })).toHaveCount(0);
  await expect(rightPane.getByText("private-app", { exact: true })).toHaveCount(0);
});

async function signInFromDirectRoute(args: {
  baseURL: string;
  browser: Browser;
  email: string;
  mainHeading: string;
  ownerLogin: string;
  route: string;
}) {
  const context = await args.browser.newContext({
    baseURL: args.baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    // A private page answers a request without a session with a redirect to the landing page,
    // which returns to the page after the sign-in.
    await openRoute(page, args.route);
    await expect(page).toHaveURL(`/?next=${encodeURIComponent(args.route)}`);
    await signInOrganizationContextAcceptanceAccount(page, args.email);
    await expect(page).toHaveURL(args.route);
    await expect(
      page
        .locator('[data-sidebar-layout-part="carousel"]')
        .getByRole("heading", { name: args.mainHeading }),
    ).toBeVisible();

    const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
    if (!(await rightPane.isVisible())) {
      await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
    }
    await expect(
      rightPane
        .getByTestId("organization-context-control")
        .getByText(args.ownerLogin, { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
}

test("preserves signed-out direct organization and repository routes after sign-in", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for organization context tests.");
  }

  const setupContext = await browser.newContext({
    baseURL,
    reducedMotion: "reduce",
  });
  const setupPage = await setupContext.newPage();
  const { email } = await createApprovedAccount(setupPage, testInfo, "signed-out-return", [
    {
      access: "retain",
      ownerLogin: "org-context-signed-out-return",
      repositories: ["return-app"],
    },
  ]);
  await setupContext.close();

  await signInFromDirectRoute({
    baseURL,
    browser,
    email,
    mainHeading: "Organization settings",
    ownerLogin: "org-context-signed-out-return",
    route: "/org/org-context-signed-out-return/settings",
  });
  await signInFromDirectRoute({
    baseURL,
    browser,
    email,
    mainHeading: "return-app",
    ownerLogin: "org-context-signed-out-return",
    route: "/repo/org-context-signed-out-return/return-app",
  });
});

test.describe("small screen organization context", () => {
  test("keeps organization switching available from the right pane", async ({
    browser,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL !== "string") {
      throw new Error("Playwright baseURL is required for organization context tests.");
    }

    const signupContext = await browser.newContext({
      baseURL,
      reducedMotion: "reduce",
    });
    const signupPage = await signupContext.newPage();
    await createApprovedAccount(
      signupPage,
      testInfo,
      "mobile",
      [
        {
          access: "retain",
          ownerLogin: "org-context-mobile-alpha",
          repositories: ["mobile-app"],
        },
        {
          access: "retain",
          ownerLogin: "org-context-mobile-beta",
          repositories: [],
        },
      ],
      { ...VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE, rightMobileWidthPx: 130 },
    );
    const storageState = await signupContext.storageState();
    await signupContext.close();

    const context = await browser.newContext({
      ...devices["iPhone 13"],
      baseURL,
      reducedMotion: "reduce",
      storageState,
    });
    const page = await context.newPage();

    try {
      await openRoute(page, "/repo/org-context-mobile-alpha/mobile-app");
      const header = page.locator(MAIN_HEADER_SELECTOR);
      await expect(header.getByText("org-context-mobile-alpha", { exact: true })).toHaveCount(0);
      await expect(header.getByRole("button", { name: "Switch organization" })).toHaveCount(0);
      await expect(
        page.locator('[data-sidebar-layout-part="carousel"]').getByRole("heading", {
          name: "mobile-app",
        }),
      ).toBeVisible();
      const rightToggle = header.getByRole("button", { name: "Toggle Right Sidebar" });
      await expect(rightToggle).toBeVisible();
      // The server renders the toggle; the layout measures its viewport once the page hydrated.
      await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveAttribute(
        "data-viewport-measured",
        "",
      );
      await rightToggle.click();
      await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
        "data-mobile-pane",
        "right",
      );
      const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
      await expect(rightPane).toHaveCSS("width", "130px");
      await expect
        .poll(() => rightPane.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      await rightPane.getByRole("button", { name: "Switch organization" }).click();
      const contextMenu = page.getByRole("menu");
      await expect(contextMenu.getByRole("menuitem", { name: "All repositories" })).toHaveCount(0);
      await expect(rightPane.getByRole("link", { name: "All repositories" })).toBeVisible();
      await expect(rightPane.getByRole("link", { name: "Organizations" })).toBeVisible();
      await expect(contextMenu.getByRole("menuitem", { name: "Organizations" })).toHaveCount(0);
      await expect(
        contextMenu.getByRole("menuitem", { name: "org-context-mobile-alpha" }),
      ).toBeVisible();
      await expect(
        contextMenu.getByRole("menuitem", { name: "org-context-mobile-beta" }),
      ).toBeVisible();
      await expect(page).toHaveScreenshot("organization-context-mobile.png", {
        ...screenshotOptions,
        fullPage: true,
      });
      await contextMenu.getByRole("menuitem", { name: "org-context-mobile-beta" }).click();
      await expect(page).toHaveURL(/\/org\/org-context-mobile-beta\/repositories$/u);
    } finally {
      await context.close();
    }
  });
});
