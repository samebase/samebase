import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { normalizeRepositoryRootDirectory } from "../../shared/repositoryRootDirectory";
import { vRepositoryDeletionState } from "./deletion/model";
export { parseGitHubRepositoryFullName } from "../../shared/githubRepositoryName";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

export const vGitHubTree = object({
  path: string(),
  mode: string(),
  type: string(),
  sha: string(),
  size: optional(number()),
  url: optional(string()),
});
export type GitHubTree = Infer<typeof vGitHubTree>;

export const vGitHubTreeData = object({
  sha: string(),
  url: optional(string()),
  truncated: boolean(),
  tree: array(vGitHubTree),
});
export type GitHubTreeData = Infer<typeof vGitHubTreeData>;

export const vGitHubRepositoryVisibility = union(literal("private"), literal("public"));

export const vRepositoryConnectedGitHubTarget = object({
  repositoryId: id("repositories"),
  githubRepositoryDatabaseId: string(),
  githubOwnerLogin: string(),
  githubRepositoryName: string(),
  defaultBranch: string(),
});
export type RepositoryConnectedGitHubTarget = Infer<typeof vRepositoryConnectedGitHubTarget>;

export const vRepositoryTreeRefreshFailureKind = union(literal("failed"), literal("rate_limited"));
export type RepositoryTreeRefreshFailureKind = Infer<typeof vRepositoryTreeRefreshFailureKind>;

export const vRepositoryProviderResourceOrigin = union(
  literal("provisioned"),
  literal("selected_existing"),
);
export type RepositoryProviderResourceOrigin = Infer<typeof vRepositoryProviderResourceOrigin>;

const repositoryCloudflareBuildConfigFields = {
  rootDirectory: string(),
  buildCommand: string(),
  deployCommand: string(),
  previewDeployCommand: string(),
  pathIncludes: array(string()),
  pathExcludes: array(string()),
} as const;
export const vRepositoryCloudflareBuildConfig = object(repositoryCloudflareBuildConfigFields);
export type RepositoryCloudflareBuildConfig = Infer<typeof vRepositoryCloudflareBuildConfig>;

export function buildRepositoryCloudflareBuildConfigForRootDirectory(args: {
  rootDirectory: string;
}): RepositoryCloudflareBuildConfig {
  const rootDirectory = normalizeRepositoryRootDirectory(args.rootDirectory);
  const pathIncludes =
    rootDirectory === "/"
      ? ["*"]
      : [
          `${rootDirectory}/*`,
          "packages/dependent/*",
          "pnpm-lock.yaml",
          "pnpm-workspace.yaml",
          "package.json",
          ".nvmrc",
        ];

  return {
    rootDirectory,
    buildCommand: "pnpm run build",
    deployCommand: "pnpm run deploy",
    previewDeployCommand: "pnpm run deploy:preview",
    pathIncludes,
    pathExcludes: [],
  };
}

const vRepositoryConvexProjectConfig = object({
  repositoryId: id("repositories"),
  organizationId: id("organizations"),
  teamId: string(),
  projectId: string(),
  convexConfigPath: string(),
  origin: vRepositoryProviderResourceOrigin,
});
const vRepositoryConvexProjectDirectory = object({
  repositoryId: id("repositories"),
  organizationId: id("organizations"),
  teamId: string(),
  projectId: string(),
  convexDirectoryPath: string(),
  origin: vRepositoryProviderResourceOrigin,
});
export const vRepositoryConvexProject = union(
  vRepositoryConvexProjectConfig,
  vRepositoryConvexProjectDirectory,
);
export const vRepositoryConvexProjectDocument = union(
  vRepositoryConvexProjectConfig.extend({
    _id: id("repositoryConvexProjects"),
    _creationTime: number(),
  }),
  vRepositoryConvexProjectDirectory.extend({
    _id: id("repositoryConvexProjects"),
    _creationTime: number(),
  }),
);

const repositoryBaseFields = {
  organizationId: id("organizations"),
  deletion: vRepositoryDeletionState,
  createdAt: number(),
} as const;

const repositoryTreeRefreshFields = {
  treeRefreshStartedAt: optional(number()),
  lastTreeRefreshFailedAt: optional(number()),
  treeRefreshFailureKind: optional(vRepositoryTreeRefreshFailureKind),
  treeRefreshFailureMessage: optional(string()),
  treeRefreshCooldownUntil: optional(number()),
} as const;

export const repositoryTables = {
  /** Durable Samebase repositories with explicit GitHub connection states. */
  repositories: defineTable(
    union(
      object({
        state: literal("not_connected"),
        ...repositoryBaseFields,
        convexTeamId: optional(string()),
        cloudflareAccountId: optional(string()),
      }),
      object({
        state: literal("provisioning"),
        githubMode: literal("create_repository"),
        ...repositoryBaseFields,
        convexTeamId: string(),
        cloudflareAccountId: string(),
        runId: id("workflow_repositoryProvisioning_runs"),
        startedAt: number(),
        githubRepositoryName: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("provisioning"),
        githubMode: literal("connect_existing_repository"),
        ...repositoryBaseFields,
        convexTeamId: optional(string()),
        cloudflareAccountId: optional(string()),
        runId: id("workflow_repositoryProvisioning_runs"),
        startedAt: number(),
        githubRepositoryDatabaseId: optional(string()),
        githubRepositoryName: string(),
      }),
      object({
        state: literal("connected"),
        githubMode: literal("create_repository"),
        ...repositoryBaseFields,
        convexTeamId: string(),
        cloudflareAccountId: string(),
        ...repositoryTreeRefreshFields,
        runId: id("workflow_repositoryProvisioning_runs"),
        githubRepositoryDatabaseId: string(),
        defaultBranch: string(),
        connectedAt: number(),
        githubRepositoryName: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("connected"),
        githubMode: literal("connect_existing_repository"),
        ...repositoryBaseFields,
        convexTeamId: optional(string()),
        cloudflareAccountId: optional(string()),
        ...repositoryTreeRefreshFields,
        runId: id("workflow_repositoryProvisioning_runs"),
        githubRepositoryDatabaseId: string(),
        defaultBranch: string(),
        connectedAt: number(),
        githubRepositoryName: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("failed"),
        githubMode: literal("create_repository"),
        ...repositoryBaseFields,
        convexTeamId: string(),
        cloudflareAccountId: string(),
        runId: id("workflow_repositoryProvisioning_runs"),
        failedAt: number(),
        githubRepositoryName: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("failed"),
        githubMode: literal("connect_existing_repository"),
        ...repositoryBaseFields,
        convexTeamId: optional(string()),
        cloudflareAccountId: optional(string()),
        runId: id("workflow_repositoryProvisioning_runs"),
        failedAt: number(),
        githubRepositoryDatabaseId: optional(string()),
        githubRepositoryName: string(),
      }),
    ),
  )
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_state_and_deletion_state", [
      "organizationId",
      "state",
      "deletion.state",
    ])
    .index("by_tree_refresh_started_at", ["treeRefreshStartedAt"])
    .index("by_github_repository_database_id", ["githubRepositoryDatabaseId"])
    .index("by_organization_and_github_repository_name", [
      "organizationId",
      "githubRepositoryName",
    ]),

  /** Stable Cloudflare Worker identities attached to a Samebase repository. */
  repositoryCloudflareWorkers: defineTable({
    repositoryId: id("repositories"),
    organizationId: id("organizations"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
    origin: vRepositoryProviderResourceOrigin,
  })
    .index("by_repository", ["repositoryId"])
    .index("by_organization", ["organizationId"])
    .index("by_account_and_worker", ["accountId", "workerName"])
    .index("by_account_and_worker_tag", ["accountId", "workerTag"]),

  /** Stable Convex project identities attached to repository code locations. */
  repositoryConvexProjects: defineTable(vRepositoryConvexProject)
    .index("by_repository", ["repositoryId"])
    .index("by_organization", ["organizationId"])
    .index("by_project", ["projectId"]),
};
