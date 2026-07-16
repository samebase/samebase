import { expect, test, type Locator, type Page } from "@playwright/test";

import { parseRepositoryFullName } from "../shared/repoName";
import { signInIfNeeded } from "./liveHelpers";

const EXISTING_REPOSITORY_FULL_NAME = process.env.PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME?.trim();
const EXISTING_REPOSITORY_DEFAULT_BRANCH =
  process.env.PLAYWRIGHT_EXISTING_REPOSITORY_DEFAULT_BRANCH?.trim();
const OTHER_REPOSITORY_FULL_NAME = process.env.PLAYWRIGHT_OTHER_REPOSITORY_FULL_NAME?.trim();
const OTHER_REPOSITORY_DEFAULT_BRANCH =
  process.env.PLAYWRIGHT_OTHER_REPOSITORY_DEFAULT_BRANCH?.trim();
const OTHER_EXPECTED_OPEN_PULL_REQUEST_COUNT =
  process.env.PLAYWRIGHT_OTHER_EXPECTED_OPEN_PULL_REQUEST_COUNT;
const EXPECTED_TOTAL_PULL_REQUEST_COUNT = process.env.PLAYWRIGHT_EXPECTED_TOTAL_PULL_REQUEST_COUNT;
const EXPECTED_VISIBLE_PULL_REQUEST_COUNT =
  process.env.PLAYWRIGHT_EXPECTED_VISIBLE_PULL_REQUEST_COUNT;
const EXPECTED_PULL_REQUEST_NUMBER = process.env.PLAYWRIGHT_EXPECTED_PULL_REQUEST_NUMBER;
const EXPECTED_NONDEFAULT_PULL_REQUEST_NUMBER =
  process.env.PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_NUMBER;
const EXPECTED_NONDEFAULT_BASE = process.env.PLAYWRIGHT_EXPECTED_NONDEFAULT_BASE?.trim();
const EXPECTED_PULL_REQUEST_AHEAD_BY = process.env.PLAYWRIGHT_EXPECTED_PULL_REQUEST_AHEAD_BY;
const EXPECTED_PULL_REQUEST_BEHIND_BY = process.env.PLAYWRIGHT_EXPECTED_PULL_REQUEST_BEHIND_BY;
const EXPECTED_PULL_REQUEST_ADDITIONS = process.env.PLAYWRIGHT_EXPECTED_PULL_REQUEST_ADDITIONS;
const EXPECTED_PULL_REQUEST_DELETIONS = process.env.PLAYWRIGHT_EXPECTED_PULL_REQUEST_DELETIONS;
const EXPECTED_PULL_REQUEST_CHANGED_FILES =
  process.env.PLAYWRIGHT_EXPECTED_PULL_REQUEST_CHANGED_FILES;
const EXPECTED_NONDEFAULT_PULL_REQUEST_AHEAD_BY =
  process.env.PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_AHEAD_BY;
const EXPECTED_NONDEFAULT_PULL_REQUEST_BEHIND_BY =
  process.env.PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_BEHIND_BY;
const EXPECTED_NONDEFAULT_PULL_REQUEST_ADDITIONS =
  process.env.PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_ADDITIONS;
const EXPECTED_NONDEFAULT_PULL_REQUEST_DELETIONS =
  process.env.PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_DELETIONS;
const EXPECTED_NONDEFAULT_PULL_REQUEST_CHANGED_FILES =
  process.env.PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_CHANGED_FILES;
const EXPECTED_NEWEST_VISIBLE_PULL_REQUEST_NUMBER =
  process.env.PLAYWRIGHT_EXPECTED_NEWEST_VISIBLE_PULL_REQUEST_NUMBER;
const EXPECTED_BRANCH_NAME = process.env.PLAYWRIGHT_EXPECTED_BRANCH_NAME?.trim();
const EXPECTED_BRANCH_AHEAD_BY = process.env.PLAYWRIGHT_EXPECTED_BRANCH_AHEAD_BY;
const EXPECTED_BRANCH_BEHIND_BY = process.env.PLAYWRIGHT_EXPECTED_BRANCH_BEHIND_BY;
const EXPECTED_FILTER_LABEL = process.env.PLAYWRIGHT_EXPECTED_FILTER_LABEL?.trim();
const EXPECTED_FILTERED_VISIBLE_PULL_REQUEST_COUNT =
  process.env.PLAYWRIGHT_EXPECTED_FILTERED_VISIBLE_PULL_REQUEST_COUNT;

function positiveInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function nonnegativeInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a nonnegative integer.`);
  }
  return parsed;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureRepositoryConnected(
  page: Parameters<typeof signInIfNeeded>[0],
  fullName: string,
) {
  const { name, owner } = parseRepositoryFullName(fullName);
  const route = `/vault/${owner}/${name}`;
  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  const directoryRow = page
    .getByTestId("repository-summary-directory-row")
    .filter({ hasText: fullName });
  if (await directoryRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return route;
  }

  await page.goto("/connect-repo?dev", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Search or enter owner/repo...").fill(fullName);
  const connectButton = page.getByRole("button", { name: "Connect", exact: true }).first();
  const alreadyConnectedMessage = page.getByText("Repository is already connected", {
    exact: true,
  });
  await expect(connectButton.or(alreadyConnectedMessage)).toBeVisible({ timeout: 60_000 });
  if (await connectButton.isVisible()) {
    await connectButton.click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(route)}(?:[?#]|$)`), {
      timeout: 60_000,
    });
  }
  return route;
}

async function revealPullRequest(
  page: Page,
  repositoryCard: Locator,
  pullRequestLink: Locator,
  totalPullRequestCount: number,
): Promise<void> {
  const branchListEnd = repositoryCard.locator("[data-vault-dashboard-branch-list-end]");
  const maximumPageLoads = Math.ceil(totalPullRequestCount / 10) + 1;
  for (let pageIndex = 0; pageIndex < maximumPageLoads; pageIndex += 1) {
    if (await pullRequestLink.isVisible().catch(() => false)) {
      return;
    }
    await branchListEnd.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
  }
  throw new Error("The expected pull request was not reachable through bounded list pagination.");
}

async function closePullRequestFilters(
  filtersButton: Locator,
  closeFilters: Locator,
): Promise<void> {
  if (await closeFilters.isVisible().catch(() => false)) {
    await closeFilters.click();
  } else {
    await filtersButton.click();
  }
}

test("shares a live repository summary between /vault and the selected sidebar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const requiredEnvironment = [
    EXISTING_REPOSITORY_FULL_NAME,
    EXISTING_REPOSITORY_DEFAULT_BRANCH,
    OTHER_REPOSITORY_FULL_NAME,
    OTHER_REPOSITORY_DEFAULT_BRANCH,
    OTHER_EXPECTED_OPEN_PULL_REQUEST_COUNT,
    EXPECTED_TOTAL_PULL_REQUEST_COUNT,
    EXPECTED_VISIBLE_PULL_REQUEST_COUNT,
    EXPECTED_PULL_REQUEST_NUMBER,
    EXPECTED_NONDEFAULT_PULL_REQUEST_NUMBER,
    EXPECTED_NONDEFAULT_BASE,
    EXPECTED_PULL_REQUEST_AHEAD_BY,
    EXPECTED_PULL_REQUEST_BEHIND_BY,
    EXPECTED_PULL_REQUEST_ADDITIONS,
    EXPECTED_PULL_REQUEST_DELETIONS,
    EXPECTED_PULL_REQUEST_CHANGED_FILES,
    EXPECTED_NONDEFAULT_PULL_REQUEST_AHEAD_BY,
    EXPECTED_NONDEFAULT_PULL_REQUEST_BEHIND_BY,
    EXPECTED_NONDEFAULT_PULL_REQUEST_ADDITIONS,
    EXPECTED_NONDEFAULT_PULL_REQUEST_DELETIONS,
    EXPECTED_NONDEFAULT_PULL_REQUEST_CHANGED_FILES,
    EXPECTED_NEWEST_VISIBLE_PULL_REQUEST_NUMBER,
    EXPECTED_BRANCH_NAME,
    EXPECTED_BRANCH_AHEAD_BY,
    EXPECTED_BRANCH_BEHIND_BY,
    EXPECTED_FILTER_LABEL,
    EXPECTED_FILTERED_VISIBLE_PULL_REQUEST_COUNT,
  ];
  if (requiredEnvironment.some((value) => value === undefined)) {
    throw new Error(
      "Set both repository identities plus every exact pull request validation value.",
    );
  }
  if (
    EXISTING_REPOSITORY_FULL_NAME === undefined ||
    EXISTING_REPOSITORY_DEFAULT_BRANCH === undefined ||
    OTHER_REPOSITORY_FULL_NAME === undefined ||
    OTHER_REPOSITORY_DEFAULT_BRANCH === undefined ||
    OTHER_EXPECTED_OPEN_PULL_REQUEST_COUNT === undefined ||
    EXPECTED_TOTAL_PULL_REQUEST_COUNT === undefined ||
    EXPECTED_VISIBLE_PULL_REQUEST_COUNT === undefined ||
    EXPECTED_PULL_REQUEST_NUMBER === undefined ||
    EXPECTED_NONDEFAULT_PULL_REQUEST_NUMBER === undefined ||
    EXPECTED_NONDEFAULT_BASE === undefined ||
    EXPECTED_PULL_REQUEST_AHEAD_BY === undefined ||
    EXPECTED_PULL_REQUEST_BEHIND_BY === undefined ||
    EXPECTED_PULL_REQUEST_ADDITIONS === undefined ||
    EXPECTED_PULL_REQUEST_DELETIONS === undefined ||
    EXPECTED_PULL_REQUEST_CHANGED_FILES === undefined ||
    EXPECTED_NONDEFAULT_PULL_REQUEST_AHEAD_BY === undefined ||
    EXPECTED_NONDEFAULT_PULL_REQUEST_BEHIND_BY === undefined ||
    EXPECTED_NONDEFAULT_PULL_REQUEST_ADDITIONS === undefined ||
    EXPECTED_NONDEFAULT_PULL_REQUEST_DELETIONS === undefined ||
    EXPECTED_NONDEFAULT_PULL_REQUEST_CHANGED_FILES === undefined ||
    EXPECTED_NEWEST_VISIBLE_PULL_REQUEST_NUMBER === undefined ||
    EXPECTED_BRANCH_NAME === undefined ||
    EXPECTED_BRANCH_AHEAD_BY === undefined ||
    EXPECTED_BRANCH_BEHIND_BY === undefined ||
    EXPECTED_FILTER_LABEL === undefined ||
    EXPECTED_FILTERED_VISIBLE_PULL_REQUEST_COUNT === undefined
  ) {
    throw new Error("The live repository validation environment is incomplete.");
  }
  const totalPullRequestCount = positiveInteger(
    "PLAYWRIGHT_EXPECTED_TOTAL_PULL_REQUEST_COUNT",
    EXPECTED_TOTAL_PULL_REQUEST_COUNT,
  );
  const otherOpenPullRequestCount = nonnegativeInteger(
    "PLAYWRIGHT_OTHER_EXPECTED_OPEN_PULL_REQUEST_COUNT",
    OTHER_EXPECTED_OPEN_PULL_REQUEST_COUNT,
  );
  const visiblePullRequestCount = positiveInteger(
    "PLAYWRIGHT_EXPECTED_VISIBLE_PULL_REQUEST_COUNT",
    EXPECTED_VISIBLE_PULL_REQUEST_COUNT,
  );
  const pullRequestNumber = positiveInteger(
    "PLAYWRIGHT_EXPECTED_PULL_REQUEST_NUMBER",
    EXPECTED_PULL_REQUEST_NUMBER,
  );
  const nondefaultPullRequestNumber = positiveInteger(
    "PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_NUMBER",
    EXPECTED_NONDEFAULT_PULL_REQUEST_NUMBER,
  );
  const pullRequestAheadBy = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_PULL_REQUEST_AHEAD_BY",
    EXPECTED_PULL_REQUEST_AHEAD_BY,
  );
  const pullRequestBehindBy = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_PULL_REQUEST_BEHIND_BY",
    EXPECTED_PULL_REQUEST_BEHIND_BY,
  );
  const pullRequestAdditions = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_PULL_REQUEST_ADDITIONS",
    EXPECTED_PULL_REQUEST_ADDITIONS,
  );
  const pullRequestDeletions = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_PULL_REQUEST_DELETIONS",
    EXPECTED_PULL_REQUEST_DELETIONS,
  );
  const pullRequestChangedFiles = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_PULL_REQUEST_CHANGED_FILES",
    EXPECTED_PULL_REQUEST_CHANGED_FILES,
  );
  const nondefaultPullRequestAheadBy = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_AHEAD_BY",
    EXPECTED_NONDEFAULT_PULL_REQUEST_AHEAD_BY,
  );
  const nondefaultPullRequestBehindBy = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_BEHIND_BY",
    EXPECTED_NONDEFAULT_PULL_REQUEST_BEHIND_BY,
  );
  const nondefaultPullRequestAdditions = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_ADDITIONS",
    EXPECTED_NONDEFAULT_PULL_REQUEST_ADDITIONS,
  );
  const nondefaultPullRequestDeletions = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_DELETIONS",
    EXPECTED_NONDEFAULT_PULL_REQUEST_DELETIONS,
  );
  const nondefaultPullRequestChangedFiles = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_NONDEFAULT_PULL_REQUEST_CHANGED_FILES",
    EXPECTED_NONDEFAULT_PULL_REQUEST_CHANGED_FILES,
  );
  const newestVisiblePullRequestNumber = positiveInteger(
    "PLAYWRIGHT_EXPECTED_NEWEST_VISIBLE_PULL_REQUEST_NUMBER",
    EXPECTED_NEWEST_VISIBLE_PULL_REQUEST_NUMBER,
  );
  const branchAheadBy = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_BRANCH_AHEAD_BY",
    EXPECTED_BRANCH_AHEAD_BY,
  );
  const branchBehindBy = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_BRANCH_BEHIND_BY",
    EXPECTED_BRANCH_BEHIND_BY,
  );
  const filteredByLabelPullRequestCount = nonnegativeInteger(
    "PLAYWRIGHT_EXPECTED_FILTERED_VISIBLE_PULL_REQUEST_COUNT",
    EXPECTED_FILTERED_VISIBLE_PULL_REQUEST_COUNT,
  );
  const { name, owner } = parseRepositoryFullName(EXISTING_REPOSITORY_FULL_NAME);
  const selectedRoute = `/vault/${owner}/${name}`;
  const selectedRoutePattern = escapeRegExp(selectedRoute);
  if (OTHER_REPOSITORY_FULL_NAME.toLowerCase() === EXISTING_REPOSITORY_FULL_NAME.toLowerCase()) {
    throw new Error("The live directory validation requires two distinct repositories.");
  }
  if (EXPECTED_NONDEFAULT_BASE === EXISTING_REPOSITORY_DEFAULT_BRANCH) {
    throw new Error("The nondefault pull request must target a nondefault base.");
  }
  if (nondefaultPullRequestNumber === pullRequestNumber) {
    throw new Error("The default-base and nondefault-base pull request fixtures must differ.");
  }
  if (EXPECTED_BRANCH_NAME === EXISTING_REPOSITORY_DEFAULT_BRANCH) {
    throw new Error("The branch comparison fixture must be a nondefault branch.");
  }
  if (visiblePullRequestCount >= totalPullRequestCount) {
    throw new Error("The default filter must exclude at least one pull request.");
  }
  if (filteredByLabelPullRequestCount >= visiblePullRequestCount) {
    throw new Error("The label filter must exclude at least one additional pull request.");
  }

  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
  await ensureRepositoryConnected(page, EXISTING_REPOSITORY_FULL_NAME);
  await ensureRepositoryConnected(page, OTHER_REPOSITORY_FULL_NAME);
  await page.goto(`${selectedRoute}?dev`, { waitUntil: "domcontentloaded" });
  const repositoryCard = page.locator("[data-vault-dashboard-repository-card]");

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
  await expect(selectedDirectoryRow).toContainText(`${formatCount(totalPullRequestCount)} PRs`);
  await expect(repositoryCard).toBeVisible({ timeout: 120_000 });
  const filtersButton = repositoryCard.getByRole("button", { name: "Filters", exact: true });
  await filtersButton.click();
  const resetAllFilters = page.getByRole("button", { name: "Reset all", exact: true });
  if (await resetAllFilters.isVisible().catch(() => false)) {
    await resetAllFilters.click();
  }
  const closeFilters = page.getByRole("button", { name: "Close", exact: true });
  await closePullRequestFilters(filtersButton, closeFilters);
  const filteredPullRequestCount = repositoryCard.getByText(
    `${visiblePullRequestCount} of ${totalPullRequestCount} PRs`,
    { exact: true },
  );
  await expect(filteredPullRequestCount).toBeVisible({ timeout: 120_000 });
  await expect(
    repositoryCard.getByRole("link", { name: /^PR #\d+ / }).first(),
  ).toHaveAccessibleName(new RegExp(`^PR #${newestVisiblePullRequestNumber} `));
  const pullRequestRow = repositoryCard
    .getByRole("link", { name: new RegExp(`^PR #${pullRequestNumber} `) })
    .locator('xpath=ancestor::*[@data-vault-dashboard-branch-row=""]');
  await expect(pullRequestRow).toBeVisible({ timeout: 120_000 });
  await expect(pullRequestRow).toContainText(
    `${formatCount(pullRequestAheadBy)} commits ahead and ${formatCount(pullRequestBehindBy)} commits behind ${EXISTING_REPOSITORY_DEFAULT_BRANCH}`,
  );
  const branchRow = repositoryCard
    .getByRole("link", {
      name: `Open ${EXPECTED_BRANCH_NAME} branch on GitHub`,
      exact: true,
    })
    .locator('xpath=ancestor::*[@data-vault-dashboard-branch-row=""]');
  await expect(branchRow).toBeVisible({ timeout: 120_000 });
  await expect(branchRow).toContainText(
    `${formatCount(branchAheadBy)} commits ahead and ${formatCount(branchBehindBy)} commits behind ${EXISTING_REPOSITORY_DEFAULT_BRANCH}`,
  );

  const nondefaultPullRequestLink = repositoryCard.getByRole("link", {
    name: new RegExp(`^PR #${nondefaultPullRequestNumber} `),
  });
  await expect(nondefaultPullRequestLink).toHaveCount(0);
  await expect(pullRequestRow).toContainText(
    `${formatCount(pullRequestAdditions)} lines added, ${formatCount(pullRequestDeletions)} lines removed, ${formatCount(pullRequestChangedFiles)} ${pullRequestChangedFiles === 1 ? "file" : "files"} changed`,
  );

  await filtersButton.click();
  await page.getByRole("textbox", { name: "Filter labels" }).fill(EXPECTED_FILTER_LABEL);
  const filterLabelCheckbox = page
    .locator("label")
    .filter({ has: page.getByTitle(EXPECTED_FILTER_LABEL, { exact: true }) })
    .getByRole("checkbox");
  await filterLabelCheckbox.click();
  await expect(
    repositoryCard.getByText(`${filteredByLabelPullRequestCount} of ${totalPullRequestCount} PRs`, {
      exact: true,
    }),
  ).toBeVisible({ timeout: 120_000 });
  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await page.goto(`${selectedRoute}?dev`, { waitUntil: "domcontentloaded" });
  await expect(
    repositoryCard.getByText(`${filteredByLabelPullRequestCount} of ${totalPullRequestCount} PRs`, {
      exact: true,
    }),
  ).toBeVisible({ timeout: 120_000 });
  await filtersButton.click();
  await page.getByRole("textbox", { name: "Filter labels" }).fill(EXPECTED_FILTER_LABEL);
  await page
    .locator("label")
    .filter({ has: page.getByTitle(EXPECTED_FILTER_LABEL, { exact: true }) })
    .getByRole("checkbox")
    .click();
  await expect(filteredPullRequestCount).toBeVisible({ timeout: 120_000 });
  await page.getByRole("textbox", { name: "Filter labels" }).fill("");
  const includeDrafts = page.getByRole("checkbox", { name: "Include drafts" });
  await includeDrafts.click();
  await expect(
    repositoryCard.getByText(`${totalPullRequestCount} PRs`, { exact: true }).first(),
  ).toBeVisible({ timeout: 120_000 });
  await closePullRequestFilters(filtersButton, closeFilters);
  await revealPullRequest(page, repositoryCard, nondefaultPullRequestLink, totalPullRequestCount);
  const nondefaultPullRequestRow = nondefaultPullRequestLink.locator(
    'xpath=ancestor::*[@data-vault-dashboard-branch-row=""]',
  );
  await expect(nondefaultPullRequestRow).toBeVisible({ timeout: 120_000 });
  await expect(nondefaultPullRequestRow).toContainText(
    `${formatCount(nondefaultPullRequestAheadBy)} commits ahead and ${formatCount(nondefaultPullRequestBehindBy)} commits behind ${EXPECTED_NONDEFAULT_BASE}`,
  );
  await expect(nondefaultPullRequestRow).toContainText(
    `${formatCount(nondefaultPullRequestAdditions)} lines added, ${formatCount(nondefaultPullRequestDeletions)} lines removed, ${formatCount(nondefaultPullRequestChangedFiles)} ${nondefaultPullRequestChangedFiles === 1 ? "file" : "files"} changed`,
  );
  await filtersButton.click();
  await includeDrafts.click();
  await expect(filteredPullRequestCount).toBeVisible({ timeout: 120_000 });

  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  const rootDirectoryRow = page
    .getByTestId("repository-summary-directory-row")
    .filter({ hasText: EXISTING_REPOSITORY_FULL_NAME });
  await expect(rootDirectoryRow).toContainText(EXISTING_REPOSITORY_DEFAULT_BRANCH, {
    timeout: 60_000,
  });
  await expect(rootDirectoryRow).toContainText(`${formatCount(totalPullRequestCount)} PRs`);
  const otherDirectoryRow = page
    .getByTestId("repository-summary-directory-row")
    .filter({ hasText: OTHER_REPOSITORY_FULL_NAME });
  await expect(otherDirectoryRow).toContainText(OTHER_REPOSITORY_DEFAULT_BRANCH, {
    timeout: 120_000,
  });
  await expect(otherDirectoryRow).toContainText(`${formatCount(otherOpenPullRequestCount)} PRs`);
});
