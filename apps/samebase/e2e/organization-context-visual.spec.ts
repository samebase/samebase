import { devices, expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

import {
  applyOrganizationContextAcceptanceFixture,
  createOrganizationContextAcceptanceAccount,
  signInOrganizationContextAcceptanceAccount,
} from "./organizationContextAcceptance";
import { signInIfNeeded } from "./liveHelpers";
import { seedVisualFixtureWorkspaceSidebarState } from "./visualFixtureTest";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";

const MAIN_HEADER_TEST_ID = "workspace-layout-v2-main-pane-header";
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

async function createApprovedAccount(
  page: Page,
  testInfo: TestInfo,
  label: string,
  organizations: AcceptanceOrganizations,
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
  await seedVisualFixtureWorkspaceSidebarState(page);
  return { email, organizationIds: fixture.organizationIds };
}

async function openRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 900, width: 1200 });
});

test("shows the explicit zero-membership global inventory", async ({ page }, testInfo) => {
  await createApprovedAccount(page, testInfo, "zero", []);
  await openRoute(page, "/vault");

  const header = page.getByTestId(MAIN_HEADER_TEST_ID);
  await expect(header.getByText("All vaults", { exact: true })).toHaveCount(0);
  const emptyInventory = page.getByRole("heading", { name: "No organizations" }).locator("..");
  await expect(emptyInventory).toBeVisible();
  await expect(
    page.getByText("Install the Samebase GitHub App for a repository owner.", { exact: true }),
  ).toBeVisible();
  await expect(emptyInventory.getByRole("button", { name: "Install GitHub App" })).toBeVisible();
  await expect(page).toHaveScreenshot("organization-context-zero-membership.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  const contextControl = rightPane.getByTestId("organization-context-control");
  await expect(contextControl.getByText("All vaults", { exact: true })).toBeVisible();
  await expect(contextControl.getByRole("button", { name: "Install GitHub App" })).toBeVisible();
  await expect(rightPane.getByRole("navigation", { name: "Organization" })).toHaveCount(0);
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
  await openRoute(page, "/vault");

  const organizationHeadings = (await page.getByRole("heading", { level: 2 }).allTextContents())
    .map((heading) => heading.trim())
    .filter((heading) => heading.startsWith("org-context-"));
  expect(organizationHeadings).toEqual([
    "org-context-alpha",
    "org-context-beta",
    "org-context-zeta",
  ]);
  const alphaSection = page.locator("section").filter({
    has: page.getByRole("heading", { exact: true, name: "org-context-alpha" }),
  });
  await expect(alphaSection.getByText("No vaults", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /org-context-beta\/inventory-app,/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /org-context-zeta\/web-app,/u })).toBeVisible();

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  await expect(rightPane).toBeVisible();
  await rightPane.getByRole("button", { name: "Switch organization" }).click();
  const contextMenu = page.getByRole("menu");
  await expect(contextMenu.getByRole("menuitem", { name: "All vaults" })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "org-context-alpha" })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "org-context-beta" })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "org-context-zeta" })).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "Install GitHub App" })).toBeVisible();
  const renderedMarkup = await page.locator("body").innerHTML();
  for (const organizationId of fixture.organizationIds) {
    expect(renderedMarkup).not.toContain(organizationId);
  }
  await expect(page).toHaveScreenshot("organization-context-global-inventory.png", {
    ...screenshotOptions,
    fullPage: true,
  });
});

test("keeps one organization static and separates organization and user settings", async ({
  page,
}, testInfo) => {
  const { email } = await createApprovedAccount(page, testInfo, "one", [
    {
      access: "retain",
      ownerLogin: "org-context-solo",
      repositories: ["solo-app"],
    },
  ]);
  await openRoute(page, "/vault");

  const globalHeader = page.getByTestId(MAIN_HEADER_TEST_ID);
  await expect(globalHeader.getByText("All vaults", { exact: true })).toHaveCount(0);
  await expect(globalHeader.getByText("org-context-solo", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  const organizationContext = rightPane.getByTestId("organization-context-control");
  await expect(organizationContext.getByText("org-context-solo", { exact: true })).toBeVisible();
  await expect(
    organizationContext.getByRole("button", { name: "Switch organization" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/vault$/u);
  await expect(page).toHaveScreenshot("organization-context-one-organization-inventory.png", {
    ...screenshotOptions,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();

  await openRoute(page, "/org/org-context-solo/settings");

  const header = page.getByTestId(MAIN_HEADER_TEST_ID);
  await expect(header.getByText("org-context-solo", { exact: true })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Switch organization" })).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(organizationContext.getByText("org-context-solo", { exact: true })).toBeVisible();
  await expect(
    organizationContext.getByRole("button", { name: "Switch organization" }),
  ).toHaveCount(0);
  const organizationSettings = page.getByTestId("organization-settings-page");
  await expect(
    organizationSettings.getByRole("heading", { name: "Organization settings" }),
  ).toBeVisible();
  await expect(organizationSettings.getByText("org-context-solo", { exact: true })).toBeVisible();
  await expect(organizationSettings.getByText("Owner", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("organization-context-one-organization-settings.png", {
    ...screenshotOptions,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();

  await openRoute(page, "/org/org-context-solo/vaults");
  await expect(page.getByRole("link", { name: /org-context-solo\/solo-app,/u })).toBeVisible();

  await openRoute(page, "/settings");
  const userSettings = page.getByTestId("user-settings-page");
  await expect(userSettings.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await expect(userSettings.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(userSettings.getByRole("heading", { name: "GitHub authorization" })).toBeVisible();
  await expect(userSettings.getByRole("heading", { name: "Billing" })).toHaveCount(0);
  await expect(userSettings.getByText("org-context-solo", { exact: true })).toHaveCount(0);
  await expect(page).toHaveScreenshot("organization-context-user-settings.png", {
    ...screenshotOptions,
    fullPage: true,
    mask: [userSettings.getByText(email, { exact: true })],
    maskColor: "#d1d5db",
  });

  await openRoute(page, "/settings/mcp");
  const mcpSettings = page.getByTestId("mcp-clients-settings-page");
  await expect(mcpSettings.getByRole("heading", { name: "MCP clients" })).toBeVisible();
  await expect(mcpSettings.getByText("No authorized MCP clients.", { exact: true })).toBeVisible();
  await expect(
    page.getByTestId(MAIN_HEADER_TEST_ID).getByText("Account", { exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveScreenshot("organization-context-mcp-settings.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await openRoute(page, "/org/org-context-solo/settings/billing?checkout=cancel");
  const billingPage = page.getByTestId("organization-billing-page");
  await expect(billingPage.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(
    billingPage.getByText("Checkout canceled. Your plan did not change.", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/org\/org-context-solo\/settings\/billing\?checkout=cancel$/u);
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

  await openRoute(page, "/org/org-context-history-alpha/vaults");
  await expect(
    page.getByRole("link", { name: /org-context-history-alpha\/alpha-app,/u }),
  ).toBeVisible();
  await expect(page.getByText("beta-app", { exact: true })).toHaveCount(0);

  await openRoute(page, "/org/org-context-history-alpha");
  await expect(page).toHaveURL(/\/org\/org-context-history-alpha\/vaults$/u);

  await openRoute(page, "/org/org-context-history-alpha/settings?dev");
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await page
    .getByTestId("workspace-layout-v2-pane-right")
    .getByRole("button", { name: "Switch organization" })
    .click();
  await page.getByRole("menuitem", { name: "org-context-history-beta" }).click();
  await expect(page).toHaveURL(/\/org\/org-context-history-beta\/settings\?dev$/u);
  await expect(
    page.getByTestId("workspace-layout-v2-pane-right").getByRole("button", {
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
  await expect(page.getByRole("link", { name: "All vaults" })).toBeVisible();
  await expect(page).toHaveScreenshot("organization-context-lost-organization.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  await expect(
    rightPane
      .getByTestId("organization-context-control")
      .getByText("org-context-lost-org", { exact: true }),
  ).toBeVisible();
  await expect(rightPane.getByRole("link", { name: "All vaults" })).toBeVisible();
  await expect(rightPane.getByRole("navigation", { name: "Organization" })).toHaveCount(0);

  await openRoute(page, "/org/org-context-lost-org/settings");
  await expect(page).toHaveURL(/\/org\/org-context-lost-org\/settings$/u);
  await expect(page.getByRole("heading", { name: "Organization unavailable" })).toBeVisible();
});

test("shows explicit lost access for a retained vault route", async ({ page }, testInfo) => {
  await createApprovedAccount(page, testInfo, "lost-vault", [
    {
      access: "remove",
      ownerLogin: "org-context-lost-vault",
      repositories: ["private-app"],
    },
  ]);
  await openRoute(page, "/vault/org-context-lost-vault/private-app");

  await expect(page).toHaveURL(/\/vault\/org-context-lost-vault\/private-app$/u);
  await expect(page.getByRole("heading", { name: "Vault unavailable" })).toBeVisible();
  await expect(page.getByRole("link", { name: "All vaults" })).toBeVisible();
  await expect(page).toHaveScreenshot("organization-context-lost-vault.png", {
    ...screenshotOptions,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  await expect(
    rightPane
      .getByTestId("organization-context-control")
      .getByText("org-context-lost-vault", { exact: true }),
  ).toBeVisible();
  await expect(rightPane.getByRole("link", { name: "All vaults" })).toBeVisible();
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
    await openRoute(page, args.route);
    await expect(page).toHaveURL(args.route);
    await signInOrganizationContextAcceptanceAccount(page, args.email);
    await expect(page).toHaveURL(args.route);
    await expect(
      page
        .getByTestId("workspace-layout-v2-pane-main")
        .getByRole("heading", { name: args.mainHeading }),
    ).toBeVisible();

    const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
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

test("preserves signed-out direct organization and vault routes after sign-in", async ({
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
    route: "/vault/org-context-signed-out-return/return-app",
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
    await signupPage.goto("/", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(signupPage, "/");
    await applyOrganizationContextAcceptanceFixture({
      email: LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
      organizations: [
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
    });
    await seedVisualFixtureWorkspaceSidebarState(signupPage);
    const storageState = await signupContext.storageState();
    await signupContext.close();

    const context = await browser.newContext({
      ...devices["iPhone 13"],
      baseURL,
      reducedMotion: "reduce",
      storageState,
    });
    const page = await context.newPage();
    await seedVisualFixtureWorkspaceSidebarState(page, { rightMobileWidthPx: 96 });

    try {
      await openRoute(page, "/vault/org-context-mobile-alpha/mobile-app/fs/main/README.md");
      const header = page.getByTestId(MAIN_HEADER_TEST_ID);
      await expect(header.getByText("org-context-mobile-alpha", { exact: true })).toHaveCount(0);
      await expect(header.getByRole("button", { name: "Quick Open" })).toBeVisible();
      await expect(header.getByRole("button", { name: "Switch organization" })).toHaveCount(0);
      const leftPane = page.getByTestId("workspace-layout-v2-pane-left");
      await expect(
        leftPane.getByText("org-context-mobile-alpha/mobile-app", { exact: true }),
      ).toBeVisible();
      await expect(leftPane.getByText("README.md", { exact: true })).toBeVisible();
      const rightToggle = header.getByRole("button", { name: "Toggle Right Sidebar" });
      await expect(rightToggle).toBeVisible();
      await rightToggle.click();
      await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
        "data-mobile-pane",
        "right",
      );
      const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
      await expect(rightPane).toHaveCSS("width", "96px");
      await expect
        .poll(() => rightPane.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      await rightPane.getByRole("button", { name: "Switch organization" }).click();
      const contextMenu = page.getByRole("menu");
      await expect(contextMenu.getByRole("menuitem", { name: "All vaults" })).toBeVisible();
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
      await expect(page).toHaveURL(/\/org\/org-context-mobile-beta\/vaults$/u);
    } finally {
      await context.close();
    }
  });
});
