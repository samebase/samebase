import { expect, test, type Page } from "@playwright/test";
import { APP_BUILD_VERSION_TEST_ID } from "../src/lib/appBuild";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";

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

  await page.goto("/", { waitUntil: "networkidle" });
  const currentSidebarLink = page
    .locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]')
    .getByRole("link", { current: "page" });
  await expect(currentSidebarLink).toHaveText("/landing");
  await expect(currentSidebarLink).toHaveCSS("font-weight", "600");
  await page.getByRole("link", { name: "/terms", exact: true }).first().click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(currentSidebarLink).toHaveText("/terms");
  await expect(currentSidebarLink).toHaveCSS("font-weight", "600");
  const clientNavigationState = await readTermsRouteState(page);
  await expectPublicRouteRightSidebarAccount(page);
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveScreenshot(
    "terms-shell.png",
    getLegalShellScreenshotOptions(page),
  );

  await page.goto("/terms", { waitUntil: "networkidle" });
  await expect(currentSidebarLink).toHaveText("/terms");
  const directLoadState = await readTermsRouteState(page);
  await expectPublicRouteRightSidebarAccount(page);
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveScreenshot(
    "terms-shell.png",
    getLegalShellScreenshotOptions(page),
  );

  expect(directLoadState).toEqual(clientNavigationState);
  expect(directLoadState.hasWorkspaceLeft).toBe(false);
  expect(directLoadState.hasWorkspaceMain).toBe(true);
  expect(directLoadState.title).toBe("Terms of Service | Samebase");
});

test("public legal routes share the public account right sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/terms", { waitUntil: "networkidle" });
  await expect(
    page.locator('[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
  ).toHaveCount(0);
  const accountSection = await expectPublicRouteRightSidebarAccount(page);
  await expect(accountSection).toHaveScreenshot("public-route-right-sidebar-account.png", {
    ...legalShellScreenshotOptions,
    maxDiffPixelRatio: 0.03,
  });

  await page.goto("/privacy", { waitUntil: "networkidle" });
  await expect(
    page
      .locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]')
      .getByRole("link", { current: "page" }),
  ).toHaveText("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(
    page.locator('[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
  ).toHaveCount(0);
  await expectPublicRouteRightSidebarAccount(page);
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveScreenshot(
    "privacy-shell.png",
    getLegalShellScreenshotOptions(page),
  );
});
