import { v, type Infer } from "convex/values";

import { vAppProvisioningRunStep } from "../../appProvisioningModel";
import { vVaultDeletionStep } from "../deletion/model";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

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
    step: vAppProvisioningRunStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    runId: id("workflow_vaultProvisioning_runs"),
    step: vAppProvisioningRunStep,
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
    step: vAppProvisioningRunStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    provider: providerSetupProvider,
    runId: id("workflow_vaultProvisioning_runs"),
    step: vAppProvisioningRunStep,
    message: string(),
    updatedAt: number(),
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
    lastError: string(),
    updatedAt: number(),
  }),
);

const vUserVaultsResult = array(
  object({
    _id: id("vaults"),
    _creationTime: number(),
    ghRepoOwner: string(),
    ghRepoName: string(),
    repositoryFullName: string(),
    defaultBranch: optional(string()),
    commitSHA: optional(string()),
    fileCount: number(),
    lastEditTime: optional(number()),
    state: union(literal("copying_files"), literal("ready"), literal("failed")),
    sourceSetup: vSourceSetupSummary,
    providerSetup: vProviderSetupSummary,
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
        convexConfigPath: string(),
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
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } satisfies AppFunctionMcpMetadata,
  doc: `Returns every vault the authenticated account can see. Provider resources are stable
identities only. Current Cloudflare and Convex state, including the Worker-to-project marker, is
loaded from those providers when a relevant view opens; it is not mirrored by this query.`,
} as const;

export type SourceSetupSummary = Infer<typeof vSourceSetupSummary>;
export type ProviderSetupSummary = Infer<typeof vProviderSetupSummary>;
export type VaultDeletionSummary = Infer<typeof vVaultDeletionSummary>;
export type UserVaultsResult = Infer<typeof getUserVaultsContract.returns>;
export type UserVaultResult = UserVaultsResult[number];
