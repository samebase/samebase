import { expect, type Locator, type Page, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

// Worktree runs can override this so the temporary repo prefix follows the
// repo's tmp-<worktree-id>-<intent> convention without hard-coding one value.
const TEMP_REPOSITORY_PREFIX =
  process.env.PLAYWRIGHT_TEMP_REPO_PREFIX?.trim() ||
  "tmp-main-playwright-create-app";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTemporaryRepositoryName(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${TEMP_REPOSITORY_PREFIX}-${Date.now()}-${randomSuffix}`;
}

function removeVaultButton(page: Page, repoName: string): Locator {
  return page.getByRole("button", {
    name: new RegExp(`^Remove vault .*/${escapeRegExp(repoName)}$`),
  });
}

function vaultCard(page: Page, repoName: string): Locator {
  return removeVaultButton(page, repoName).locator(
    "xpath=ancestor::div[contains(@class, 'corner-notch-1')][1]",
  );
}

async function createAppIfAvailable(
  page: Page,
  repoName: string,
): Promise<void> {
  const repositoryNameInput = page.getByPlaceholder("New App name");
  const createError = page.locator(".text-red-600").last();
  await expect(repositoryNameInput).toBeVisible({ timeout: 15_000 });

  test.skip(
    await repositoryNameInput.isDisabled(),
    "App creation is unavailable. Connect GitHub, Convex, and Cloudflare before running this live spec.",
  );

  await repositoryNameInput.fill(repoName);
  await page.getByRole("button", { name: "New App" }).click();

  // Catch the cleared-input assertion so we can inspect createError and skip
  // cleanly when vaultActions.ts reports an environment-only starter seeding
  // failure instead of treating that provider setup issue as a product bug.
  try {
    await expect(repositoryNameInput).toHaveValue("", { timeout: 30_000 });
    return;
  } catch (error) {
    const createErrorMessage = (await createError.textContent())?.trim() ?? "";
    test.skip(
      createErrorMessage.includes("Failed to seed starter repository"),
      "App creation is unavailable because starter repository seeding failed in this environment.",
    );
    throw error;
  }
}

async function removeTemporaryVault(
  page: Page,
  repoName: string,
): Promise<void> {
  const removeButton = removeVaultButton(page, repoName);
  await expect(removeButton).toBeVisible({ timeout: 120_000 });

  await removeButton.click();

  const removeDialog = page.getByRole("dialog");
  await expect(removeDialog).toBeVisible({ timeout: 15_000 });

  const removeGithubRepositoryCheckbox = removeDialog.getByLabel(
    "Also remove GitHub repository",
  );
  if ((await removeGithubRepositoryCheckbox.count()) > 0) {
    await expect(removeGithubRepositoryCheckbox).toBeChecked();
  }

  await removeDialog.getByRole("button", { name: "Remove Vault" }).click();
  await expect(removeDialog).not.toBeVisible({ timeout: 120_000 });
  await expect(removeButton).toHaveCount(0, { timeout: 120_000 });
}

test.describe("vault create app live flow", () => {
  test("creates a temporary app and shows it on the dashboard", async ({
    page,
  }, testInfo) => {
    test.slow();
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "This live test mutates external state, so it runs once on the desktop project.",
    );

    const repositoryName = buildTemporaryRepositoryName();
    let createdRepository = false;

    await testInfo.attach("temporary-repository-name", {
      body: repositoryName,
      contentType: "text/plain",
    });

    try {
      await page.goto("/?dev", { waitUntil: "domcontentloaded" });
      await signInIfNeeded(page);
      await createAppIfAvailable(page, repositoryName);
      createdRepository = true;

      const createdVaultCard = vaultCard(page, repositoryName);
      const repositoryLink = createdVaultCard.locator(
        `a[href^="https://github.com/"][href$="/${repositoryName}"]`,
      );

      await expect(createdVaultCard).toBeVisible({ timeout: 120_000 });
      await expect(repositoryLink).toBeVisible({ timeout: 120_000 });
      await expect(
        createdVaultCard.getByRole("button", { name: "Developer tools" }),
      ).toBeVisible({ timeout: 120_000 });

      await testInfo.attach("created-repository-link", {
        body: (await repositoryLink.first().getAttribute("href")) ?? "",
        contentType: "text/plain",
      });
    } finally {
      // Exercise the same dashboard removal path operators use so the temporary
      // repo does not linger after the live test completes.
      if (createdRepository) {
        await page.goto("/?dev", { waitUntil: "domcontentloaded" });
        await signInIfNeeded(page);
        await removeTemporaryVault(page, repositoryName);
      }
    }
  });
});
