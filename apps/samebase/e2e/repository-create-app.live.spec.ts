import { expect, type Locator, type Page, test as base } from "@playwright/test";
import { z } from "zod";
import { parseGitHubRepositoryFullName } from "../shared/githubRepositoryName";
import { signInIfNeeded } from "./liveHelpers";

const TEMP_RESOURCE_PREFIX = process.env.PLAYWRIGHT_TEMP_RESOURCE_PREFIX?.trim() || "tmp-e19d-live";
const EXISTING_REPOSITORY_FULL_NAME = process.env.PLAYWRIGHT_EXISTING_REPOSITORY_FULL_NAME?.trim();
const APP_CREATION_INTENT = "app-create";
const APP_PREFLIGHT_PHASE_TIMEOUT_MS = 90_000;
// The submit, provisioning, and fixture teardown phases have separate deadlines. After submit,
// their budgets total two minutes, and a product timeout cannot cancel provider cleanup.
const APP_SUBMIT_PHASE_TIMEOUT_MS = 15_000;
const APP_PROVISIONING_PHASE_TIMEOUT_MS = 60_000;
const APP_CLEANUP_FIXTURE_TIMEOUT_MS = 45_000;
const APP_CLEANUP_WORKFLOW_TIMEOUT_MS = 25_000;
const APP_DASHBOARD_TIMEOUT_MS = 15_000;
const APP_PHASE_DIAGNOSTIC_RESERVE_MS = 5_000;
const APP_DIAGNOSTIC_TIMEOUT_MS = 4_000;
const APP_CLEANUP_TARGET_TIMEOUT_MS = 5_000;
const TEST_CONVEX_TEAM_ID = "522530";
const TEST_CONVEX_TEAM_SLUG = "samebase-live-tests";
const TEST_CONVEX_DEPLOYMENT_REGION = "aws-us-east-1";
const TEST_CLOUDFLARE_ACCOUNT_ID = "a9dfbbd031cf9eda46831def8e468b4e";

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
      deploymentRegion: z.enum(["aws-us-east-1", "aws-eu-west-1"]),
      projectId: z.string().optional(),
    }),
    cloudflare: z.object({
      state: z.enum(["planned", "creating", "created"]),
      workerName: z.string(),
      workerTag: z.string().optional(),
    }),
  })
  .nullable();
const repositoryContractSchema = z.object({
  githubRepositoryFullName: z.string(),
  convexTeamId: z.string(),
  cloudflareAccountId: z.string(),
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
      accountId: z.string(),
      workerName: z.string(),
      workerTag: z.string(),
    }),
  ),
  convexProjects: z.array(
    z.object({
      teamId: z.string(),
      projectId: z.string(),
    }),
  ),
});
type RepositoryContract = z.infer<typeof repositoryContractSchema>;

type OperationDeadline = {
  at: number;
  label: string;
};

function startOperationDeadline(label: string, phaseTimeout: number): OperationDeadline {
  return {
    at: Date.now() + phaseTimeout - APP_PHASE_DIAGNOSTIC_RESERVE_MS,
    label,
  };
}

function startDiagnosticDeadline(label: string): OperationDeadline {
  return { at: Date.now() + APP_DIAGNOSTIC_TIMEOUT_MS, label };
}

function operationTimeout(
  deadline: OperationDeadline | undefined,
  maximum: number = APP_DASHBOARD_TIMEOUT_MS,
): number {
  if (!deadline) {
    return maximum;
  }

  const remaining = deadline.at - Date.now();
  if (remaining <= 0) {
    throw new Error(`${deadline.label} exceeded its operation deadline.`);
  }
  return Math.min(remaining, maximum);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTemporaryRepositoryName(): string {
  const worktreeId = process.env.PLAYWRIGHT_WORKTREE_ID?.trim();
  if (!worktreeId || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(worktreeId)) {
    throw new Error(
      "Set PLAYWRIGHT_WORKTREE_ID to the current lower-case worktree id. Internal hyphens are allowed.",
    );
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

function removeRepositoryControl(page: Page): Locator {
  return page.getByRole("button", { exact: true, name: "Remove from Samebase" });
}

function repositoryListLink(page: Page, githubRepositoryFullName: string): Locator {
  return page
    .getByRole("navigation", { name: "Repositories" })
    .getByRole("link", {
      name: new RegExp(`^${escapeRegExp(githubRepositoryFullName)}(?:, .+)?$`),
    })
    .first();
}

async function openRepositoryContractInspector(
  page: Page,
  deadline?: OperationDeadline,
): Promise<Locator> {
  await openRepositorySettings(page, deadline);
  const summary = page.getByText("Repository contract", { exact: true });
  await expect(summary).toBeVisible({ timeout: operationTimeout(deadline) });

  const details = summary.locator("..");
  if ((await details.getAttribute("open", { timeout: operationTimeout(deadline) })) === null) {
    await summary.click({ timeout: operationTimeout(deadline) });
  }

  const output = details.locator("pre");
  await expect(output).toBeVisible({ timeout: operationTimeout(deadline) });
  return output;
}

async function readRepositoryContract(
  output: Locator,
  deadline?: OperationDeadline,
): Promise<RepositoryContract> {
  const text = await output.textContent({ timeout: operationTimeout(deadline) });
  if (!text) {
    throw new Error("The Repository contract inspector did not contain JSON.");
  }

  const value: unknown = JSON.parse(text);
  return repositoryContractSchema.parse(value);
}

function readProvisioningFailure(contract: RepositoryContract) {
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

function readActiveProvisioningStep(contract: RepositoryContract): string {
  if (contract.sourceSetup.status === "running") {
    return `source step ${contract.sourceSetup.step ?? "unknown"}`;
  }
  if (contract.providerSetup.status === "running") {
    return `provider step ${contract.providerSetup.step ?? "unknown"}`;
  }
  return `source ${contract.sourceSetup.status}, provider ${contract.providerSetup.status}`;
}

async function selectTemporaryRepository(
  page: Page,
  githubRepositoryFullName: string,
  deadline?: OperationDeadline,
): Promise<void> {
  const link = repositoryListLink(page, githubRepositoryFullName);
  await expect(link).toBeVisible({ timeout: operationTimeout(deadline) });
  await link.click({ timeout: operationTimeout(deadline) });
  await expect(page).toHaveURL(
    new RegExp(`/repo/${escapeRegExp(githubRepositoryFullName)}(?:[?#]|$)`),
    {
      timeout: operationTimeout(deadline),
    },
  );
}

async function openRepositorySettings(page: Page, deadline?: OperationDeadline): Promise<void> {
  const settingsUrl = /\/repo\/[^/]+\/[^/]+\/settings(?:[?#]|$)/;
  if (!settingsUrl.test(page.url())) {
    await page
      .getByRole("navigation", { name: "Repository" })
      .getByRole("link", { exact: true, name: "Settings" })
      .click({ timeout: operationTimeout(deadline) });
  }
  await expect(page).toHaveURL(settingsUrl, { timeout: operationTimeout(deadline) });
}

async function openOrganizationOnboardingRoute(
  page: Page,
  args: { linkName: "Connect repository" | "New app"; route: "connect-repo" | "new-app" },
): Promise<void> {
  await page.goto("/repo?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/repo?dev");

  const contextControl = page.getByTestId("organization-context-control");
  await contextControl.getByRole("button", { name: /Switch organization/ }).click();
  const organizationOption = page.getByRole("menuitem").nth(1);
  await expect(organizationOption).toBeVisible();
  await organizationOption.click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/repositories(?:[?#]|$)/);

  await page
    .getByRole("navigation", { name: "Organization" })
    .getByRole("link", { exact: true, name: args.linkName })
    .click();
  await expect(page).toHaveURL(new RegExp(`/org/[^/]+/${args.route}(?:[?#]|$)`));
}

async function connectExistingTemporaryRepository(
  page: Page,
  githubRepositoryFullName: string,
): Promise<void> {
  await openOrganizationOnboardingRoute(page, {
    linkName: "Connect repository",
    route: "connect-repo",
  });

  await page.getByPlaceholder("Search repositories...").fill(githubRepositoryFullName);
  const repositoryRow = page.locator("div").filter({ hasText: githubRepositoryFullName }).first();
  await expect(repositoryRow).toBeVisible({ timeout: 60_000 });
  await repositoryRow.getByRole("button", { name: "Connect" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/repo/${escapeRegExp(githubRepositoryFullName)}(?:[?#]|$)`),
    {
      timeout: 60_000,
    },
  );
}

async function createCloudflareWorkerFromSettings(page: Page, workerName: string): Promise<void> {
  await openRepositorySettings(page);
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
  await dialog.getByRole("combobox", { name: "Convex production region" }).click();
  await page.getByRole("option", { exact: true, name: "🇺🇸 US East (N. Virginia)" }).click();
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

  await expect(providerReadiness).toContainText(`Connected to team ${TEST_CONVEX_TEAM_SLUG}.`);
  await expect(providerReadiness).toContainText(
    `Connected to account ${TEST_CLOUDFLARE_ACCOUNT_ID}.`,
  );

  return newAppPage;
}

type RepositoryCleanupTargets = {
  cloudflareWorker: boolean;
  convexProject: boolean;
  githubRepository: boolean;
};

async function prepareRepositoryListForOwner(
  page: Page,
  owner: string,
  deadline?: OperationDeadline,
): Promise<void> {
  await expect(page.getByLabel("Loading repositories", { exact: true }).first()).not.toBeVisible({
    timeout: operationTimeout(deadline),
  });

  const navigation = page.getByRole("navigation", { name: "Repositories" }).first();
  await expect(navigation).toBeVisible({ timeout: operationTimeout(deadline) });
  const ownerToggle = navigation.getByRole("button", { exact: true, name: owner });
  await expect(ownerToggle).toBeVisible({ timeout: operationTimeout(deadline) });
  if (
    (await ownerToggle.getAttribute("aria-expanded", { timeout: operationTimeout(deadline) })) !==
    "true"
  ) {
    await ownerToggle.click({ timeout: operationTimeout(deadline) });
  }
  await expect(ownerToggle).toHaveAttribute("aria-expanded", "true", {
    timeout: operationTimeout(deadline),
  });
}

async function readRepositoryRemovalState(
  page: Page,
  githubRepositoryFullName: string,
  deadline?: OperationDeadline,
): Promise<"absent" | "deleting" | "failed" | "loading"> {
  if (await page.getByLabel("Loading repositories", { exact: true }).first().isVisible()) {
    return "loading";
  }

  const owner = parseGitHubRepositoryFullName(githubRepositoryFullName).owner;
  const navigation = page.getByRole("navigation", { name: "Repositories" }).first();
  const ownerToggle = navigation.getByRole("button", { exact: true, name: owner });
  if (!(await ownerToggle.isVisible().catch(() => false))) {
    return "loading";
  }
  if (
    (await ownerToggle.getAttribute("aria-expanded", { timeout: operationTimeout(deadline) })) !==
    "true"
  ) {
    await ownerToggle.click({ timeout: operationTimeout(deadline) });
    return "loading";
  }

  const link = repositoryListLink(page, githubRepositoryFullName);
  if ((await link.count()) === 0) {
    return "absent";
  }
  return (await link.getAttribute("data-repository-status", {
    timeout: operationTimeout(deadline),
  })) === "Delete failed"
    ? "failed"
    : "deleting";
}

async function readRepositoryDeletionDetail(
  page: Page,
  githubRepositoryFullName: string,
  deadline?: OperationDeadline,
): Promise<string | null> {
  const owner = parseGitHubRepositoryFullName(githubRepositoryFullName).owner;
  await prepareRepositoryListForOwner(page, owner, deadline);
  const link = repositoryListLink(page, githubRepositoryFullName);
  if ((await link.count()) === 0) {
    return null;
  }

  await selectTemporaryRepository(page, githubRepositoryFullName, deadline);
  const contract = await readRepositoryContract(
    await openRepositoryContractInspector(page, deadline),
    deadline,
  );
  if (contract.deletion.state === "not_deleting") {
    return "the repository has no recorded deletion run";
  }
  return `${contract.deletion.currentStep ?? "unknown step"}: ${contract.deletion.message ?? "no error message"}`;
}

async function waitForRepositoryRemoval(
  page: Page,
  githubRepositoryFullName: string,
  deadline?: OperationDeadline,
): Promise<void> {
  const { name: repositoryName, owner } = parseGitHubRepositoryFullName(githubRepositoryFullName);
  await prepareRepositoryListForOwner(page, owner, deadline);
  let consecutiveLoadedAbsences = 0;
  let terminalState: "failed" | "removed" | null = null;

  try {
    await expect
      .poll(
        async () => {
          const state = await readRepositoryRemovalState(page, githubRepositoryFullName, deadline);
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
          timeout: operationTimeout(deadline, APP_CLEANUP_WORKFLOW_TIMEOUT_MS),
        },
      )
      .toBe("terminal");
  } catch (error) {
    const detail = await readRepositoryDeletionDetail(
      page,
      githubRepositoryFullName,
      deadline ? startDiagnosticDeadline("Repository cleanup diagnostics") : undefined,
    ).catch(() => null);
    throw new Error(
      `Repository cleanup did not reach stable loaded absence${detail ? ` at ${detail}` : "."}`,
      { cause: error },
    );
  }

  if (terminalState === "removed") {
    return;
  }
  const detail = await readRepositoryDeletionDetail(
    page,
    githubRepositoryFullName,
    deadline ? startDiagnosticDeadline("Repository cleanup diagnostics") : undefined,
  ).catch(() => null);
  throw new Error(`Repository cleanup failed at ${detail ?? "an unknown deletion step"}`);
}

async function removeTemporaryRepository(
  page: Page,
  githubRepositoryFullName: string,
  targets: RepositoryCleanupTargets,
  deadline?: OperationDeadline,
): Promise<void> {
  await openRepositorySettings(page, deadline);
  const removeControl = removeRepositoryControl(page);
  await expect(removeControl).toBeVisible({ timeout: operationTimeout(deadline) });
  await expect(removeControl).toBeEnabled({ timeout: operationTimeout(deadline) });

  await removeControl.click({ timeout: operationTimeout(deadline) });

  const removeDialog = page.getByRole("dialog");
  await expect(removeDialog).toBeVisible({ timeout: operationTimeout(deadline) });
  await expect(page).toHaveURL(/(?:\?|&)delete(?:&|#|$)/, {
    timeout: operationTimeout(deadline),
  });

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
      ).toHaveCount(1, { timeout: operationTimeout(deadline) });
      await expect(
        cleanupCheckbox,
        `${label} must be enabled for fail-closed cleanup.`,
      ).toBeEnabled({ timeout: operationTimeout(deadline) });
    }
    if (
      (await cleanupCheckbox.count()) > 0 &&
      !(await cleanupCheckbox.isDisabled()) &&
      (await cleanupCheckbox.isChecked()) !== enabled
    ) {
      await cleanupCheckbox.click({ timeout: operationTimeout(deadline) });
    }
  }

  await removeDialog
    .getByRole("button", { name: "Remove from Samebase" })
    .click({ timeout: operationTimeout(deadline) });
  await expect(removeDialog).not.toBeVisible({ timeout: operationTimeout(deadline) });
  await expect(page).toHaveURL(/(?:\?|&)dev(?:[=&]|&|#|$)/, {
    timeout: operationTimeout(deadline),
  });
  await expect(page).not.toHaveURL(/(?:\?|&)delete(?:&|#|$)/, {
    timeout: operationTimeout(deadline),
  });
  await waitForRepositoryRemoval(page, githubRepositoryFullName, deadline);
}

async function removeRepositoryIfPresent(
  page: Page,
  githubRepositoryFullName: string,
  targets: RepositoryCleanupTargets,
): Promise<void> {
  await page.goto("/repo?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/repo?dev");

  await prepareRepositoryListForOwner(
    page,
    parseGitHubRepositoryFullName(githubRepositoryFullName).owner,
  );
  const link = repositoryListLink(page, githubRepositoryFullName);
  if (!(await link.isVisible().catch(() => false))) {
    return;
  }

  await selectTemporaryRepository(page, githubRepositoryFullName);
  await removeTemporaryRepository(page, githubRepositoryFullName, targets);
}

async function waitForRepositoryProvisioning(
  page: Page,
  githubRepositoryFullName: string,
  deadline: OperationDeadline,
): Promise<RepositoryContract> {
  const link = repositoryListLink(page, githubRepositoryFullName);
  await expect(link).toBeVisible({ timeout: operationTimeout(deadline) });
  const contractOutput = await openRepositoryContractInspector(page, deadline);

  try {
    await expect
      .poll(
        async () => {
          const contract = await readRepositoryContract(contractOutput, deadline);
          const status = await link.getAttribute("data-repository-status", {
            timeout: operationTimeout(deadline),
          });
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
          message: `Wait for the full app provisioning workflow for ${githubRepositoryFullName}.`,
          timeout: operationTimeout(deadline, APP_PROVISIONING_PHASE_TIMEOUT_MS),
        },
      )
      .not.toBe("running");
  } catch (error) {
    const diagnosticDeadline = startDiagnosticDeadline("App provisioning diagnostics");
    const contract = await readRepositoryContract(contractOutput, diagnosticDeadline).catch(
      (diagnosticError: unknown) => {
        throw new Error(
          "App provisioning did not finish, and the Repository contract could not be read for diagnostics.",
          { cause: diagnosticError },
        );
      },
    );
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

  const contract = await readRepositoryContract(contractOutput, deadline);
  const status = await link.getAttribute("data-repository-status", {
    timeout: operationTimeout(deadline),
  });
  const failure = readProvisioningFailure(contract);
  if (failure) {
    throw new Error(
      `App provisioning failed during ${failure.phase} step ${failure.step}: ${failure.message}`,
    );
  }
  if (status === "Needs attention") {
    throw new Error(
      `App provisioning reached Needs attention, but the Repository contract did not contain a failed step. The recorded state was ${readActiveProvisioningStep(contract)}.`,
    );
  }

  return contract;
}

function sourceSetupMayHaveCreatedRepository(contract: RepositoryContract): boolean {
  if (contract.hasConnectedGitHubRepository || contract.sourceSetup.status === "ready") {
    return true;
  }
  if (contract.sourceSetup.status === "not_applicable") {
    return false;
  }
  return !["run_created", "initialize_repository", "validate_connections"].includes(
    contract.sourceSetup.step ?? "unknown",
  );
}

async function readCreatedAppForCleanup(
  page: Page,
  githubRepositoryFullName: string,
  deadline: OperationDeadline,
): Promise<RepositoryContract | null> {
  await page.goto("/repo?dev", {
    timeout: operationTimeout(deadline),
    waitUntil: "domcontentloaded",
  });

  const owner = parseGitHubRepositoryFullName(githubRepositoryFullName).owner;
  await prepareRepositoryListForOwner(page, owner, deadline);
  const link = repositoryListLink(page, githubRepositoryFullName);
  const repositoryExists = await link
    .waitFor({
      state: "visible",
      timeout: operationTimeout(deadline, APP_CLEANUP_TARGET_TIMEOUT_MS),
    })
    .then(() => true)
    .catch(() => false);
  if (!repositoryExists) {
    return null;
  }

  await selectTemporaryRepository(page, githubRepositoryFullName, deadline);
  const contractOutput = await openRepositoryContractInspector(page, deadline);
  const contract = await readRepositoryContract(contractOutput, deadline);
  if (contract.githubRepositoryFullName !== githubRepositoryFullName) {
    throw new Error(
      "Refusing cleanup because the selected repository owner and name do not match the test target.",
    );
  }
  if (!contract.isSamebaseManaged) {
    throw new Error("Refusing cleanup because the temporary repository is not Samebase-managed.");
  }

  const removeControl = removeRepositoryControl(page);
  await expect(removeControl).toBeVisible({ timeout: operationTimeout(deadline) });
  try {
    await expect(removeControl).toBeEnabled({
      timeout: operationTimeout(deadline, APP_CLEANUP_TARGET_TIMEOUT_MS),
    });
  } catch (error) {
    const diagnosticDeadline = startDiagnosticDeadline("App cleanup diagnostics");
    const latestContract = await readRepositoryContract(contractOutput, diagnosticDeadline).catch(
      () => contract,
    );
    const disabledReason = await page
      .getByRole("heading", { name: /^Remove .+ from Samebase\?$/u })
      .locator("..")
      .locator("p")
      .textContent({ timeout: operationTimeout(diagnosticDeadline) })
      .catch(() => null);
    throw new Error(
      `Dashboard cleanup stayed blocked${disabledReason ? `: ${disabledReason.trim()}` : "."} The last recorded provisioning state was ${readActiveProvisioningStep(latestContract)}.`,
      { cause: error },
    );
  }

  const readyContract = await readRepositoryContract(contractOutput, deadline);
  if (readyContract.githubRepositoryFullName !== githubRepositoryFullName) {
    throw new Error(
      "Refusing cleanup because the selected repository owner and name changed before deletion.",
    );
  }
  if (!readyContract.isSamebaseManaged) {
    throw new Error(
      "Refusing cleanup because the temporary repository stopped being Samebase-managed before deletion.",
    );
  }
  return readyContract;
}

async function removeCreatedApp(
  page: Page,
  githubRepositoryFullName: string,
  contract: RepositoryContract,
  deadline: OperationDeadline,
): Promise<void> {
  const githubMayExist = sourceSetupMayHaveCreatedRepository(contract);
  if (githubMayExist && !contract.hasConnectedGitHubRepository) {
    throw new Error(
      "The GitHub repository may exist, but the dashboard cannot confirm it for supported cleanup.",
    );
  }
  const providerPlan = contract.providerPlan;
  const convexMayExist =
    contract.hasConvexProvision ||
    (providerPlan !== null && providerPlan.convex.state !== "planned");
  const cloudflareMayExist =
    contract.hasCloudflareProvision ||
    (providerPlan !== null && providerPlan.cloudflare.state !== "planned");
  if (convexMayExist && !contract.canRemoveConvexProvision) {
    throw new Error(
      "Convex provisioning may have created a project, but the dashboard cannot remove it.",
    );
  }
  if (cloudflareMayExist && !contract.canRemoveCloudflareProvision) {
    throw new Error(
      "Cloudflare provisioning may have created a Worker, but the dashboard cannot remove it.",
    );
  }

  await removeTemporaryRepository(
    page,
    githubRepositoryFullName,
    {
      cloudflareWorker: contract.canRemoveCloudflareProvision,
      convexProject: contract.canRemoveConvexProvision,
      githubRepository: githubMayExist,
    },
    deadline,
  );
}

type AppCreationCleanupController = {
  markCreationStarted(githubRepositoryFullName: string): void;
};

const test = base.extend<{ appCreationCleanup: AppCreationCleanupController }>({
  appCreationCleanup: [
    async ({ page }, use) => {
      let startedGitHubRepositoryFullName: string | null = null;

      await use({
        markCreationStarted(githubRepositoryFullName) {
          if (startedGitHubRepositoryFullName !== null) {
            throw new Error("The app-creation cleanup target was already registered.");
          }
          startedGitHubRepositoryFullName = githubRepositoryFullName;
        },
      });

      if (startedGitHubRepositoryFullName === null) {
        return;
      }

      const cleanupDeadline = startOperationDeadline("App cleanup", APP_CLEANUP_FIXTURE_TIMEOUT_MS);
      const cleanupContract = await readCreatedAppForCleanup(
        page,
        startedGitHubRepositoryFullName,
        cleanupDeadline,
      );
      if (!cleanupContract) {
        throw new Error(
          "The submit started, but the dashboard did not expose the test repository for supported cleanup.",
        );
      }
      let provisioningFailure: Error | null = null;
      try {
        const recordedFailure = readProvisioningFailure(cleanupContract);
        if (recordedFailure) {
          provisioningFailure = new Error(
            `App provisioning failed during ${recordedFailure.phase} step ${recordedFailure.step}: ${recordedFailure.message}`,
          );
        }
      } catch (error) {
        provisioningFailure = error instanceof Error ? error : new Error(String(error));
      }
      try {
        await removeCreatedApp(
          page,
          startedGitHubRepositoryFullName,
          cleanupContract,
          cleanupDeadline,
        );
      } catch (error) {
        const cleanupMessage =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Unknown dashboard cleanup failure.";
        if (provisioningFailure) {
          throw new Error(
            `${provisioningFailure.message}\nFail-closed dashboard cleanup also failed: ${cleanupMessage}`,
            { cause: error },
          );
        }
        throw error;
      }
      if (provisioningFailure) {
        throw provisioningFailure;
      }
    },
    {
      scope: "test",
      timeout: APP_CLEANUP_FIXTURE_TIMEOUT_MS,
      title: "fail-closed app cleanup",
    },
  ],
});

test.describe("repository create app live flow", () => {
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
    appCreationCleanup,
  }, testInfo) => {
    const testBodyStartedAt = Date.now();
    test.setTimeout(APP_PREFLIGHT_PHASE_TIMEOUT_MS);
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
    const githubRepositoryFullName = `${testOwner}/${repositoryName}`;

    await testInfo.attach("temporary-repository-name", {
      body: githubRepositoryFullName,
      contentType: "text/plain",
    });

    const newAppPage = await openNewAppWithProviderPreflight(page, testOwner);
    const convexRegion = newAppPage.getByRole("combobox", {
      name: "Convex production region",
    });
    await expect(convexRegion).toBeVisible({ timeout: 30_000 });
    await convexRegion.click();
    await newAppPage.getByRole("option", { exact: true, name: "🇺🇸 US East (N. Virginia)" }).click();
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

    testInfo.setTimeout(Date.now() - testBodyStartedAt + APP_SUBMIT_PHASE_TIMEOUT_MS);
    const submitDeadline = startOperationDeadline("App submit", APP_SUBMIT_PHASE_TIMEOUT_MS);
    appCreationCleanup.markCreationStarted(githubRepositoryFullName);
    await createButton.click({ timeout: operationTimeout(submitDeadline) });

    try {
      await expect(page).toHaveURL(
        new RegExp(`/repo/${escapeRegExp(githubRepositoryFullName)}(?:[?#]|$)`),
        { timeout: operationTimeout(submitDeadline) },
      );
    } catch (error) {
      const createErrors = await page.locator(".text-red-600").allTextContents();
      const createError = createErrors.at(-1)?.trim();
      if (createError) {
        throw new Error(`App creation failed after submit: ${createError}`, { cause: error });
      }
      throw error;
    }

    testInfo.setTimeout(Date.now() - testBodyStartedAt + APP_PROVISIONING_PHASE_TIMEOUT_MS);
    const provisioningDeadline = startOperationDeadline(
      "App provisioning",
      APP_PROVISIONING_PHASE_TIMEOUT_MS,
    );
    await page.goto(`/repo/${githubRepositoryFullName}?dev`, {
      timeout: operationTimeout(provisioningDeadline),
      waitUntil: "domcontentloaded",
    });

    const contract = await waitForRepositoryProvisioning(
      page,
      githubRepositoryFullName,
      provisioningDeadline,
    );
    expect(contract).toMatchObject({
      githubRepositoryFullName: githubRepositoryFullName,
      convexTeamId: TEST_CONVEX_TEAM_ID,
      cloudflareAccountId: TEST_CLOUDFLARE_ACCOUNT_ID,
      sourceSetup: { status: "ready" },
      providerSetup: { status: "ready" },
      providerPlan: {
        convex: {
          state: "created",
          projectName: expectedConvexProjectName,
          deploymentRegion: TEST_CONVEX_DEPLOYMENT_REGION,
        },
        cloudflare: {
          state: "created",
          workerName: expectedCloudflareWorkerName,
        },
      },
      isSamebaseManaged: true,
      hasConnectedGitHubRepository: true,
      hasConvexProvision: true,
      hasCloudflareProvision: true,
      canRemoveConvexProvision: true,
      canRemoveCloudflareProvision: true,
      convexProjects: [
        {
          teamId: TEST_CONVEX_TEAM_ID,
          projectId: expect.any(String),
        },
      ],
      cloudflareWorkers: [
        {
          accountId: TEST_CLOUDFLARE_ACCOUNT_ID,
          workerName: expectedCloudflareWorkerName,
          workerTag: expect.any(String),
        },
      ],
    });

    const repositoryListEntryLink = repositoryListLink(page, githubRepositoryFullName);
    await expect(repositoryListEntryLink).not.toHaveAttribute(
      "data-repository-status",
      /^(?:Needs attention|Setting up)$/,
      { timeout: operationTimeout(provisioningDeadline) },
    );

    const repositoryLink = page.getByRole("link", {
      name: `Open ${githubRepositoryFullName} on GitHub`,
    });

    await expect(repositoryLink).toBeVisible({ timeout: operationTimeout(provisioningDeadline) });

    await testInfo.attach("created-repository-link", {
      body:
        (await repositoryLink.first().getAttribute("href", {
          timeout: operationTimeout(provisioningDeadline),
        })) ?? "",
      contentType: "text/plain",
    });
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
    let repositoryConnected = false;
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
      await removeRepositoryIfPresent(page, EXISTING_REPOSITORY_FULL_NAME, cleanupTargets);
      await connectExistingTemporaryRepository(page, EXISTING_REPOSITORY_FULL_NAME);
      repositoryConnected = true;
      await selectTemporaryRepository(page, EXISTING_REPOSITORY_FULL_NAME);

      await createCloudflareWorkerFromSettings(page, resourceName);
      await configureWorkersBuildsForGitHub(page, resourceName);
      await createConvexProjectFromSettings(page, resourceName, resourceName);
      await setCloudflareConvexDeployKeys(page, resourceName);
    } finally {
      if (repositoryConnected) {
        await page.goto("/repo?dev", { waitUntil: "domcontentloaded" });
        await signInIfNeeded(page, "/repo?dev");
        await selectTemporaryRepository(page, EXISTING_REPOSITORY_FULL_NAME);
        await removeTemporaryRepository(page, EXISTING_REPOSITORY_FULL_NAME, cleanupTargets);
      }
    }
  });
});
