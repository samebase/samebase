import { expect, test } from "@playwright/test";

import { parseRepositoryFullName } from "../shared/repoName";
import { signInIfNeeded } from "./liveHelpers";

const EXISTING_REPOSITORY_FULL_NAME = process.env.PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME?.trim();

test("shares a live repository summary between /vault and the selected sidebar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    EXISTING_REPOSITORY_FULL_NAME === undefined,
    "Set PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME to a repository this account may read.",
  );
  if (EXISTING_REPOSITORY_FULL_NAME === undefined) {
    throw new Error("PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME is required for this live test.");
  }
  const { name, owner } = parseRepositoryFullName(EXISTING_REPOSITORY_FULL_NAME);
  const selectedRoute = `/vault/${owner}/${name}`;

  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, `${selectedRoute}?dev`);
  const repositoryCard = page.locator("[data-vault-dashboard-repository-card]");
  const alreadyConnected = await repositoryCard.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!alreadyConnected) {
    await page.goto("/connect-repo?dev", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Search repositories...").fill(EXISTING_REPOSITORY_FULL_NAME);
    const repositoryRow = page
      .locator("div")
      .filter({ hasText: EXISTING_REPOSITORY_FULL_NAME })
      .first();
    await expect(repositoryRow).toBeVisible({ timeout: 60_000 });
    await repositoryRow.getByRole("button", { name: "Connect" }).click();
  }

  await expect(page).toHaveURL(new RegExp(`${selectedRoute}(?:[?#]|$)`), { timeout: 60_000 });
  const selectedDirectoryRow = page
    .getByTestId("repository-summary-directory-row")
    .filter({ hasText: EXISTING_REPOSITORY_FULL_NAME });
  await expect(selectedDirectoryRow).toBeVisible({ timeout: 60_000 });
  await expect(selectedDirectoryRow).toContainText("main", { timeout: 120_000 });
  await expect(selectedDirectoryRow).toContainText("PRs");
  await expect(repositoryCard).toBeVisible({ timeout: 120_000 });

  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  const rootDirectoryRow = page
    .getByTestId("repository-summary-directory-row")
    .filter({ hasText: EXISTING_REPOSITORY_FULL_NAME });
  await expect(rootDirectoryRow).toContainText("main", { timeout: 60_000 });
  await expect(rootDirectoryRow).toContainText("PRs");
});
