import { devices, expect, test } from "@playwright/test";

import {
  applyOrganizationContextAcceptanceFixture,
  createOrganizationContextAcceptanceAccount,
} from "./organizationContextAcceptance";
import { VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE } from "./visualFixtureTest";
import { saveWorkspaceSidebarState } from "./workspaceSidebarState";

const FILE_VIEW_ACCEPTANCE_STAFF_EMAIL = "nicuchiciuc@gmail.com";

test.use(devices["Pixel 7"]);

test("file selections keep the mobile left pane open", async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const ownerLogin = `org-context-file-pane-${suffix}`;
  const repositoryName = "selection-app";
  const route = `/repo/${ownerLogin}/${repositoryName}/fs/main/README.md`;

  await createOrganizationContextAcceptanceAccount(page, FILE_VIEW_ACCEPTANCE_STAFF_EMAIL);
  await applyOrganizationContextAcceptanceFixture({
    email: FILE_VIEW_ACCEPTANCE_STAFF_EMAIL,
    organizations: [
      {
        access: "retain",
        ownerLogin,
        repositories: [repositoryName],
      },
    ],
  });
  await saveWorkspaceSidebarState(page, {
    ...VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE,
    mobilePane: "left",
  });
  await page.goto(route, { waitUntil: "domcontentloaded" });

  const workspace = page.locator('[data-sidebar-layout-part="viewport"]');
  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");
  await page
    .locator('[data-sidebar-layout-part="pane"][data-pane-side="left"]')
    .getByText("README.md", { exact: true })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/repo/${ownerLogin}/${repositoryName}/fs/main/README\\.md`),
  );
  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");

  await page.keyboard.press("Control+p");
  const commandPalette = page.getByRole("dialog");
  await expect(commandPalette.getByPlaceholder("Search files...")).toBeFocused();
  await commandPalette.getByText("README.md", { exact: true }).click();

  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");
});
