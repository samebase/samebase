import { v, type Infer } from "convex/values";

import { vAppProvisioningRunStep } from "../../appProvisioningModel";
import { vTreeRefreshFailureKind, vVaultCloudflareOrigin, vVaultConvexOrigin } from "../model";
import { vVaultDeletionStep } from "../deletion/model";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import {
  vCloudflareWorkerObservation,
  vConvexDeploymentObservation,
} from "../providerResourceObservationModel";

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
const providerSetupSource = union(literal("managed"), literal("manual"));

const vProviderSetupFailedNextAction = union(
  literal("retry_infrastructure_provisioning"),
  literal("connect_convex_deployment"),
  literal("connect_cloudflare_worker"),
  literal("wire_builds"),
  literal("wire_convex_build_access"),
);

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
    runId: id("workflow_vaultProvisioning_runs"),
    step: vAppProvisioningRunStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    provider: providerSetupProvider,
    source: providerSetupSource,
    runId: id("workflow_vaultProvisioning_runs"),
    step: vAppProvisioningRunStep,
    message: string(),
    updatedAt: number(),
    nextAction: vProviderSetupFailedNextAction,
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
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        origin: vVaultCloudflareOrigin,
        projectDashboardUrl: optional(string()),
        observation: vCloudflareWorkerObservation,
      }),
    ),
    convexDeployments: array(
      object({
        appRoot: string(),
        projectId: string(),
        deploymentName: string(),
        origin: vVaultConvexOrigin,
        observation: vConvexDeploymentObservation,
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
    title: "List Samebase apps",
    name: "vault_dashboard_getUserVaults",
    description:
      "List the Samebase apps and repositories available to the authenticated user, including provisioning state and stable provider attachment coordinates. Provider observations are loaded separately from the providers.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } satisfies AppFunctionMcpMetadata,
  doc: `Returns every app the authenticated account can see, with source setup, provider operation
evidence, deletion state, and stable provider attachment coordinates. The resource observation is
\`not_requested\` in this database query. Use the live provider observation action before presenting
or acting on current Worker, Workers Builds, deploy-key, Convex URL, or upstream existence state.`,
} as const;

export type SourceSetupSummary = Infer<typeof vSourceSetupSummary>;
export type ProviderSetupSummary = Infer<typeof vProviderSetupSummary>;
export type VaultDeletionSummary = Infer<typeof vVaultDeletionSummary>;
export type UserVaultsResult = Infer<typeof getUserVaultsContract.returns>;
export type UserVaultResult = UserVaultsResult[number];
