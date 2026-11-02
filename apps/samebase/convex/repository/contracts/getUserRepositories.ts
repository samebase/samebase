import { v, type Infer } from "convex/values";

import { vRepositoryDeletionStep } from "../deletion/model";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexCodeLocation } from "./convexAttachments";
import { vRepositoryActionsCiSecrets, vRepositoryProviderWriteTimes } from "../provisioningModel";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

export const vSourceSetupStep = union(
  literal("run_created"),
  literal("initialize_repository"),
  literal("validate_connections"),
  literal("create_github_repository"),
  literal("fetch_github_repository"),
  literal("seed_starter"),
  literal("connect_github_repository"),
  literal("sync_tree"),
);

/**
The step of a managed provider setup run. A repository_actions retry that resumes the starter seed
after the Actions secrets reports seed_starter and sync_tree here.
*/
export const vProviderSetupStep = union(
  literal("write_actions_secrets"),
  literal("seed_starter"),
  literal("sync_tree"),
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
    runId: id("workflow_repositoryProvisioning_runs"),
    step: vSourceSetupStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    runId: id("workflow_repositoryProvisioning_runs"),
    step: vSourceSetupStep,
    message: string(),
    updatedAt: number(),
  }),
);

/** github = the GitHub Actions secrets of a repository_actions repository. */
const providerSetupProvider = union(literal("convex"), literal("cloudflare"), literal("github"));

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
    runId: id("workflow_repositoryProvisioning_runs"),
    step: vProviderSetupStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    provider: providerSetupProvider,
    runId: id("workflow_repositoryProvisioning_runs"),
    step: vProviderSetupStep,
    message: string(),
    updatedAt: number(),
  }),
);

export const vManagedProviderPlan = union(
  v.null(),
  object({
    convexConfigPath: string(),
    convex: union(
      object({
        state: literal("planned"),
        projectName: string(),
        deploymentRegion: vConvexDeploymentRegion,
        teamId: string(),
      }),
      object({
        state: literal("creating"),
        projectName: string(),
        deploymentRegion: vConvexDeploymentRegion,
        teamId: string(),
      }),
      object({
        state: literal("created"),
        projectName: string(),
        deploymentRegion: vConvexDeploymentRegion,
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
        buildTokenUuid: union(string(), v.null()),
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
  object({
    provisioning: literal("repository_actions"),
    convexConfigPath: string(),
    ciSecrets: vRepositoryActionsCiSecrets,
  }),
);

const vManagedProviderWriteOwner = object({
  kind: literal("managed_run"),
});
const vManualProviderWriteOwner = object({
  kind: literal("manual_provider_write"),
});
const vProviderWriteProviders = array(union(literal("convex"), literal("cloudflare")));

export const vProviderWriteSummary = union(
  object({
    status: literal("idle"),
    lastWriteAt: vRepositoryProviderWriteTimes,
  }),
  object({
    status: literal("active"),
    owner: vManagedProviderWriteOwner,
    lastWriteAt: vRepositoryProviderWriteTimes,
  }),
  object({
    status: literal("active"),
    owner: vManualProviderWriteOwner,
    affectedProviders: vProviderWriteProviders,
    lastWriteAt: vRepositoryProviderWriteTimes,
  }),
);

export const vRepositoryDeletionSummary = union(
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
    runId: id("workflow_repositoryDeletion_runs"),
    requestedAt: number(),
    currentStep: vRepositoryDeletionStep,
    message: string(),
    updatedAt: number(),
  }),
  object({
    state: literal("delete_failed"),
    runId: id("workflow_repositoryDeletion_runs"),
    failedAt: number(),
    currentStep: vRepositoryDeletionStep,
    message: string(),
    updatedAt: number(),
  }),
);

const userRepositoryFields = {
  repositoryId: id("repositories"),
  convexTeamId: optional(string()),
  cloudflareAccountId: optional(string()),
  githubOwnerLogin: string(),
  githubRepositoryName: string(),
  githubRepositoryDatabaseId: optional(string()),
  githubRepositoryFullName: string(),
  defaultBranch: optional(string()),
  fileCount: number(),
  lastEditTime: optional(number()),
  sourceSetup: vSourceSetupSummary,
  providerSetup: vProviderSetupSummary,
  providerPlan: vManagedProviderPlan,
  providerWrite: vProviderWriteSummary,
  deletion: vRepositoryDeletionSummary,
  isSamebaseManaged: boolean(),
  hasConnectedGitHubRepository: boolean(),
  hasConvexProvision: boolean(),
  hasCloudflareProvision: boolean(),
  canRemoveConvexProvision: boolean(),
  canRemoveCloudflareProvision: boolean(),
  cloudflareWorkers: array(
    object({
      workerId: id("repositoryCloudflareWorkers"),
      accountId: string(),
      workerName: string(),
      workerTag: string(),
      rootDirectory: string(),
    }),
  ),
  convexProjects: array(
    object({
      convexProjectId: id("repositoryConvexProjects"),
      teamId: string(),
      projectId: string(),
      codeLocation: vConvexCodeLocation,
    }),
  ),
};

const vUserRepositoriesResult = array(
  object({
    ...userRepositoryFields,
    organizationId: id("organizations"),
  }),
);

/** The MCP list carries the repository and its setup state: every MCP tool takes owner/name or repositoryId. */
const vMcpUserRepositoriesResult = array(
  object({
    repositoryId: userRepositoryFields.repositoryId,
    githubRepositoryFullName: userRepositoryFields.githubRepositoryFullName,
    githubOwnerLogin: userRepositoryFields.githubOwnerLogin,
    isSamebaseManaged: userRepositoryFields.isSamebaseManaged,
    sourceSetup: union(
      object({ status: union(literal("not_applicable"), literal("ready"), literal("running")) }),
      object({ status: literal("failed"), message: string() }),
    ),
    providerSetup: union(
      object({ status: union(literal("not_applicable"), literal("ready"), literal("running")) }),
      object({ status: literal("failed"), provider: providerSetupProvider, message: string() }),
    ),
    deletion: object({
      state: union(literal("not_deleting"), literal("deleting"), literal("delete_failed")),
    }),
  }),
);

export const getUserRepositoriesContract = {
  id: "list_repositories",
  access: "access_dashboard",
  args: {},
  returns: vUserRepositoriesResult,
  structuredContent: object({ repositories: vMcpUserRepositoriesResult }),
  mcp: {
    title: "List Samebase repositories",
    name: "repository_list",
    description:
      "List the Samebase repositories in every organization of the account: owner/name, repositoryId, and setup state.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {},
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Returns every repository the authenticated account can see in the web app. An MCP call returns
repositories across all organizations where that account is a current member; githubOwnerLogin
shows the organization. Other MCP tools take a repository as its owner/name or its repositoryId.
Source setup, provider setup, and deletion are independent states. While deletion.state is deleting
or delete_failed, source and provider setup are not_applicable. Do not change that repository or its
providers. The user can retry a failed deletion in the Samebase dashboard. Provider setup status
reports the setup work that was requested. It does not prove that the app is deployed.

This query reads no provider. \`repository_getStatus\` reads the live state of one repository.`,
} as const;

export type SourceSetupSummary = Infer<typeof vSourceSetupSummary>;
export type SourceSetupStep = Infer<typeof vSourceSetupStep>;
export type ProviderSetupSummary = Infer<typeof vProviderSetupSummary>;
export type ProviderSetupStep = Infer<typeof vProviderSetupStep>;
export type ManagedProviderPlan = Infer<typeof vManagedProviderPlan>;
export type ProviderWriteSummary = Infer<typeof vProviderWriteSummary>;
export type RepositoryDeletionSummary = Infer<typeof vRepositoryDeletionSummary>;
export type UserRepositoriesResult = Infer<typeof getUserRepositoriesContract.returns>;
export type UserRepositoryResult = UserRepositoriesResult[number];
