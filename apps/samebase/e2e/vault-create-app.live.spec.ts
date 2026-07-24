import { expect, type Locator, type Page, test } from "@playwright/test";
import { parseRepositoryFullName } from "../shared/repoName";
import { signInIfNeeded } from "./liveHelpers";

// Worktree runs can override this so the temporary repo prefix follows the
// repo's tmp-<worktree-id>-<intent> convention without hard-coding one value.
const TEMP_REPOSITORY_PREFIX =
  process.env.PLAYWRIGHT_TEMP_REPO_PREFIX?.trim() || "tmp-e19d-create-stack";
const TEMP_RESOURCE_PREFIX = process.env.PLAYWRIGHT_TEMP_RESOURCE_PREFIX?.trim() || "tmp-e19d-live";
const EXISTING_REPOSITORY_FULL_NAME = process.env.PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME?.trim();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTemporaryRepositoryName(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${TEMP_REPOSITORY_PREFIX}-${Date.now()}-${randomSuffix}`;
}

function buildTemporaryResourceName(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${TEMP_RESOURCE_PREFIX}-${Date.now().toString(36)}-${randomSuffix}`;
}

function getRepositoryName(repositoryFullName: string): string {
  return parseRepositoryFullName(repositoryFullName).name;
}

function removeVaultControl(page: Page, repoName: string): Locator {
  return page.getByRole("link", {
    name: new RegExp(`^Remove vault .*/${escapeRegExp(repoName)}$`),
  });
}

function vaultCard(page: Page, repoName: string): Locator {
  return page
    .locator("[data-vault-dashboard-repository-card]")
    .filter({ hasText: new RegExp(`\\b${escapeRegExp(repoName)}\\b`) })
    .first();
}

function setupFailedVaultCard(page: Page, repoName: string): Locator {
  return page
    .locator("[data-vault-dashboard-repository-card]")
    .filter({ hasText: new RegExp(`\\b${escapeRegExp(repoName)}\\b[\\s\\S]*\\(setup failed\\)`) })
    .first();
}

function vaultListLink(page: Page, repoName: string): Locator {
  return page
    .getByRole("navigation", { name: "Vaults" })
    .getByRole("link", {
      name: new RegExp(`^[^/]+/${escapeRegExp(repoName)}$`),
    })
    .first();
}

async function selectTemporaryVault(page: Page, repoName: string): Promise<void> {
  const link = vaultListLink(page, repoName);
  await expect(link).toBeVisible({ timeout: 120_000 });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/vault/[^/]+/${escapeRegExp(repoName)}(?:[?#]|$)`));
}

async function connectExistingTemporaryRepository(
  page: Page,
  repositoryFullName: string,
): Promise<void> {
  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/vault?dev");
  await page.goto("/connect-repo?dev", { waitUntil: "domcontentloaded" });

  await page.getByPlaceholder("Search repositories...").fill(repositoryFullName);
  const repositoryRow = page.locator("div").filter({ hasText: repositoryFullName }).first();
  await expect(repositoryRow).toBeVisible({ timeout: 60_000 });
  await repositoryRow.getByRole("button", { name: "Connect" }).click();
  await expect(page).toHaveURL(new RegExp(`/vault/${escapeRegExp(repositoryFullName)}(?:[?#]|$)`), {
    timeout: 60_000,
  });
}

async function createCloudflareWorkerFromDashboard(page: Page, workerName: string): Promise<void> {
  await page.getByRole("link", { name: "Add Cloudflare" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Create" }).click();
  await dialog.getByPlaceholder("Worker name").fill(workerName);
  await expect(dialog.getByPlaceholder("Worker name")).toHaveValue(workerName, {
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Create Worker" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 120_000 });

  await expect(
    page.getByText("Cloudflare is not connected to this GitHub repository."),
  ).toBeVisible({ timeout: 120_000 });
  await expect(
    page.getByRole("button", { name: "Configure Workers Builds for GitHub Cloudflare" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Use Convex project .* for Workers Builds/ }),
  ).toHaveCount(0);
}

async function configureWorkersBuildsForGitHub(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Configure Workers Builds for GitHub Cloudflare" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("textbox", { name: "Repository root" }).fill("/");
  await dialog.getByRole("button", { name: "Configure Workers Builds" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 180_000 });
  await expect(
    page.getByText("Cloudflare is not connected to this GitHub repository."),
  ).toHaveCount(0, { timeout: 180_000 });
}

async function createConvexProjectFromDashboard(page: Page, projectName: string): Promise<void> {
  await page.getByRole("link", { name: "Add Convex" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Create" }).click();
  await dialog.getByPlaceholder("Project name").fill(projectName);
  await expect(dialog.getByPlaceholder("Project name")).toHaveValue(projectName, {
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Create Project" }).click();
  const dialogError = dialog.locator(".text-red-600").last();
  const maybeDialogError = await Promise.race([
    dialog.waitFor({ state: "hidden", timeout: 180_000 }).then(() => null),
    dialogError
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(async () => (await dialogError.textContent())?.trim() || "Could not create project.")
      .catch(() => new Promise<never>(() => {})),
  ]);
  if (maybeDialogError) {
    throw new Error(maybeDialogError);
  }

  await expect(
    page.getByText("Cloudflare does not have this Convex deployment's deploy keys."),
  ).toBeVisible({ timeout: 180_000 });
  await expect(
    page.getByRole("button", { name: /Use Convex project .* for Workers Builds/ }),
  ).toBeVisible();
}

async function setCloudflareConvexDeployKeys(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Use Convex project .* for Workers Builds/ }).click();
  await expect(
    page.getByText("Cloudflare does not have this Convex deployment's deploy keys."),
  ).toHaveCount(0, { timeout: 180_000 });
  await expect(
    page.getByRole("button", { name: /Use Convex project .* for Workers Builds/ }),
  ).toHaveCount(0);
}

async function createAppIfAvailable(page: Page, repoName: string): Promise<void> {
  await page.getByRole("button", { name: "New App" }).click();
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
    await expect(page).toHaveURL(new RegExp(`/vault/[^/]+/${escapeRegExp(repoName)}(?:[?#]|$)`), {
      timeout: 30_000,
    });
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

type VaultCleanupTargets = {
  cloudflareWorker: boolean;
  convexProject: boolean;
  githubRepository: boolean;
};

async function removeTemporaryVault(
  page: Page,
  repoName: string,
  targets: VaultCleanupTargets,
): Promise<void> {
  const removeControl = removeVaultControl(page, repoName);
  await expect(removeControl).toBeVisible({ timeout: 120_000 });

  await removeControl.click();

  const removeDialog = page.getByRole("dialog");
  await expect(removeDialog).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/(?:\?|&)delete(?:&|#|$)/);

  const cleanupCheckboxTargets = [
    {
      enabled: targets.githubRepository,
      label: "Also remove GitHub repository",
    },
    {
      enabled: targets.convexProject,
      label: "Also remove Convex project/deployment",
    },
    {
      enabled: targets.cloudflareWorker,
      label: "Also remove Cloudflare Worker",
    },
  ];
  for (const { enabled, label } of cleanupCheckboxTargets) {
    const cleanupCheckbox = removeDialog.getByRole("checkbox", {
      name: label,
    });
    if ((await cleanupCheckbox.count()) > 0 && !(await cleanupCheckbox.isDisabled())) {
      if ((await cleanupCheckbox.isChecked()) !== enabled) {
        await cleanupCheckbox.click();
      }
    }
  }

  await removeDialog.getByRole("button", { name: "Remove Vault" }).click();
  await expect(removeDialog).not.toBeVisible({ timeout: 120_000 });
  await expect(page).toHaveURL(/(?:\?|&)dev(?:[=&]|&|#|$)/);
  await expect(page).not.toHaveURL(/(?:\?|&)delete(?:&|#|$)/);
  await expect(removeControl).toHaveCount(0, { timeout: 120_000 });
}

async function removeVaultIfPresent(
  page: Page,
  repoName: string,
  targets: VaultCleanupTargets,
): Promise<void> {
  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/vault?dev");

  const link = vaultListLink(page, repoName);
  if (!(await link.isVisible().catch(() => false))) {
    return;
  }

  await selectTemporaryVault(page, repoName);
  await removeTemporaryVault(page, repoName, targets);
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
      await selectTemporaryVault(page, repositoryName);

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
        await selectTemporaryVault(page, repositoryName);
        await removeTemporaryVault(page, repositoryName, {
          cloudflareWorker: true,
          convexProject: true,
          githubRepository: true,
        });
      }
    }
  });

  test("connects an existing repository and wires Cloudflare plus Convex through dashboard actions", async ({
    page,
  }, testInfo) => {
    test.slow();
    test.setTimeout(600_000);
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "This live test mutates external state, so it runs once on the desktop project.",
    );
    test.skip(
      EXISTING_REPOSITORY_FULL_NAME === undefined,
      "Set PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME to a disposable or safe existing repo.",
    );
    if (EXISTING_REPOSITORY_FULL_NAME === undefined) {
      throw new Error("PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME is required for this live test.");
    }

    const repositoryName = getRepositoryName(EXISTING_REPOSITORY_FULL_NAME);
    const resourceName = buildTemporaryResourceName();
    let vaultConnected = false;
    const cleanupTargets = {
      cloudflareWorker: true,
      convexProject: true,
      githubRepository: false,
    };

    await testInfo.attach("existing-repository-full-name", {
      body: EXISTING_REPOSITORY_FULL_NAME,
      contentType: "text/plain",
    });
    await testInfo.attach("temporary-resource-name", {
      body: resourceName,
      contentType: "text/plain",
    });

    try {
      await removeVaultIfPresent(page, repositoryName, cleanupTargets);
      await connectExistingTemporaryRepository(page, EXISTING_REPOSITORY_FULL_NAME);
      vaultConnected = true;
      await selectTemporaryVault(page, repositoryName);

      await createCloudflareWorkerFromDashboard(page, resourceName);
      await configureWorkersBuildsForGitHub(page);
      await createConvexProjectFromDashboard(page, resourceName);
      await setCloudflareConvexDeployKeys(page);
    } finally {
      if (vaultConnected) {
        await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
        await signInIfNeeded(page, "/vault?dev");
        await selectTemporaryVault(page, repositoryName);
        await removeTemporaryVault(page, repositoryName, cleanupTargets);
      }
    }
  });
});
