import { v } from "convex/values";
import { internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  isConvexCloudDeployment,
  requestConvexManagementApi,
  type ConvexCloudDeployment,
} from "./convexManagementApi/client";
import { isConvexManagementNotFoundError } from "./convexManagementApi/errors";
import type { components, PlatformDeploymentResponse } from "./convexManagementApi/types.generated";
import {
  formatCloudflareGitHubAppRepositoryAuthorizationMessage,
  isCloudflareGitHubAppRepositoryAuthorizationError,
} from "./cloudflareResources";
import type { AppProvisioningStep } from "./appProvisioningModel";
import type { ProviderApiCallRecorder } from "./providerApiLog";

type ConvexDeployKeyAllowedAction = NonNullable<
  components["schemas"]["PlatformCreateDeployKeyArgs"]["allowedActions"]
>[number];
export type ConvexProvisioningAuthMethod = "api_key" | "oauth";

const CONVEX_DEPLOY_KEY_ALLOWED_ACTIONS = [
  "deployment:deploy",
  "deployment:env:view",
  "deployment:env:write",
  "deployment:data:view",
] satisfies ConvexDeployKeyAllowedAction[];

type ConvexDeployKeyResult = {
  deployKey: string;
};

function requireConvexCloudDeployment(args: {
  deployment: PlatformDeploymentResponse;
  deploymentType: "prod" | "dev";
  projectId: string;
  description: string;
}): ConvexCloudDeployment {
  if (!isConvexCloudDeployment(args.deployment)) {
    throw new Error(`${args.description} was not cloud.`);
  }
  if (args.deployment.deploymentType !== args.deploymentType) {
    throw new Error(`${args.description} had the wrong deployment type.`);
  }
  if (args.deployment.projectId !== args.projectId) {
    throw new Error(`${args.description} belonged to a different project.`);
  }
  return args.deployment;
}

async function readDefaultConvexCloudDeployment(args: {
  convexToken: string;
  projectId: string;
  deploymentType: "prod" | "dev";
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexCloudDeployment | null> {
  try {
    const deployment = await requestConvexManagementApi(
      args.convexToken,
      "GET",
      "/projects/{project_id}/deployment",
      {
        params: {
          path: { project_id: args.projectId },
          query: args.deploymentType === "prod" ? { defaultProd: true } : { defaultDev: true },
        },
        recordApiCall: args.recordApiCall,
      },
    );
    return requireConvexCloudDeployment({
      deployment,
      deploymentType: args.deploymentType,
      projectId: args.projectId,
      description:
        args.deploymentType === "prod"
          ? "Default Convex production deployment"
          : "Default Convex dev deployment",
    });
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function createConvexCloudDeployment(args: {
  convexToken: string;
  projectId: string;
  deploymentType: "prod" | "dev";
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexCloudDeployment> {
  const deployment = await requestConvexManagementApi(
    args.convexToken,
    "POST",
    "/projects/{project_id}/create_deployment",
    {
      params: { path: { project_id: args.projectId } },
      body: {
        type: args.deploymentType,
      },
      recordApiCall: args.recordApiCall,
    },
  );
  return requireConvexCloudDeployment({
    deployment,
    deploymentType: args.deploymentType,
    projectId: args.projectId,
    description: "Created Convex deployment",
  });
}

async function readConvexProjectDetails(args: {
  convexToken: string;
  projectId: string;
  teamId: string;
  recordApiCall?: ProviderApiCallRecorder;
}) {
  const project = await requestConvexManagementApi(
    args.convexToken,
    "GET",
    "/projects/{project_id}",
    {
      params: { path: { project_id: args.projectId } },
      recordApiCall: args.recordApiCall,
    },
  );
  if (project.teamId !== args.teamId) {
    throw new Error("Convex project belonged to a different team.");
  }
  return project;
}

export type ConvexPreviewProvisionResult = {
  previewDeploymentName: string;
  previewCloudUrl: string;
};

export async function ensureConvexPreviewResources(args: {
  convexToken: string;
  teamId: string;
  projectId: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexPreviewProvisionResult> {
  // Preview deployment creation starts from recorded infrastructure, so prove
  // that project still belongs to the currently connected Convex team first.
  await readConvexProjectDetails({
    convexToken: args.convexToken,
    projectId: args.projectId,
    teamId: args.teamId,
    recordApiCall: args.recordApiCall,
  });

  const defaultDevDeployment = await readDefaultConvexCloudDeployment({
    convexToken: args.convexToken,
    projectId: args.projectId,
    deploymentType: "dev",
    recordApiCall: args.recordApiCall,
  });

  const deployment =
    defaultDevDeployment ??
    (await createConvexCloudDeployment({
      convexToken: args.convexToken,
      projectId: args.projectId,
      deploymentType: "dev",
      recordApiCall: args.recordApiCall,
    }));

  return {
    previewDeploymentName: deployment.name,
    previewCloudUrl: deployment.deploymentUrl,
  };
}

/**
 * Creates the production deploy key used by Cloudflare builds.
 *
 * Convex deploy keys created through OAuth reuse the OAuth-granted token, so
 * Convex rejects request-scoped allowedActions for that auth method.
 *
 * @see https://docs.convex.dev/management-api/create-deploy-key
 */
export async function createConvexDeployKey(args: {
  convexToken: string;
  convexAuthMethod: ConvexProvisioningAuthMethod;
  deploymentName: string;
  name: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexDeployKeyResult> {
  // Create deploy-key secrets inside provider steps so Workflow journals only
  // safe app metadata, never key material.
  const body =
    args.convexAuthMethod === "api_key"
      ? {
          allowedActions: CONVEX_DEPLOY_KEY_ALLOWED_ACTIONS,
          name: args.name,
        }
      : {
          name: args.name,
        };
  const { deployKey } = await requestConvexManagementApi(
    args.convexToken,
    "POST",
    "/deployments/{deployment_name}/create_deploy_key",
    {
      params: { path: { deployment_name: args.deploymentName } },
      body,
      recordApiCall: args.recordApiCall,
    },
  );

  return { deployKey };
}

export async function deleteConvexDeployKey(args: {
  convexToken: string;
  deploymentName: string;
  deployKeySecretOrName: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<void> {
  await requestConvexManagementApi(
    args.convexToken,
    "POST",
    "/deployments/{deployment_name}/delete_deploy_key",
    {
      params: { path: { deployment_name: args.deploymentName } },
      body: { id: args.deployKeySecretOrName },
      recordApiCall: args.recordApiCall,
    },
  );
}

export async function deleteConvexDeployKeyByName(args: {
  convexToken: string;
  deploymentName: string;
  name: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<void> {
  try {
    await deleteConvexDeployKey({
      convexToken: args.convexToken,
      deploymentName: args.deploymentName,
      deployKeySecretOrName: args.name,
      recordApiCall: args.recordApiCall,
    });
  } catch (error) {
    if (!isConvexManagementNotFoundError(error)) {
      throw error;
    }
  }
}

export async function createConvexPreviewDeployKey(args: {
  convexToken: string;
  projectId: string;
  name: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<ConvexDeployKeyResult> {
  // Cloudflare branch builds deploy Convex previews, which require a
  // project-level preview deploy key instead of a dev deployment key.
  const { previewDeployKey } = await requestConvexManagementApi(
    args.convexToken,
    "POST",
    "/projects/{project_id}/create_preview_deploy_key",
    {
      params: { path: { project_id: args.projectId } },
      body: {
        name: args.name,
      },
      recordApiCall: args.recordApiCall,
    },
  );

  return { deployKey: previewDeployKey };
}

export async function deleteConvexPreviewDeployKey(args: {
  convexToken: string;
  projectId: string;
  deployKeySecretOrName: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<void> {
  await requestConvexManagementApi(
    args.convexToken,
    "POST",
    "/projects/{project_id}/delete_preview_deploy_key",
    {
      params: { path: { project_id: args.projectId } },
      body: { id: args.deployKeySecretOrName },
      recordApiCall: args.recordApiCall,
    },
  );
}

export async function deleteConvexPreviewDeployKeyByName(args: {
  convexToken: string;
  projectId: string;
  name: string;
  recordApiCall?: ProviderApiCallRecorder;
}): Promise<void> {
  try {
    await deleteConvexPreviewDeployKey({
      convexToken: args.convexToken,
      projectId: args.projectId,
      deployKeySecretOrName: args.name,
      recordApiCall: args.recordApiCall,
    });
  } catch (error) {
    if (!isConvexManagementNotFoundError(error)) {
      throw error;
    }
  }
}

type ProvisioningEventCtx = {
  runMutation: <Mutation extends FunctionReference<"mutation", "public" | "internal">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<FunctionReturnType<Mutation>>;
};

async function appendProvisioningRunEvent(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    step: AppProvisioningStep;
    level: "info" | "warn" | "error";
    message: string;
    state: "unchanged" | "queued" | "running" | "succeeded" | "failed" | "canceled";
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: args.step,
      level: args.level,
      message: args.message,
      state: args.state,
    });
  } catch {
    console.warn("infra:provision:event_append_failed", {
      runId: args.runId,
      step: args.step,
    });
  }
}

type VaultProvisioningWriteLock = Doc<"workflow_vaultProvisioning_writeLocks">;
type ProvisioningWriteLockCtx = Pick<MutationCtx, "db">;

async function readVaultProvisioningWriteLock(
  ctx: ProvisioningWriteLockCtx,
  vaultId: Id<"vaults">,
): Promise<VaultProvisioningWriteLock | null> {
  return await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

function runHoldsProvisioningWriteLock(
  writeLock: VaultProvisioningWriteLock | null,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): boolean {
  return writeLock?.runId === args.runId && writeLock.state === "active";
}

async function cancelSupersededProvisioningRun(
  ctx: ProvisioningEventCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    step: AppProvisioningStep;
  },
): Promise<void> {
  await appendProvisioningRunEvent(ctx, {
    runId: args.runId,
    step: args.step,
    level: "warn",
    message: "Infrastructure provisioning was superseded by a newer run.",
    state: "canceled",
  });
}

export async function resolveConvexProvisioningConnection(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<{
  convexToken: string;
  convexAuthMethod: ConvexProvisioningAuthMethod;
  convexTeamId: string;
}> {
  const convexConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "convex",
  });
  if (convexConnection?.kind !== "convex") {
    throw new ConvexProvisioningConnectionRequiredError();
  }

  const convexToken = convexConnection.auth.credential.trim();
  const convexTeamId = convexConnection.teamId.trim();

  if (!convexToken || !convexTeamId) {
    throw new ConvexProvisioningConnectionRequiredError();
  }

  return { convexToken, convexAuthMethod: convexConnection.auth.method, convexTeamId };
}

export class ConvexProvisioningConnectionRequiredError extends Error {
  constructor() {
    super("Convex connection is required to provision infrastructure. Connect Convex and retry.");
    this.name = "ConvexProvisioningConnectionRequiredError";
  }
}

export async function resolveCloudflareProvisioningConnection(
  ctx: Pick<ActionCtx, "runAction">,
  userId: Id<"users">,
  options?: { forceRefresh: true },
): Promise<{
  cloudflareToken: string;
  cloudflareAuthMethod: "api_key" | "oauth" | "mcp_oauth";
  cloudflareAccountId: string;
}> {
  const resolveArgs = options ? { userId, forceRefresh: true } : { userId };
  const resolvedCloudflareConnection = await ctx.runAction(
    internal.cloudflareOAuth.resolveConnectionForUser,
    resolveArgs,
  );
  if (!resolvedCloudflareConnection) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }

  const cloudflareToken = resolvedCloudflareConnection.auth.credential.trim();
  const defaultAccount = resolvedCloudflareConnection.defaultAccount;

  if (!cloudflareToken) {
    throw new Error(
      "Cloudflare connection is required to provision infrastructure. Connect Cloudflare and retry.",
    );
  }

  if (defaultAccount.state !== "selected") {
    throw new Error("Cloudflare account selection is required before provisioning can continue.");
  }
  const cloudflareAccountId = defaultAccount.accountId.trim();
  if (!cloudflareAccountId) {
    throw new Error("Cloudflare account selection is required before provisioning can continue.");
  }

  return {
    cloudflareToken,
    cloudflareAuthMethod: resolvedCloudflareConnection.auth.method,
    cloudflareAccountId,
  };
}

export const markWorkflowStartupFailed = internalMutation({
  args: {
    runId: v.id("workflow_vaultProvisioning_runs"),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.state === "succeeded" || run.state === "failed" || run.state === "canceled") {
      return null;
    }

    const now = Date.now();
    const safeRunError = "Provisioning workflow failed to start.";
    const eventStep = resolveWorkflowFailureEventStep(run);
    const vault = await ctx.db.get(run.vaultId);
    if (vault?.state === "provisioning" && vault.runId === args.runId) {
      await ctx.runMutation(internal.vault.records.markGithubProvisioningFailed, {
        runId: args.runId,
      });
    }

    await recordWorkflowRunFailure(ctx, {
      eventStep,
      now,
      run,
      safeRunError,
    });

    console.error("infra:provision:start_failed", {
      vaultId: run.vaultId,
      repo: run.repositoryFullName,
      message: args.message,
    });

    return null;
  },
});

function resolveWorkflowFailureEventStep(
  run: Pick<Doc<"workflow_vaultProvisioning_runs">, "currentStep" | "trigger">,
): AppProvisioningStep {
  if (run.currentStep !== "run_created") {
    return run.currentStep;
  }
  if (run.trigger === "create" || run.trigger === "connect_existing_repository") {
    return "validate_connections";
  }
  return "claim_infra";
}

async function recordWorkflowRunFailure(
  ctx: MutationCtx,
  args: {
    eventStep: AppProvisioningStep;
    now: number;
    run: Doc<"workflow_vaultProvisioning_runs">;
    safeRunError: string;
  },
): Promise<void> {
  await ctx.db.patch(args.run._id, {
    state: "failed",
    lastError: args.safeRunError,
    updatedAt: args.now,
    completedAt: args.now,
  });
  await ctx.runMutation(internal.appProvisioningEvents.append, {
    userId: args.run.userId,
    vaultId: args.run.vaultId,
    repositoryFullName: args.run.repositoryFullName,
    runId: args.run._id,
    step: args.eventStep,
    level: "error",
    message: args.safeRunError,
    createdAt: args.now,
  });
}

const USER_FACING_PROVISIONING_ERROR_MARKERS = [
  "Cloudflare connection is required to provision infrastructure.",
  "Cloudflare account selection is required before provisioning can continue.",
  "Cloudflare connection is missing Workers Builds write access.",
  "Cloudflare Workers and Pages GitHub App is not authorized",
  "Cloudflare Workers needs a configured workers.dev subdomain",
  "Cloudflare Worker name",
  "Cloudflare Workers Builds has no build API token",
  "Cloudflare has multiple Workers build tokens",
  "Cannot connect Cloudflare Worker",
  "Cloudflare Worker connection did not attach a Worker.",
  "Convex connection is required to provision infrastructure.",
  "Convex project name",
  "Convex deployment connection did not attach a deployment.",
  "Cloudflare Worker is required before rotating Convex deploy keys for Workers Builds.",
  "Cloudflare Workers Builds are required before rotating Convex deploy keys.",
  "Convex deployment is required before rotating Convex deploy keys for Workers Builds.",
  "GitHub owner id is required before Cloudflare Workers Builds can connect the repository.",
  "GitHub repository response did not match the vault repo.",
];

function extractUserFacingProvisioningError(args: {
  message: string;
  repositoryFullName: string;
}): string | null {
  const firstLine = args.message.trim().split("\n")[0]?.trim();
  if (!firstLine) {
    return null;
  }

  let cleaned = firstLine;
  for (;;) {
    if (cleaned.startsWith("Error: Uncaught Error: ")) {
      cleaned = cleaned.slice("Error: Uncaught Error: ".length);
      continue;
    }
    if (cleaned.startsWith("Uncaught Error: ")) {
      cleaned = cleaned.slice("Uncaught Error: ".length);
      continue;
    }
    if (cleaned.startsWith("Error: ")) {
      cleaned = cleaned.slice("Error: ".length);
      continue;
    }
    break;
  }

  if (isCloudflareGitHubAppRepositoryAuthorizationError(new Error(cleaned))) {
    return formatCloudflareGitHubAppRepositoryAuthorizationMessage(args.repositoryFullName);
  }

  for (const marker of USER_FACING_PROVISIONING_ERROR_MARKERS) {
    if (cleaned.includes(marker)) {
      return cleaned;
    }
  }

  return null;
}

function resolveSafeWorkflowRunError(args: {
  currentStep: string;
  message: string;
  repositoryFullName: string;
}): string {
  if (args.currentStep === "run_created") {
    return "Provisioning failed before the first step.";
  }

  return (
    extractUserFacingProvisioningError({
      message: args.message,
      repositoryFullName: args.repositoryFullName,
    }) ?? `Provisioning failed during ${args.currentStep}.`
  );
}

function isCreateAppPreInfrastructureStep(step: string): boolean {
  return (
    step === "run_created" ||
    step === "initialize_vault" ||
    step === "validate_connections" ||
    step === "create_github_repo" ||
    step === "fetch_github_repo" ||
    step === "connect_github" ||
    step === "seed_starter" ||
    step === "sync_tree"
  );
}

export const markWorkflowProvisioningFailed = internalMutation({
  args: {
    runId: v.id("workflow_vaultProvisioning_runs"),
    workflowId: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.state === "succeeded" || run.state === "canceled") {
      return null;
    }
    if (run.workflowId && run.workflowId !== args.workflowId) {
      throw new Error("Workflow failure id does not match run.");
    }

    const now = Date.now();
    const eventStep = resolveWorkflowFailureEventStep(run);
    const vaultId = run.vaultId;
    const vault = await ctx.db.get(vaultId);
    const safeRunError = resolveSafeWorkflowRunError({
      currentStep: run.currentStep,
      message: args.message,
      repositoryFullName: run.repositoryFullName,
    });
    if (vault?.state === "provisioning" && vault.runId === args.runId) {
      await ctx.runMutation(internal.vault.records.markGithubProvisioningFailed, {
        runId: args.runId,
      });
      await recordWorkflowRunFailure(ctx, {
        eventStep,
        now,
        run,
        safeRunError,
      });
      console.error(
        vault.githubMode === "connect_existing_repository"
          ? "app:connect_existing:failed"
          : "app:provision:failed",
        {
          vaultId,
          repo: run.repositoryFullName,
          step: run.currentStep,
          message: args.message,
        },
      );
      return null;
    }

    let sourceSetupFailureLogName: "app:connect_existing:failed" | "app:provision:failed" | null =
      null;
    if (run.trigger === "connect_existing_repository") {
      sourceSetupFailureLogName = "app:connect_existing:failed";
    } else if (run.trigger === "create" && isCreateAppPreInfrastructureStep(run.currentStep)) {
      sourceSetupFailureLogName = "app:provision:failed";
    }
    if (sourceSetupFailureLogName) {
      await recordWorkflowRunFailure(ctx, {
        eventStep,
        now,
        run,
        safeRunError,
      });
      console.error(sourceSetupFailureLogName, {
        vaultId,
        repo: run.repositoryFullName,
        step: run.currentStep,
        message: args.message,
      });
      return null;
    }

    const writeLock = await readVaultProvisioningWriteLock(ctx, vaultId);
    const holdsProvisioningWriteLock = runHoldsProvisioningWriteLock(writeLock, {
      runId: args.runId,
    });
    const failedBeforeLockAcquisition = run.currentStep === "run_created";
    if (!holdsProvisioningWriteLock && !failedBeforeLockAcquisition) {
      await cancelSupersededProvisioningRun(ctx, {
        runId: args.runId,
        step: eventStep,
      });
      return null;
    }

    if (holdsProvisioningWriteLock && writeLock) {
      await ctx.db.patch(writeLock._id, {
        state: "failed",
        updatedAt: now,
      });
    }
    await recordWorkflowRunFailure(ctx, {
      eventStep,
      now,
      run,
      safeRunError,
    });

    console.error("infra:provision:failed", {
      vaultId,
      repo: run.repositoryFullName,
      step: run.currentStep,
      message: args.message,
    });

    return null;
  },
});
