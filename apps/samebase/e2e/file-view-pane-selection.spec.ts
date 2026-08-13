import { devices, expect, test } from "@playwright/test";

import {
  applyOrganizationContextAcceptanceFixture,
  createOrganizationContextAcceptanceAccount,
} from "./organizationContextAcceptance";
import { seedVisualFixtureWorkspaceSidebarState } from "./visualFixtureTest";

const FILE_VIEW_ACCEPTANCE_STAFF_EMAIL = "nicuchiciuc@gmail.com";

test.use(devices["Pixel 7"]);

test("file-tree selection keeps the mobile left pane open", async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const ownerLogin = `org-context-file-pane-${suffix}`;
  const repositoryName = "selection-app";
  const route = `/vault/${ownerLogin}/${repositoryName}/fs/main/README.md`;

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
  await seedVisualFixtureWorkspaceSidebarState(page, { mobilePane: "left" });
  await page.goto(route, { waitUntil: "domcontentloaded" });

  const workspace = page.locator("[data-workspace-layout-v2]");
  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");
  await page
    .getByTestId("workspace-layout-v2-pane-left")
    .getByText("README.md", { exact: true })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/vault/${ownerLogin}/${repositoryName}/fs/main/README\\.md`),
  );
  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");
});
