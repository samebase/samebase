import { expect, test, type Page } from "@playwright/test";
import { APP_BUILD_VERSION_TEST_ID } from "../src/lib/appBuild";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";
import { VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE } from "./visualFixtureTest";
import { seedLocalWorkspaceSidebarState } from "./workspaceSidebarState";

const legalShellScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
  timeout: 30_000,
} as const;

function getLegalShellScreenshotOptions(page: Page) {
  return {
    ...legalShellScreenshotOptions,
    // The app build footer changes on every squash; this screenshot verifies
    // the routed legal shell, not the current release label.
    mask: [page.getByTestId(APP_BUILD_VERSION_TEST_ID).locator("xpath=..")],
    maskColor: "#ffffff",
  };
}

async function expectPublicRouteRightSidebarAccount(page: Page) {
  const accountSection = page
    .locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]')
    .getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);

  await expect(accountSection).toBeVisible();
  await expect(
    accountSection.getByText("Sign in or create an account", { exact: true }),
  ).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(accountSection.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(accountSection.getByPlaceholder("you@example.com")).toBeVisible();
  return accountSection;
}

async function readTermsRouteState(page: Page) {
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await expect(page.locator(".cm-static-markdown")).toBeVisible();

  return await page.evaluate(() => ({
    hasWorkspaceLeft:
      document.querySelector('[data-sidebar-layout-part="pane"][data-pane-side="left"]') !== null,
    hasWorkspaceMain: document.querySelector('[data-sidebar-layout-part="carousel"]') !== null,
    headingClassName: document.querySelector("h1")?.getAttribute("class") ?? null,
    title: document.title,
  }));
}

test("direct terms loads use the same routed app surface as client navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // A first visit starts with the left sidebar closed, and the legal links live there.
  await seedLocalWorkspaceSidebarState(page, {
    ...VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE,
    leftDesktopOpen: true,
    rightDesktopOpen: true,
  });

  await page.goto("/", { waitUntil: "networkidle" });
  const leftPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="left"]');
  const currentSidebarLink = leftPane.locator('a[aria-current="page"]');
  await expect(currentSidebarLink).toHaveText("Overview");
  await leftPane.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(currentSidebarLink).toHaveText("Terms");
  await expect(currentSidebarLink.locator("span")).toHaveCSS("font-weight", "400");
  await expect(currentSidebarLink.locator("span")).toHaveCSS("padding", "2px 6px");
  await expect(currentSidebarLink.locator("span")).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  const clientNavigationState = await readTermsRouteState(page);
  await expectPublicRouteRightSidebarAccount(page);
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveScreenshot(
    "terms-shell.png",
    getLegalShellScreenshotOptions(page),
  );

  await page.goto("/terms", { waitUntil: "networkidle" });
  await expect(currentSidebarLink).toHaveText("Terms");
  const directLoadState = await readTermsRouteState(page);
  await expectPublicRouteRightSidebarAccount(page);
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveScreenshot(
    "terms-shell.png",
    getLegalShellScreenshotOptions(page),
  );

  expect(directLoadState).toEqual(clientNavigationState);
  expect(directLoadState.hasWorkspaceLeft).toBe(true);
  expect(directLoadState.hasWorkspaceMain).toBe(true);
  expect(directLoadState.title).toBe("Terms of Service | Samebase");
});

test("public legal routes share the public account right sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/terms", { waitUntil: "networkidle" });
  const leftPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="left"]');
  await expect(leftPane).toHaveCount(1);
  const accountSection = await expectPublicRouteRightSidebarAccount(page);
  await expect(accountSection).toHaveScreenshot("public-route-right-sidebar-account.png", {
    ...legalShellScreenshotOptions,
    maxDiffPixelRatio: 0.03,
  });

  await page.goto("/privacy", { waitUntil: "networkidle" });
  await expect(leftPane.locator('a[aria-current="page"]')).toHaveText("Privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expectPublicRouteRightSidebarAccount(page);
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveScreenshot(
    "privacy-shell.png",
    getLegalShellScreenshotOptions(page),
  );
});
