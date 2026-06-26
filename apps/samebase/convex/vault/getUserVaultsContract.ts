import { v, type Infer } from "convex/values";

import { vAppProvisioningRunStep, vPullRequestLabel, vVaultBranchCommitSummary } from "../schema";
import { vTreeRefreshFailureKind } from "./model";
import { vVaultDeletionStep } from "./deletion/model";
import type { AppFunctionMcpMetadata } from "../../shared/convexFunctionPolicyTypes";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const treeRefreshFailureFields = {
  lastTreeRefreshFailedAt: optional(number()),
  treeRefreshFailureKind: optional(vTreeRefreshFailureKind),
  treeRefreshFailureMessage: optional(string()),
  treeRefreshCooldownUntil: optional(number()),
} as const;

export const vSourceSetupSummary = union(
  object({
    status: literal("not_applicable"),
  }),
  object({
    status: literal("ready"),
  }),
  object({
    status: literal("running"),
    runId: id("appProvisioningRuns"),
    step: vAppProvisioningRunStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    runId: id("appProvisioningRuns"),
    step: vAppProvisioningRunStep,
    message: string(),
    updatedAt: number(),
  }),
);

const providerSetupProvider = union(literal("convex"), literal("cloudflare"));
const providerSetupSource = union(literal("managed"), literal("manual"));

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
    source: providerSetupSource,
    runId: id("appProvisioningRuns"),
    step: vAppProvisioningRunStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    provider: providerSetupProvider,
    source: providerSetupSource,
    runId: id("appProvisioningRuns"),
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
    runId: id("vaultDeletionRuns"),
    requestedAt: number(),
    currentStep: vVaultDeletionStep,
    message: string(),
    updatedAt: number(),
  }),
  object({
    state: literal("delete_failed"),
    runId: id("vaultDeletionRuns"),
    failedAt: number(),
    currentStep: vVaultDeletionStep,
    message: string(),
    lastError: string(),
    updatedAt: number(),
  }),
);

export const getUserVaultsContract = {
  access: "access_dashboard",
  args: {},
  returns: array(
    object({
      _id: id("vaults"),
      _creationTime: number(),
      ghRepoOwner: string(),
      ghRepoName: string(),
      repositoryFullName: string(),
      commitSHA: optional(string()),
      fileCount: number(),
      lastEditTime: optional(number()),
      lastTreeRefreshAt: optional(number()),
      treeRefreshStartedAt: optional(number()),
      ...treeRefreshFailureFields,
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
      appRoots: array(
        object({
          appRoot: string(),
        }),
      ),
      cloudflareWorkers: array(
        object({
          appRoot: string(),
          workerName: string(),
          workersDevUrl: optional(string()),
          projectDashboardUrl: optional(string()),
        }),
      ),
      convexDeployments: array(
        object({
          appRoot: string(),
          projectId: string(),
          projectSlug: string(),
          teamSlug: string(),
          deploymentName: string(),
          cloudUrl: string(),
          siteUrl: string(),
          projectSettingsDashboardUrl: optional(string()),
          deploymentDashboardUrl: optional(string()),
        }),
      ),
      remoteBranches: array(
        object({
          name: string(),
          headCommitSha: string(),
          lastCommitAt: optional(number()),
          aheadBy: optional(number()),
          behindBy: optional(number()),
          pullRequestUrl: optional(string()),
          pullRequestNumber: optional(number()),
          pullRequestLabels: optional(array(vPullRequestLabel)),
          pullRequestTitle: optional(string()),
          pullRequestIsDraft: optional(boolean()),
          isDefault: boolean(),
          isProtected: boolean(),
          remoteState: union(literal("active"), literal("deleted_upstream")),
          lastSyncedAt: number(),
          commits: array(vVaultBranchCommitSummary),
        }),
      ),
    }),
  ),
  mcp: {
    name: "vault_dashboard_getUserVaults",
    description:
      "List the Samebase apps and repositories available to the authenticated user, including provisioning state, provider resources, and branch summaries.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } satisfies AppFunctionMcpMetadata,
} as const;

export type SourceSetupSummary = Infer<typeof vSourceSetupSummary>;
export type ProviderSetupSummary = Infer<typeof vProviderSetupSummary>;
export type VaultDeletionSummary = Infer<typeof vVaultDeletionSummary>;
export type UserVaultsResult = Infer<typeof getUserVaultsContract.returns>;
export type UserVaultResult = UserVaultsResult[number];
