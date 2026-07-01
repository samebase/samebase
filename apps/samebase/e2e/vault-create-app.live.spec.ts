import { expect, type Locator, type Page, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

// Worktree runs can override this so the temporary repo prefix follows the
// repo's tmp-<worktree-id>-<intent> convention without hard-coding one value.
const TEMP_REPOSITORY_PREFIX =
  process.env.PLAYWRIGHT_TEMP_REPO_PREFIX?.trim() || "tmp-main-playwright-create-app";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTemporaryRepositoryName(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${TEMP_REPOSITORY_PREFIX}-${Date.now()}-${randomSuffix}`;
}

function removeVaultControl(page: Page, repoName: string): Locator {
  return page.getByRole("link", {
    name: new RegExp(`^Remove vault .*/${escapeRegExp(repoName)}$`),
  });
}

function vaultCard(page: Page, repoName: string): Locator {
  return page
    .getByRole("link", {
      name: new RegExp(`^#${escapeRegExp(repoName)}(?: \\(deleting\\.\\.\\.\\))?$`),
    })
    .locator("xpath=ancestor::div[.//button[normalize-space(.)='Developer tools']][1]");
}

function setupFailedVaultCard(page: Page, repoName: string): Locator {
  return page
    .getByRole("link", {
      name: new RegExp(`^#${escapeRegExp(repoName)} \\(setup failed\\)$`),
    })
    .locator("xpath=ancestor::div[.//button[normalize-space(.)='Developer tools']][1]");
}

async function createAppIfAvailable(page: Page, repoName: string): Promise<void> {
  await page.getByRole("link", { name: "New App" }).click();
  await expect(page).toHaveURL(/\/new-app(?:[?#]|$)/);

  const newAppPage = page.getByTestId("new-app-page");
  const repositoryNameInput = newAppPage.getByPlaceholder("GitHub repo name");
  const createError = page.locator(".text-red-600").last();
  await expect(repositoryNameInput).toBeVisible({ timeout: 15_000 });

  test.skip(
    await repositoryNameInput.isDisabled(),
    "App creation is unavailable. Connect GitHub, Convex, and Cloudflare before running this live spec.",
  );

  await repositoryNameInput.fill(repoName);
  await newAppPage.getByRole("button", { name: "New App" }).click();

  // Catch the route-leave assertion so we can inspect createError and skip
  // cleanly when vaultActions.ts reports an environment-only starter seeding
  // failure instead of treating that provider setup issue as a product bug.
  try {
    await expect(page).toHaveURL(/\/vault(?:[?#]|$)/, { timeout: 30_000 });
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

async function removeTemporaryVault(page: Page, repoName: string): Promise<void> {
  const removeControl = removeVaultControl(page, repoName);
  await expect(removeControl).toBeVisible({ timeout: 120_000 });

  await removeControl.click();

  const removeDialog = page.getByRole("dialog");
  await expect(removeDialog).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/(?:\?|&)delete(?:&|#|$)/);

  const cleanupCheckboxLabels = [
    "Also remove GitHub repository",
    /^Also remove all Codespaces/,
    "Also remove Convex project/deployment",
    "Also remove Cloudflare Worker",
  ];
  for (const label of cleanupCheckboxLabels) {
    const cleanupCheckbox = removeDialog.getByRole("checkbox", {
      name: label,
    });
    if ((await cleanupCheckbox.count()) > 0 && !(await cleanupCheckbox.isDisabled())) {
      await expect(cleanupCheckbox).not.toBeChecked();
      await cleanupCheckbox.click();
    }
  }

  await removeDialog.getByRole("button", { name: "Remove Vault" }).click();
  await expect(removeDialog).not.toBeVisible({ timeout: 120_000 });
  await expect(page).toHaveURL(/(?:\?|&)dev(?:[=&]|&|#|$)/);
  await expect(page).not.toHaveURL(/(?:\?|&)delete(?:&|#|$)/);
  await expect(removeControl).toHaveCount(0, { timeout: 120_000 });
}

async function waitForVaultCreationResult(args: {
  createdVaultCard: Locator;
  failedVaultCard: Locator;
}): Promise<"ready" | "setup-failed"> {
  const readyPromise = args.createdVaultCard
    .waitFor({ state: "visible", timeout: 120_000 })
    .then(() => "ready" as const);
  const failedPromise = args.failedVaultCard
    .waitFor({ state: "visible", timeout: 120_000 })
    .then(() => "setup-failed" as const);

  try {
    return await Promise.race([readyPromise, failedPromise]);
  } finally {
    // The other wait keeps running after Promise.race settles; observe it so
    // page cleanup cannot surface its later timeout as an unhandled rejection.
    void readyPromise.catch(() => undefined);
    void failedPromise.catch(() => undefined);
  }
}

test.describe("vault create app live flow", () => {
  test("shows the new app form without a cancel control", async ({ page }) => {
    await page.goto("/new-app", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(page, "/new-app");

    const newAppPage = page.getByTestId("new-app-page");
    await expect(newAppPage).toBeVisible();
    await expect(newAppPage.getByRole("button", { name: "New App" })).toBeVisible();
    await expect(newAppPage.getByRole("button", { exact: true, name: "Cancel" })).toHaveCount(0);
    await expect(newAppPage.getByRole("link", { exact: true, name: "Cancel" })).toHaveCount(0);
  });

  test("creates a temporary app and shows it on the dashboard", async ({ page }, testInfo) => {
    test.slow();
    test.setTimeout(240_000);
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
      await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
      await signInIfNeeded(page, "/vault?dev");
      await createAppIfAvailable(page, repositoryName);
      createdRepository = true;

      const createdVaultCard = vaultCard(page, repositoryName);
      const failedVaultCard = setupFailedVaultCard(page, repositoryName);
      const creationResult = await waitForVaultCreationResult({
        createdVaultCard,
        failedVaultCard,
      });
      test.skip(
        creationResult === "setup-failed",
        "App creation is unavailable because provisioning failed in this environment.",
      );

      const repositoryLink = createdVaultCard.locator(
        `a[href^="https://github.com/"][href$="/${repositoryName}"]`,
      );

      await expect(repositoryLink).toBeVisible({ timeout: 120_000 });
      await expect(createdVaultCard.getByRole("button", { name: "Developer tools" })).toBeVisible({
        timeout: 120_000,
      });

      await testInfo.attach("created-repository-link", {
        body: (await repositoryLink.first().getAttribute("href")) ?? "",
        contentType: "text/plain",
      });
    } finally {
      // Exercise the same dashboard removal path operators use so the temporary
      // repo does not linger after the live test completes.
      if (createdRepository) {
        await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
        await signInIfNeeded(page, "/vault?dev");
        await removeTemporaryVault(page, repositoryName);
      }
    }
  });
});
