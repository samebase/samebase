import { v, type Infer } from "convex/values";

import { vAppProvisioningRunStep } from "../schema";
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

/**
Degraded variants carry their own remedy: `nextAction` names the exact action
that repairs the state (rfcs/111 one-base invariant). Dashboard repair buttons
and MCP consumers read the same field, so "what is wrong and what fixes it"
has one answer. The values are the snake_case names of shipped operations:
`retry_infrastructure_provisioning` (managed run retry), the manual
reconnect flows (specs 105/106), and the wire_* provisioning blocks.
*/
const vCloudflareWorkerGithubRepositoryConnection = union(
  object({
    state: literal("connected"),
  }),
  object({
    state: literal("not_connected"),
    nextAction: literal("wire_builds"),
  }),
);
const vCloudflareWorkerConvexDeployKeys = union(
  object({
    state: literal("missing"),
    nextAction: literal("wire_convex_build_access"),
  }),
  object({
    state: literal("not_applicable"),
  }),
  object({
    state: literal("set"),
  }),
);
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
  id: "get_user_vaults",
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
          convexDeployKeys: vCloudflareWorkerConvexDeployKeys,
          githubRepositoryConnection: vCloudflareWorkerGithubRepositoryConnection,
          lastObservedAt: number(),
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
    }),
  ),
  mcp: {
    name: "vault_dashboard_getUserVaults",
    description:
      "List the Samebase apps and repositories available to the authenticated user, including provisioning state and provider resources. Degraded states carry a nextAction field naming the repair action that fixes them.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } satisfies AppFunctionMcpMetadata,
  doc: `Returns every app the authenticated account can see, with enough state to act on: source
setup, provider setup, per-worker Workers Builds connection and Convex deploy-key state, deletion
state, and the provider coordinates for going direct (Convex \`deploymentName\`, \`teamSlug\`,
\`projectSlug\`, \`cloudUrl\`; Cloudflare \`workerName\`, \`workersDevUrl\`, dashboard URLs).

Degraded provider and connection states name their own remedy in a \`nextAction\` field; the value
is the snake_case name of the repairing action. Current vocabulary:
\`retry_infrastructure_provisioning\` (failed managed provisioning run), the failed manual run's
own action (\`connect_convex_deployment\`, \`connect_cloudflare_worker\`, \`wire_builds\`, or
\`wire_convex_build_access\` — rerun what failed), \`wire_builds\` (Worker not connected to its
repository), \`wire_convex_build_access\` (deploy keys missing). One exception: a failed
\`sourceSetup\` does not carry \`nextAction\` yet — treat \`sourceSetup.status: "failed"\` as
degraded and use its \`message\`. Elsewhere, a state without \`nextAction\` is healthy or not
applicable.

Read this before any repair or day-2 operation: the coordinates it returns are the inputs for
provider-direct work (see the operate guides), and the \`nextAction\` values are the exact
Samebase actions to call when the record itself is degraded.`,
} as const;

export type SourceSetupSummary = Infer<typeof vSourceSetupSummary>;
export type ProviderSetupSummary = Infer<typeof vProviderSetupSummary>;
export type CloudflareWorkerGithubRepositoryConnection = Infer<
  typeof vCloudflareWorkerGithubRepositoryConnection
>;
export type CloudflareWorkerConvexDeployKeys = Infer<typeof vCloudflareWorkerConvexDeployKeys>;
export type VaultDeletionSummary = Infer<typeof vVaultDeletionSummary>;
export type UserVaultsResult = Infer<typeof getUserVaultsContract.returns>;
export type UserVaultResult = UserVaultsResult[number];
