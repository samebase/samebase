import { v, type Infer } from "convex/values";

import { vVaultDeletionStep } from "../deletion/model";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexCodeLocation } from "./convexAttachments";
import { vVaultProviderWriteTimes } from "../../appProvisioningModel";

const { array, boolean, id, literal, null: nullValue, number, object, optional, string, union } = v;

export const vSourceSetupStep = union(
  literal("run_created"),
  literal("initialize_vault"),
  literal("validate_connections"),
  literal("create_github_repo"),
  literal("fetch_github_repo"),
  literal("seed_starter"),
  literal("connect_github"),
  literal("sync_tree"),
);

export const vProviderSetupStep = union(
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
  literal("finish"),
);

export const vSourceSetupSummary = union(
  object({
    status: literal("not_applicable"),
  }),
  object({
    status: literal("ready"),
  }),
  object({
    status: literal("running"),
    runId: id("workflow_vaultProvisioning_runs"),
    step: vSourceSetupStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    runId: id("workflow_vaultProvisioning_runs"),
    step: vSourceSetupStep,
    message: string(),
    updatedAt: number(),
  }),
);

const providerSetupProvider = union(literal("convex"), literal("cloudflare"));

export const vProviderSetupSummary = union(
  object({
    status: literal("not_applicable"),
  }),
  object({
    status: literal("ready"),
  }),
  object({
    status: literal("running"),
    provider: providerSetupProvider,
    runId: id("workflow_vaultProvisioning_runs"),
    step: vProviderSetupStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    provider: providerSetupProvider,
    runId: id("workflow_vaultProvisioning_runs"),
    step: vProviderSetupStep,
    message: string(),
    updatedAt: number(),
  }),
);

export const vManagedProviderPlan = union(
  nullValue(),
  object({
    convexConfigPath: string(),
    convex: union(
      object({
        state: literal("planned"),
        projectName: string(),
        teamId: string(),
      }),
      object({
        state: literal("creating"),
        projectName: string(),
        teamId: string(),
      }),
      object({
        state: literal("created"),
        projectName: string(),
        teamId: string(),
        projectId: string(),
      }),
    ),
    cloudflare: union(
      object({
        state: literal("planned"),
        accountId: string(),
        workerName: string(),
        rootDirectory: string(),
        buildTokenUuid: string(),
      }),
      object({
        state: literal("creating"),
        accountId: string(),
        workerName: string(),
        rootDirectory: string(),
        buildTokenUuid: string(),
      }),
      object({
        state: literal("created"),
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        rootDirectory: string(),
        buildTokenUuid: string(),
      }),
    ),
  }),
);

const vManagedProviderWriteOwner = object({
  kind: literal("managed_run"),
});
const vManualProviderWriteOwner = object({
  kind: literal("manual_provider_write"),
});
const vProviderWriteProviders = array(providerSetupProvider);

export const vProviderWriteSummary = union(
  object({
    status: literal("idle"),
    lastWriteAt: vVaultProviderWriteTimes,
  }),
  object({
    status: literal("active"),
    owner: vManagedProviderWriteOwner,
    lastWriteAt: vVaultProviderWriteTimes,
  }),
  object({
    status: literal("active"),
    owner: vManualProviderWriteOwner,
    affectedProviders: vProviderWriteProviders,
    lastWriteAt: vVaultProviderWriteTimes,
  }),
);

export const vVaultDeletionSummary = union(
  object({
    state: literal("not_deleting"),
    deleteAction: union(
      object({
        state: literal("available"),
      }),
      object({
        state: literal("disabled"),
        reason: string(),
      }),
    ),
  }),
  object({
    state: literal("deleting"),
    runId: id("workflow_vaultDeletion_runs"),
    requestedAt: number(),
    currentStep: vVaultDeletionStep,
    message: string(),
    updatedAt: number(),
  }),
  object({
    state: literal("delete_failed"),
    runId: id("workflow_vaultDeletion_runs"),
    failedAt: number(),
    currentStep: vVaultDeletionStep,
    message: string(),
    updatedAt: number(),
  }),
);

const vUserVaultsResult = array(
  object({
    _id: id("vaults"),
    organizationId: id("organizations"),
    convexTeamId: string(),
    cloudflareAccountId: string(),
    ghRepoOwner: string(),
    ghRepoName: string(),
    ghRepoId: optional(string()),
    repositoryFullName: string(),
    defaultBranch: optional(string()),
    fileCount: number(),
    lastEditTime: optional(number()),
    sourceSetup: vSourceSetupSummary,
    providerSetup: vProviderSetupSummary,
    providerPlan: vManagedProviderPlan,
    providerWrite: vProviderWriteSummary,
    deletion: vVaultDeletionSummary,
    isSamebaseManaged: boolean(),
    hasConnectedGitHubRepository: boolean(),
    hasConvexProvision: boolean(),
    hasCloudflareProvision: boolean(),
    canRemoveConvexProvision: boolean(),
    canRemoveCloudflareProvision: boolean(),
    cloudflareWorkers: array(
      object({
        workerId: id("vaultCloudflareWorkers"),
        accountId: string(),
        workerName: string(),
        workerTag: string(),
      }),
    ),
    convexProjects: array(
      object({
        convexProjectId: id("vaultConvexProjects"),
        teamId: string(),
        projectId: string(),
        codeLocation: vConvexCodeLocation,
      }),
    ),
  }),
);

export const getUserVaultsContract = {
  id: "get_user_vaults",
  access: "access_dashboard",
  args: {},
  returns: vUserVaultsResult,
  structuredContent: object({ vaults: vUserVaultsResult }),
  mcp: {
    title: "List Samebase vaults",
    name: "vault_dashboard_getUserVaults",
    description:
      "List the Samebase vaults available to the authenticated user, including attached provider resources.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Returns every vault the authenticated account can see in the web app. An MCP call returns
vaults across all organizations where that account is a current member. Repository connection,
source setup, provider setup, and deletion are independent axes; a source-setup failure does not
revoke an already connected repository. Provider resources are stable identities only. Current
Cloudflare and Convex state, including the Worker-to-project marker, is loaded from those providers
when a relevant view opens; it is not mirrored by this query.`,
} as const;

export type SourceSetupSummary = Infer<typeof vSourceSetupSummary>;
export type SourceSetupStep = Infer<typeof vSourceSetupStep>;
export type ProviderSetupSummary = Infer<typeof vProviderSetupSummary>;
export type ProviderSetupStep = Infer<typeof vProviderSetupStep>;
export type ManagedProviderPlan = Infer<typeof vManagedProviderPlan>;
export type ProviderWriteSummary = Infer<typeof vProviderWriteSummary>;
export type VaultDeletionSummary = Infer<typeof vVaultDeletionSummary>;
export type UserVaultsResult = Infer<typeof getUserVaultsContract.returns>;
export type UserVaultResult = UserVaultsResult[number];
