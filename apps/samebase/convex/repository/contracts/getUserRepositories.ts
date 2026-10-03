import { v, type Infer } from "convex/values";

import { vRepositoryDeletionStep } from "../deletion/model";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexCodeLocation } from "./convexAttachments";
import { vRepositoryProviderWriteTimes } from "../provisioningModel";
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

/**
The MCP list carries names, not attachment IDs: every MCP tool takes the repository as owner/name or
repositoryId, a Worker by its name, and a Convex project by its slug. Convex project slugs and names
are read live from Convex; null means that Samebase could not read the Convex team.
*/
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
    pendingCloudflareSetup: union(
      v.null(),
      object({
        workerName: string(),
        rootDirectory: string(),
      }),
    ),
    deletion: object({
      state: union(literal("not_deleting"), literal("deleting"), literal("delete_failed")),
    }),
    cloudflareWorkers: array(
      object({
        workerName: string(),
        rootDirectory: string(),
      }),
    ),
    convexProjects: array(
      object({
        projectSlug: union(string(), v.null()),
        projectName: union(string(), v.null()),
        codeLocation: string(),
      }),
    ),
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
      "List the Samebase repositories in every organization of the account: owner/name, repositoryId, setup state, pending Cloudflare setup, the names of attached Workers, and the slugs and names of attached Convex projects. Other tools take a Convex project by its slug.",
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
reports the managed work that was requested. It does not prove that every provider is attached.

Each attached Worker shows its name and root directory. Each attached Convex project shows its slug
and name, read live from Convex, and its code location (a convex.json path, or a convex/ directory).
Other MCP tools take the slug, which is unique inside a Convex team; the name is for display. Both
are null when Samebase could not read the Convex team.

pendingCloudflareSetup is null unless a managed creation had no Workers Builds token, its Convex
project is attached, and no Worker is attached. Then a ready providerSetup means that the GitHub and
Convex work finished. Report Cloudflare setup as pending and give the user
https://samebase.com/docs/cloudflare-setup. After the user creates the first token through
Cloudflare's standard repository setup and deletes the temporary Worker, call
repository_cloudflare_createWorker for this repository. It uses the planned Worker name and root
directory and installs the Convex deploy key. Do not attach the temporary Worker or retry the
completed managed run.

Attachments are stable identities only. Current Cloudflare and Convex state is read from those
providers when a relevant view opens; this query does not mirror it.`,
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
