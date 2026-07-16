import { expect, test } from "@playwright/test";

import { parseRepositoryFullName } from "../shared/repoName";
import { signInIfNeeded } from "./liveHelpers";

const EXISTING_REPOSITORY_FULL_NAME = process.env.PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME?.trim();
const EXISTING_REPOSITORY_DEFAULT_BRANCH =
  process.env.PLAYWRIGHT_EXISTING_REPOSITORY_DEFAULT_BRANCH?.trim();

test("shares a live repository summary between /vault and the selected sidebar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    EXISTING_REPOSITORY_FULL_NAME === undefined || EXISTING_REPOSITORY_DEFAULT_BRANCH === undefined,
    "Set the existing repository name and default branch to a repository this account may read.",
  );
  if (
    EXISTING_REPOSITORY_FULL_NAME === undefined ||
    EXISTING_REPOSITORY_DEFAULT_BRANCH === undefined
  ) {
    throw new Error("The existing repository name and default branch are required for this test.");
  }
  const { name, owner } = parseRepositoryFullName(EXISTING_REPOSITORY_FULL_NAME);
  const selectedRoute = `/vault/${owner}/${name}`;
  const selectedRoutePattern = selectedRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
  const repositoryCard = page.locator("[data-vault-dashboard-repository-card]");
  const rootRepositoryRow = page
    .getByTestId("repository-summary-directory-row")
    .filter({ hasText: EXISTING_REPOSITORY_FULL_NAME });
  const alreadyConnected = await rootRepositoryRow
    .isVisible({ timeout: 10_000 })
    .catch(() => false);
  if (!alreadyConnected) {
    await page.goto("/connect-repo?dev", { waitUntil: "domcontentloaded" });
    await page
      .getByPlaceholder("Search or enter owner/repo...")
      .fill(EXISTING_REPOSITORY_FULL_NAME);
    const connectButton = page.getByRole("button", { name: "Connect", exact: true }).first();
    const alreadyConnectedMessage = page.getByText("Repository is already connected", {
      exact: true,
    });
    await expect(connectButton.or(alreadyConnectedMessage)).toBeVisible({ timeout: 60_000 });
    if (await connectButton.isVisible()) {
      await connectButton.click();
    } else {
      await page.goto(`${selectedRoute}?dev`, { waitUntil: "domcontentloaded" });
    }
  } else {
    await page.goto(`${selectedRoute}?dev`, { waitUntil: "domcontentloaded" });
  }

  await expect(page).toHaveURL(new RegExp(`${selectedRoutePattern}(?:[?#]|$)`), {
    timeout: 60_000,
  });
  const selectedDirectoryRow = page
    .getByTestId("repository-summary-directory-row")
    .filter({ hasText: EXISTING_REPOSITORY_FULL_NAME });
  await expect(selectedDirectoryRow).toBeVisible({ timeout: 60_000 });
  await expect(selectedDirectoryRow).toContainText(EXISTING_REPOSITORY_DEFAULT_BRANCH, {
    timeout: 120_000,
  });
  await expect(selectedDirectoryRow).toContainText("PRs");
  await expect(repositoryCard).toBeVisible({ timeout: 120_000 });

  const pullRequestLink = repositoryCard.getByRole("link", { name: /^PR #\d+ / }).first();
  if (await pullRequestLink.isVisible().catch(() => false)) {
    await expect(repositoryCard).toContainText(
      /\d+ lines added, \d+ lines removed, \d+ files? changed/,
    );
  }

  const filteredPullRequestCount = repositoryCard.getByText(/^\d+ of \d+ PRs$/).first();
  if (await filteredPullRequestCount.isVisible().catch(() => false)) {
    const countText = await filteredPullRequestCount.textContent();
    const countMatch = countText?.match(/^(\d+) of (\d+) PRs$/);
    if (!countMatch) {
      throw new Error("The filtered pull request count did not match its visible format.");
    }
    const totalPullRequestCount = countMatch[2];
    await repositoryCard.getByRole("button", { name: "Filters", exact: true }).click();
    const includeDrafts = page.getByRole("checkbox", { name: "Include drafts" });
    await includeDrafts.check();
    await expect(
      repositoryCard.getByText(`${totalPullRequestCount} PRs`, { exact: true }).first(),
    ).toBeVisible({
      timeout: 60_000,
    });
    await includeDrafts.uncheck();
    await expect(filteredPullRequestCount).toBeVisible({ timeout: 60_000 });
  }

  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  const rootDirectoryRow = page
    .getByTestId("repository-summary-directory-row")
    .filter({ hasText: EXISTING_REPOSITORY_FULL_NAME });
  await expect(rootDirectoryRow).toContainText(EXISTING_REPOSITORY_DEFAULT_BRANCH, {
    timeout: 60_000,
  });
  await expect(rootDirectoryRow).toContainText("PRs");
});
