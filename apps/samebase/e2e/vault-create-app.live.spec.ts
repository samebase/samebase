import { expect, type Locator, type Page, test } from "@playwright/test";
import { z } from "zod";
import { parseRepositoryFullName } from "../shared/repoName";
import { signInIfNeeded } from "./liveHelpers";

const TEMP_RESOURCE_PREFIX = process.env.PLAYWRIGHT_TEMP_RESOURCE_PREFIX?.trim() || "tmp-e19d-live";
const EXISTING_REPOSITORY_FULL_NAME = process.env.PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME?.trim();
const APP_CREATION_INTENT = "app-create";
const APP_CREATION_TEST_TIMEOUT_MS = 120_000;
const APP_PROVISIONING_TIMEOUT_MS = 60_000;
const APP_CLEANUP_TIMEOUT_MS = 45_000;
const APP_DASHBOARD_TIMEOUT_MS = 15_000;

const setupSummarySchema = z.object({
  status: z.enum(["not_applicable", "ready", "running", "failed"]),
  step: z.string().optional(),
  message: z.string().optional(),
});
const providerPlanSchema = z
  .object({
    convex: z.object({
      state: z.enum(["planned", "creating", "created"]),
      projectName: z.string(),
      projectId: z.string().optional(),
    }),
    cloudflare: z.object({
      state: z.enum(["planned", "creating", "created"]),
      workerName: z.string(),
      workerTag: z.string().optional(),
    }),
  })
  .nullable();
const vaultContractSchema = z.object({
  repositoryFullName: z.string(),
  sourceSetup: setupSummarySchema,
  providerSetup: setupSummarySchema,
  providerPlan: providerPlanSchema,
  deletion: z.object({
    state: z.enum(["not_deleting", "deleting", "delete_failed"]),
    currentStep: z.string().optional(),
    message: z.string().optional(),
  }),
  isSamebaseManaged: z.boolean(),
  hasConnectedGitHubRepository: z.boolean(),
  hasConvexProvision: z.boolean(),
  hasCloudflareProvision: z.boolean(),
  canRemoveConvexProvision: z.boolean(),
  canRemoveCloudflareProvision: z.boolean(),
  cloudflareWorkers: z.array(
    z.object({
      workerName: z.string(),
      workerTag: z.string(),
    }),
  ),
  convexProjects: z.array(
    z.object({
      projectId: z.string(),
    }),
  ),
});
type VaultContract = z.infer<typeof vaultContractSchema>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTemporaryRepositoryName(): string {
  const worktreeId = process.env.PLAYWRIGHT_WORKTREE_ID?.trim();
  if (!worktreeId || !/^[a-z0-9]+$/.test(worktreeId)) {
    throw new Error("Set PLAYWRIGHT_WORKTREE_ID to the current lower-case worktree id.");
  }
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `tmp-${worktreeId}-${APP_CREATION_INTENT}-${Date.now()}-${randomSuffix}`;
}

function readTestGitHubOwner(): string {
  const owner = process.env.PLAYWRIGHT_TEST_GITHUB_OWNER?.trim();
  if (!owner || !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(owner)) {
    throw new Error(
      "Set PLAYWRIGHT_TEST_GITHUB_OWNER to the exact lower-case GitHub owner for test resources.",
    );
  }
  return owner;
}

function assertLocalLiveEnvironment(urlValue: string): void {
  const url = new URL(urlValue);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(
      "The app-creation contract test only writes through a loopback pnpm dev environment.",
    );
  }
}

function buildTemporaryResourceName(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${TEMP_RESOURCE_PREFIX}-${Date.now().toString(36)}-${randomSuffix}`;
}

function cloudflareWorkerActionName(action: string, workerName: string): RegExp {
  return new RegExp(
    `^${escapeRegExp(action)} for Cloudflare Worker .+/${escapeRegExp(workerName)}$`,
  );
}

function useConvexProjectActionName(workerName: string): RegExp {
  return new RegExp(
    `^Use .+ for Workers Builds for Cloudflare Worker .+/${escapeRegExp(workerName)}$`,
  );
}

function removeVaultControl(page: Page): Locator {
  return page.getByRole("button", { exact: true, name: "Remove vault" });
}

function vaultListLink(page: Page, repositoryFullName: string): Locator {
  return page
    .getByRole("navigation", { name: "Vaults" })
    .getByRole("link", {
      name: new RegExp(`^${escapeRegExp(repositoryFullName)}(?:, .+)?$`),
    })
    .first();
}

async function openVaultContractInspector(page: Page): Promise<Locator> {
  const summary = page.getByText("Vault contract", { exact: true });
  await expect(summary).toBeVisible({ timeout: APP_DASHBOARD_TIMEOUT_MS });

  const details = summary.locator("..");
  if ((await details.getAttribute("open")) === null) {
    await summary.click();
  }

  const output = details.locator("pre");
  await expect(output).toBeVisible();
  return output;
}

async function readVaultContract(output: Locator): Promise<VaultContract> {
  const text = await output.textContent();
  if (!text) {
    throw new Error("The Vault contract inspector did not contain JSON.");
  }

  const value: unknown = JSON.parse(text);
  return vaultContractSchema.parse(value);
}

function readProvisioningFailure(contract: VaultContract) {
  if (contract.sourceSetup.status === "failed") {
    if (!contract.sourceSetup.step || !contract.sourceSetup.message) {
      throw new Error("The failed source setup did not record its step and message.");
    }
    return {
      phase: "source",
      step: contract.sourceSetup.step,
      message: contract.sourceSetup.message,
    } as const;
  }
  if (contract.providerSetup.status === "failed") {
    if (!contract.providerSetup.step || !contract.providerSetup.message) {
      throw new Error("The failed provider setup did not record its step and message.");
    }
    return {
      phase: "provider",
      step: contract.providerSetup.step,
      message: contract.providerSetup.message,
    } as const;
  }
  return null;
}

function readActiveProvisioningStep(contract: VaultContract): string {
  if (contract.sourceSetup.status === "running") {
    return `source step ${contract.sourceSetup.step ?? "unknown"}`;
  }
  if (contract.providerSetup.status === "running") {
    return `provider step ${contract.providerSetup.step ?? "unknown"}`;
  }
  return `source ${contract.sourceSetup.status}, provider ${contract.providerSetup.status}`;
}

async function selectTemporaryVault(page: Page, repositoryFullName: string): Promise<void> {
  const link = vaultListLink(page, repositoryFullName);
  await expect(link).toBeVisible({ timeout: APP_DASHBOARD_TIMEOUT_MS });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/vault/${escapeRegExp(repositoryFullName)}(?:[?#]|$)`));
}

async function openVaultSettings(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Repository" })
    .getByRole("link", { exact: true, name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/vault\/[^/]+\/[^/]+\/settings(?:[?#]|$)/);
}

async function openOrganizationOnboardingRoute(
  page: Page,
  args: { linkName: "Connect repository" | "New app"; route: "connect-repo" | "new-app" },
): Promise<void> {
  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/vault?dev");

  const contextControl = page.getByTestId("organization-context-control");
  await contextControl.getByRole("button", { name: /Switch organization/ }).click();
  const organizationOption = page.getByRole("menuitem").nth(1);
  await expect(organizationOption).toBeVisible();
  await organizationOption.click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/vaults(?:[?#]|$)/);

  await page
    .getByRole("navigation", { name: "Organization" })
    .getByRole("link", { exact: true, name: args.linkName })
    .click();
  await expect(page).toHaveURL(new RegExp(`/org/[^/]+/${args.route}(?:[?#]|$)`));
}

async function connectExistingTemporaryRepository(
  page: Page,
  repositoryFullName: string,
): Promise<void> {
  await openOrganizationOnboardingRoute(page, {
    linkName: "Connect repository",
    route: "connect-repo",
  });

  await page.getByPlaceholder("Search repositories...").fill(repositoryFullName);
  const repositoryRow = page.locator("div").filter({ hasText: repositoryFullName }).first();
  await expect(repositoryRow).toBeVisible({ timeout: 60_000 });
  await repositoryRow.getByRole("button", { name: "Connect" }).click();
  await expect(page).toHaveURL(new RegExp(`/vault/${escapeRegExp(repositoryFullName)}(?:[?#]|$)`), {
    timeout: 60_000,
  });
}

async function createCloudflareWorkerFromSettings(page: Page, workerName: string): Promise<void> {
  await openVaultSettings(page);
  await page.getByRole("button", { name: "Add Cloudflare Worker" }).click();

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
    page.getByRole("button", {
      name: cloudflareWorkerActionName("Configure Workers Builds for GitHub", workerName),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: useConvexProjectActionName(workerName) }),
  ).toHaveCount(0);
}

async function configureWorkersBuildsForGitHub(page: Page, workerName: string): Promise<void> {
  await page
    .getByRole("button", {
      name: cloudflareWorkerActionName("Configure Workers Builds for GitHub", workerName),
    })
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

async function createConvexProjectFromSettings(
  page: Page,
  projectName: string,
  workerName: string,
): Promise<void> {
  await page.getByRole("button", { name: "Add Convex project" }).click();

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
    page.getByRole("button", { name: useConvexProjectActionName(workerName) }),
  ).toBeVisible();
}

async function setCloudflareConvexDeployKeys(page: Page, workerName: string): Promise<void> {
  await page.getByRole("button", { name: useConvexProjectActionName(workerName) }).click();
  await expect(
    page.getByText("Cloudflare does not have this Convex deployment's deploy keys."),
  ).toHaveCount(0, { timeout: 180_000 });
  await expect(
    page.getByRole("button", { name: useConvexProjectActionName(workerName) }),
  ).toHaveCount(0);
}

async function openNewAppWithProviderPreflight(page: Page, owner: string): Promise<Locator> {
  const route = `/org/${encodeURIComponent(owner)}/new-app?dev`;
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, route);
  await expect(page).toHaveURL(
    new RegExp(`/org/${escapeRegExp(encodeURIComponent(owner))}/new-app(?:[?#]|$)`),
  );
  assertLocalLiveEnvironment(page.url());

  const newAppPage = page.getByTestId("new-app-page");
  const repositoryNameInput = newAppPage.getByPlaceholder("GitHub repo name");
  await expect(repositoryNameInput).toBeVisible({ timeout: 15_000 });

  const providerReadiness = newAppPage.getByTestId("new-app-provider-readiness");
  await expect
    .poll(
      async () => {
        if (!(await repositoryNameInput.isDisabled())) {
          return "ready";
        }
        return (await providerReadiness.isVisible()) ? "blocked" : "loading";
      },
      {
        message: "Wait for the New App provider preflight to finish.",
        timeout: 30_000,
      },
    )
    .not.toBe("loading");

  const providerMessage = (await providerReadiness.textContent())?.trim();
  test.skip(
    await repositoryNameInput.isDisabled(),
    providerMessage
      ? `App creation provider setup is unavailable: ${providerMessage}`
      : "App creation provider setup is unavailable.",
  );

  const githubBlocker = newAppPage.getByText(/Authorize repository creation for/);
  const githubBlocked = await githubBlocker.isVisible();
  const githubBlockerMessage = githubBlocked ? (await githubBlocker.textContent())?.trim() : null;
  test.skip(
    githubBlocked,
    githubBlockerMessage
      ? `App creation provider setup is unavailable: ${githubBlockerMessage}`
      : "GitHub repository creation is unavailable.",
  );

  return newAppPage;
}

type VaultCleanupTargets = {
  cloudflareWorker: boolean;
  convexProject: boolean;
  githubRepository: boolean;
};

async function prepareVaultListForOwner(page: Page, owner: string): Promise<void> {
  await expect(page.getByLabel("Loading vaults", { exact: true }).first()).not.toBeVisible({
    timeout: APP_DASHBOARD_TIMEOUT_MS,
  });

  const navigation = page.getByRole("navigation", { name: "Vaults" }).first();
  await expect(navigation).toBeVisible();
  const ownerToggle = navigation.getByRole("button", { exact: true, name: owner });
  await expect(ownerToggle).toBeVisible();
  if ((await ownerToggle.getAttribute("aria-expanded")) !== "true") {
    await ownerToggle.click();
  }
  await expect(ownerToggle).toHaveAttribute("aria-expanded", "true");
}

async function readVaultRemovalState(
  page: Page,
  repositoryFullName: string,
): Promise<"absent" | "deleting" | "failed" | "loading"> {
  if (await page.getByLabel("Loading vaults", { exact: true }).first().isVisible()) {
    return "loading";
  }

  const owner = parseRepositoryFullName(repositoryFullName).owner;
  const navigation = page.getByRole("navigation", { name: "Vaults" }).first();
  const ownerToggle = navigation.getByRole("button", { exact: true, name: owner });
  if (!(await ownerToggle.isVisible().catch(() => false))) {
    return "loading";
  }
  if ((await ownerToggle.getAttribute("aria-expanded")) !== "true") {
    await ownerToggle.click();
    return "loading";
  }

  const link = vaultListLink(page, repositoryFullName);
  if ((await link.count()) === 0) {
    return "absent";
  }
  return (await link.getAttribute("data-vault-status")) === "Delete failed" ? "failed" : "deleting";
}

async function readVaultDeletionDetail(
  page: Page,
  repositoryFullName: string,
): Promise<string | null> {
  const owner = parseRepositoryFullName(repositoryFullName).owner;
  await prepareVaultListForOwner(page, owner);
  const link = vaultListLink(page, repositoryFullName);
  if ((await link.count()) === 0) {
    return null;
  }

  await selectTemporaryVault(page, repositoryFullName);
  const contract = await readVaultContract(await openVaultContractInspector(page));
  if (contract.deletion.state === "not_deleting") {
    return "the vault has no recorded deletion run";
  }
  return `${contract.deletion.currentStep ?? "unknown step"}: ${contract.deletion.message ?? "no error message"}`;
}

async function waitForVaultRemoval(page: Page, repositoryFullName: string): Promise<void> {
  const { name: repositoryName, owner } = parseRepositoryFullName(repositoryFullName);
  await prepareVaultListForOwner(page, owner);
  let consecutiveLoadedAbsences = 0;
  let terminalState: "failed" | "removed" | null = null;

  try {
    await expect
      .poll(
        async () => {
          const state = await readVaultRemovalState(page, repositoryFullName);
          if (state === "failed") {
            terminalState = "failed";
            return "terminal";
          }
          consecutiveLoadedAbsences = state === "absent" ? consecutiveLoadedAbsences + 1 : 0;
          if (consecutiveLoadedAbsences >= 2) {
            terminalState = "removed";
            return "terminal";
          }
          return "waiting";
        },
        {
          intervals: [1_000, 2_000, 5_000],
          message: `Wait for durable dashboard cleanup of ${repositoryName}.`,
          timeout: APP_CLEANUP_TIMEOUT_MS,
        },
      )
      .toBe("terminal");
  } catch (error) {
    const detail = await readVaultDeletionDetail(page, repositoryFullName);
    throw new Error(
      `Vault cleanup did not reach stable loaded absence${detail ? ` at ${detail}` : "."}`,
      { cause: error },
    );
  }

  if (terminalState === "removed") {
    return;
  }
  const detail = await readVaultDeletionDetail(page, repositoryFullName);
  throw new Error(`Vault cleanup failed at ${detail ?? "an unknown deletion step"}`);
}

async function removeTemporaryVault(
  page: Page,
  repositoryFullName: string,
  targets: VaultCleanupTargets,
): Promise<void> {
  await openVaultSettings(page);
  const removeControl = removeVaultControl(page);
  await expect(removeControl).toBeVisible({ timeout: APP_DASHBOARD_TIMEOUT_MS });
  await expect(removeControl).toBeEnabled();

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
    if (enabled) {
      await expect(
        cleanupCheckbox,
        `${label} must be available for fail-closed cleanup.`,
      ).toHaveCount(1);
      await expect(
        cleanupCheckbox,
        `${label} must be enabled for fail-closed cleanup.`,
      ).toBeEnabled();
    }
    if (
      (await cleanupCheckbox.count()) > 0 &&
      !(await cleanupCheckbox.isDisabled()) &&
      (await cleanupCheckbox.isChecked()) !== enabled
    ) {
      await cleanupCheckbox.click();
    }
  }

  await removeDialog.getByRole("button", { name: "Remove Vault" }).click();
  await expect(removeDialog).not.toBeVisible({ timeout: APP_DASHBOARD_TIMEOUT_MS });
  await expect(page).toHaveURL(/(?:\?|&)dev(?:[=&]|&|#|$)/);
  await expect(page).not.toHaveURL(/(?:\?|&)delete(?:&|#|$)/);
  await waitForVaultRemoval(page, repositoryFullName);
}

async function removeVaultIfPresent(
  page: Page,
  repositoryFullName: string,
  targets: VaultCleanupTargets,
): Promise<void> {
  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/vault?dev");

  await prepareVaultListForOwner(page, parseRepositoryFullName(repositoryFullName).owner);
  const link = vaultListLink(page, repositoryFullName);
  if (!(await link.isVisible().catch(() => false))) {
    return;
  }

  await selectTemporaryVault(page, repositoryFullName);
  await removeTemporaryVault(page, repositoryFullName, targets);
}

async function waitForVaultProvisioning(
  page: Page,
  repositoryFullName: string,
): Promise<VaultContract> {
  const link = vaultListLink(page, repositoryFullName);
  await expect(link).toBeVisible({ timeout: APP_DASHBOARD_TIMEOUT_MS });
  const contractOutput = await openVaultContractInspector(page);

  try {
    await expect
      .poll(
        async () => {
          const contract = await readVaultContract(contractOutput);
          const status = await link.getAttribute("data-vault-status");
          if (status === "Needs attention" || readProvisioningFailure(contract)) {
            return "failed";
          }
          if (
            contract.sourceSetup.status === "ready" &&
            contract.providerSetup.status === "ready"
          ) {
            return "ready";
          }
          return "running";
        },
        {
          intervals: [1_000, 2_000, 5_000],
          message: `Wait for the full app provisioning workflow for ${repositoryFullName}.`,
          timeout: APP_PROVISIONING_TIMEOUT_MS,
        },
      )
      .not.toBe("running");
  } catch (error) {
    const contract = await readVaultContract(contractOutput);
    const failure = readProvisioningFailure(contract);
    if (failure) {
      throw new Error(
        `App provisioning failed during ${failure.phase} step ${failure.step}: ${failure.message}`,
        { cause: error },
      );
    }
    throw new Error(
      `App provisioning did not finish. The last recorded state was ${readActiveProvisioningStep(contract)}.`,
      { cause: error },
    );
  }

  const contract = await readVaultContract(contractOutput);
  const status = await link.getAttribute("data-vault-status");
  const failure = readProvisioningFailure(contract);
  if (failure) {
    throw new Error(
      `App provisioning failed during ${failure.phase} step ${failure.step}: ${failure.message}`,
    );
  }
  if (status === "Needs attention") {
    throw new Error(
      `App provisioning reached Needs attention, but the Vault contract did not contain a failed step. The recorded state was ${readActiveProvisioningStep(contract)}.`,
    );
  }

  return contract;
}

function sourceSetupMayHaveCreatedRepository(contract: VaultContract): boolean {
  if (contract.hasConnectedGitHubRepository || contract.sourceSetup.status === "ready") {
    return true;
  }
  if (contract.sourceSetup.status === "not_applicable") {
    return false;
  }
  return !["run_created", "initialize_vault", "validate_connections"].includes(
    contract.sourceSetup.step ?? "unknown",
  );
}

async function readCreatedAppForCleanup(
  page: Page,
  repositoryFullName: string,
): Promise<VaultContract | null> {
  await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/vault?dev");

  const owner = parseRepositoryFullName(repositoryFullName).owner;
  await prepareVaultListForOwner(page, owner);
  const link = vaultListLink(page, repositoryFullName);
  const vaultExists = await link
    .waitFor({ state: "visible", timeout: APP_DASHBOARD_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!vaultExists) {
    return null;
  }

  await selectTemporaryVault(page, repositoryFullName);
  const contract = await readVaultContract(await openVaultContractInspector(page));
  if (contract.repositoryFullName !== repositoryFullName) {
    throw new Error(
      "Refusing cleanup because the selected vault owner and name do not match the test target.",
    );
  }
  if (!contract.isSamebaseManaged) {
    throw new Error("Refusing cleanup because the temporary vault is not Samebase-managed.");
  }
  return contract;
}

async function removeCreatedApp(
  page: Page,
  repositoryFullName: string,
  contract: VaultContract,
): Promise<void> {
  const githubMayExist = sourceSetupMayHaveCreatedRepository(contract);
  if (githubMayExist && !contract.hasConnectedGitHubRepository) {
    throw new Error(
      "The GitHub repository may exist, but the dashboard cannot confirm it for supported cleanup.",
    );
  }
  if (contract.hasConvexProvision && !contract.canRemoveConvexProvision) {
    throw new Error("The attached Convex project is not available for supported cleanup.");
  }
  if (contract.hasCloudflareProvision && !contract.canRemoveCloudflareProvision) {
    throw new Error("The attached Cloudflare Worker is not available for supported cleanup.");
  }
  const providerPlan = contract.providerPlan;
  if (
    providerPlan &&
    providerPlan.convex.state !== "planned" &&
    !contract.canRemoveConvexProvision
  ) {
    throw new Error(
      "Convex provisioning may have created a project, but the dashboard cannot remove it.",
    );
  }
  if (
    providerPlan &&
    providerPlan.cloudflare.state !== "planned" &&
    !contract.canRemoveCloudflareProvision
  ) {
    throw new Error(
      "Cloudflare provisioning may have created a Worker, but the dashboard cannot remove it.",
    );
  }

  await removeTemporaryVault(page, repositoryFullName, {
    cloudflareWorker: contract.canRemoveCloudflareProvision,
    convexProject: contract.canRemoveConvexProvision,
    githubRepository: githubMayExist,
  });
}

test.describe("vault create app live flow", () => {
  test("shows the new app form without a cancel control", async ({ page }) => {
    await openOrganizationOnboardingRoute(page, { linkName: "New app", route: "new-app" });

    const newAppPage = page.getByTestId("new-app-page");
    await expect(newAppPage).toBeVisible();
    await expect(newAppPage.getByRole("button", { name: "New App" })).toBeVisible();
    await expect(newAppPage.getByRole("button", { exact: true, name: "Cancel" })).toHaveCount(0);
    await expect(newAppPage.getByRole("link", { exact: true, name: "Cancel" })).toHaveCount(0);
  });

  test("creates and fully provisions a temporary app, then removes its resources", async ({
    page,
  }, testInfo) => {
    test.setTimeout(APP_CREATION_TEST_TIMEOUT_MS);
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "This live test mutates external state, so it runs once on the desktop project.",
    );

    const configuredBaseUrl = testInfo.project.use.baseURL;
    if (typeof configuredBaseUrl !== "string") {
      throw new Error("The app-creation contract test requires a configured Playwright base URL.");
    }
    assertLocalLiveEnvironment(configuredBaseUrl);

    const testOwner = readTestGitHubOwner();
    const repositoryName = buildTemporaryRepositoryName();
    const repositoryFullName = `${testOwner}/${repositoryName}`;

    await testInfo.attach("temporary-repository-name", {
      body: repositoryFullName,
      contentType: "text/plain",
    });

    const newAppPage = await openNewAppWithProviderPreflight(page, testOwner);
    const repositoryNameInput = newAppPage.getByPlaceholder("GitHub repo name");
    const createButton = newAppPage.getByRole("button", { exact: true, name: "New App" });
    await expect
      .poll(
        async () => {
          if ((await repositoryNameInput.inputValue()) !== repositoryName) {
            await repositoryNameInput.fill(repositoryName);
          }
          return (await createButton.isEnabled()) ? repositoryNameInput.inputValue() : null;
        },
        {
          message: "Wait for the exact temporary names to pass provider availability checks.",
          timeout: 30_000,
        },
      )
      .toBe(repositoryName);
    await expect(repositoryNameInput).toHaveValue(repositoryName);
    const expectedConvexProjectName = await newAppPage
      .getByPlaceholder("Convex project name")
      .inputValue();
    const expectedCloudflareWorkerName = await newAppPage
      .getByPlaceholder("Cloudflare Worker name")
      .inputValue();

    await testInfo.attach("temporary-provider-resource-names", {
      body: JSON.stringify(
        {
          cloudflareWorker: expectedCloudflareWorkerName,
          convexProject: expectedConvexProjectName,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });

    let creationStarted = false;
    let productFailure: unknown = null;
    try {
      creationStarted = true;
      await createButton.click();

      try {
        await expect(page).toHaveURL(
          new RegExp(`/vault/${escapeRegExp(repositoryFullName)}(?:[?#]|$)`),
          { timeout: 30_000 },
        );
      } catch (error) {
        const createErrors = await page.locator(".text-red-600").allTextContents();
        const createError = createErrors.at(-1)?.trim();
        if (createError) {
          throw new Error(`App creation failed after submit: ${createError}`, { cause: error });
        }
        throw error;
      }

      await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
      await signInIfNeeded(page, "/vault?dev");
      await selectTemporaryVault(page, repositoryFullName);

      const contract = await waitForVaultProvisioning(page, repositoryFullName);
      expect(contract.repositoryFullName).toBe(repositoryFullName);
      expect(contract.sourceSetup).toEqual({ status: "ready" });
      expect(contract.providerSetup).toEqual({ status: "ready" });
      expect(contract.isSamebaseManaged).toBe(true);
      expect(contract.hasConnectedGitHubRepository).toBe(true);
      expect(contract.hasConvexProvision).toBe(true);
      expect(contract.hasCloudflareProvision).toBe(true);
      expect(contract.canRemoveConvexProvision).toBe(true);
      expect(contract.canRemoveCloudflareProvision).toBe(true);

      const providerPlan = contract.providerPlan;
      if (!providerPlan) {
        throw new Error("Successful app provisioning did not retain its provider plan.");
      }
      if (providerPlan.convex.state !== "created") {
        throw new Error(
          `Convex provisioning ended with provider plan state ${providerPlan.convex.state}.`,
        );
      }
      if (!providerPlan.convex.projectId) {
        throw new Error("Successful Convex provisioning did not record its project id.");
      }
      if (providerPlan.cloudflare.state !== "created") {
        throw new Error(
          `Cloudflare provisioning ended with provider plan state ${providerPlan.cloudflare.state}.`,
        );
      }
      if (!providerPlan.cloudflare.workerTag) {
        throw new Error("Successful Cloudflare provisioning did not record its Worker tag.");
      }
      expect(providerPlan.convex.projectName).toBe(expectedConvexProjectName);
      expect(providerPlan.cloudflare.workerName).toBe(expectedCloudflareWorkerName);
      expect(contract.convexProjects).toEqual([{ projectId: providerPlan.convex.projectId }]);
      expect(contract.cloudflareWorkers).toEqual([
        {
          workerName: expectedCloudflareWorkerName,
          workerTag: providerPlan.cloudflare.workerTag,
        },
      ]);

      const vaultLink = vaultListLink(page, repositoryFullName);
      await expect(vaultLink).not.toHaveAttribute(
        "data-vault-status",
        /^(?:Needs attention|Setting up)$/,
      );

      const repositoryLink = page.getByRole("link", {
        name: `Open ${repositoryFullName} on GitHub`,
      });

      await expect(repositoryLink).toBeVisible({ timeout: APP_DASHBOARD_TIMEOUT_MS });

      await testInfo.attach("created-repository-link", {
        body: (await repositoryLink.first().getAttribute("href")) ?? "",
        contentType: "text/plain",
      });
    } catch (error) {
      productFailure = error;
    }

    let cleanupFailure: unknown = null;
    if (creationStarted) {
      try {
        const cleanupContract = await readCreatedAppForCleanup(page, repositoryFullName);
        if (!cleanupContract) {
          throw new Error(
            "The submit started, but the dashboard did not expose the test vault for supported cleanup.",
          );
        }
        const recordedFailure = readProvisioningFailure(cleanupContract);
        if (recordedFailure) {
          productFailure = new Error(
            `App provisioning failed during ${recordedFailure.phase} step ${recordedFailure.step}: ${recordedFailure.message}`,
            productFailure === null ? undefined : { cause: productFailure },
          );
        }
        await removeCreatedApp(page, repositoryFullName, cleanupContract);
      } catch (error) {
        cleanupFailure = error;
      }
    }

    if (productFailure !== null && cleanupFailure !== null) {
      const productMessage =
        productFailure instanceof Error
          ? productFailure.message
          : typeof productFailure === "string"
            ? productFailure
            : "Unknown app creation failure.";
      const cleanupMessage =
        cleanupFailure instanceof Error
          ? cleanupFailure.message
          : typeof cleanupFailure === "string"
            ? cleanupFailure
            : "Unknown dashboard cleanup failure.";
      throw new Error(
        `App creation failed: ${productMessage}\nFail-closed dashboard cleanup also failed: ${cleanupMessage}`,
        { cause: productFailure },
      );
    }
    if (cleanupFailure !== null) {
      throw cleanupFailure;
    }
    if (productFailure !== null) {
      throw productFailure;
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
      await removeVaultIfPresent(page, EXISTING_REPOSITORY_FULL_NAME, cleanupTargets);
      await connectExistingTemporaryRepository(page, EXISTING_REPOSITORY_FULL_NAME);
      vaultConnected = true;
      await selectTemporaryVault(page, EXISTING_REPOSITORY_FULL_NAME);

      await createCloudflareWorkerFromSettings(page, resourceName);
      await configureWorkersBuildsForGitHub(page, resourceName);
      await createConvexProjectFromSettings(page, resourceName, resourceName);
      await setCloudflareConvexDeployKeys(page, resourceName);
    } finally {
      if (vaultConnected) {
        await page.goto("/vault?dev", { waitUntil: "domcontentloaded" });
        await signInIfNeeded(page, "/vault?dev");
        await selectTemporaryVault(page, EXISTING_REPOSITORY_FULL_NAME);
        await removeTemporaryVault(page, EXISTING_REPOSITORY_FULL_NAME, cleanupTargets);
      }
    }
  });
});
