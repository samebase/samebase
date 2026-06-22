import { expect, test } from "@playwright/test";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import { signInIfNeeded } from "./liveHelpers";

const AUTHENTICATED_APP_ACCOUNT_SECTION_TEST_ID = "dashboard-sidebar-account-section";

const appRightSidebarScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

test("signed-in app right sidebar renders a static account section", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/");
  await page.waitForLoadState("networkidle");

  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const accountSection = rightSidebar.getByTestId(AUTHENTICATED_APP_ACCOUNT_SECTION_TEST_ID);

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
