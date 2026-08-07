import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { normalizeVaultRootDirectory } from "../../shared/vaultRootDirectory";
import { vVaultDeletionState } from "./deletion/model";
export { parseRepositoryFullName } from "../../shared/repoName";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

export const vGithubTree = object({
  path: string(),
  mode: string(),
  type: string(),
  sha: string(),
  size: optional(number()),
  url: optional(string()),
});
export type GithubTree = Infer<typeof vGithubTree>;

export const vGithubTreeData = object({
  sha: string(),
  url: optional(string()),
  truncated: boolean(),
  tree: array(vGithubTree),
});
export type GithubTreeData = Infer<typeof vGithubTreeData>;

/**
 * GitHub visibility values currently supported by Samebase's create and connect
 * flows.
 */
export const vGitHubRepositoryVisibility = union(literal("private"), literal("public"));

export const vVaultConnectedRepositoryTarget = object({
  vaultId: id("vaults"),
  ghRepoId: string(),
  owner: string(),
  name: string(),
  defaultBranch: string(),
});
export type VaultConnectedRepositoryTarget = Infer<typeof vVaultConnectedRepositoryTarget>;

export const vTreeRefreshFailureKind = union(literal("failed"), literal("rate_limited"));
export type TreeRefreshFailureKind = Infer<typeof vTreeRefreshFailureKind>;

/**
 * Visibility is separate from coordinates because owner/name identify the repo
 * target even when visibility is not known yet. Create-repository states use it
 * as requested intent; connected states use it as the latest GitHub metadata
 * observed by Samebase.
 */
export const vVaultProviderResourceOrigin = union(
  literal("provisioned"),
  literal("selected_existing"),
);
export type VaultProviderResourceOrigin = Infer<typeof vVaultProviderResourceOrigin>;

const vVaultConvexProjectConfig = object({
  vaultId: id("vaults"),
  organizationId: id("organizations"),
  teamId: string(),
  projectId: string(),
  convexConfigPath: string(),
  origin: vVaultProviderResourceOrigin,
});
const vVaultConvexProjectDirectory = object({
  vaultId: id("vaults"),
  organizationId: id("organizations"),
  teamId: string(),
  projectId: string(),
  convexDirectoryPath: string(),
  origin: vVaultProviderResourceOrigin,
});
export const vVaultConvexProject = union(vVaultConvexProjectConfig, vVaultConvexProjectDirectory);
export const vVaultConvexProjectDocument = union(
  vVaultConvexProjectConfig.extend({
    _id: id("vaultConvexProjects"),
    _creationTime: number(),
  }),
  vVaultConvexProjectDirectory.extend({
    _id: id("vaultConvexProjects"),
    _creationTime: number(),
  }),
);

const vaultCloudflareBuildConfigFields = {
  rootDirectory: string(),
  buildCommand: string(),
  deployCommand: string(),
  previewDeployCommand: string(),
  pathIncludes: array(string()),
  pathExcludes: array(string()),
} as const;
export const vVaultCloudflareBuildConfig = object(vaultCloudflareBuildConfigFields);
export type VaultCloudflareBuildConfig = Infer<typeof vVaultCloudflareBuildConfig>;

export function buildVaultCloudflareBuildConfigForRootDirectory(args: {
  rootDirectory: string;
}): VaultCloudflareBuildConfig {
  const rootDirectory = normalizeVaultRootDirectory(args.rootDirectory);
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

export const vaultTables = {
  /** Durable app containers with explicit repository connection states. */
  vaults: defineTable(
    union(
      object({
        state: literal("not_connected"),
        organizationId: id("organizations"),
        convexTeamId: string(),
        cloudflareAccountId: string(),
        deletion: vVaultDeletionState,
      }),
      object({
        state: literal("provisioning"),
        githubMode: literal("create_repository"),
        organizationId: id("organizations"),
        convexTeamId: string(),
        cloudflareAccountId: string(),
        deletion: vVaultDeletionState,
        runId: id("workflow_vaultProvisioning_runs"),
        startedAt: number(),
        name: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("provisioning"),
        githubMode: literal("connect_existing_repository"),
        organizationId: id("organizations"),
        convexTeamId: string(),
        cloudflareAccountId: string(),
        deletion: vVaultDeletionState,
        runId: id("workflow_vaultProvisioning_runs"),
        startedAt: number(),
        name: string(),
      }),
      object({
        state: literal("connected"),
        githubMode: literal("create_repository"),
        organizationId: id("organizations"),
        convexTeamId: string(),
        cloudflareAccountId: string(),
        deletion: vVaultDeletionState,
        treeRefreshStartedAt: optional(number()),
        lastTreeRefreshFailedAt: optional(number()),
        treeRefreshFailureKind: optional(vTreeRefreshFailureKind),
        treeRefreshFailureMessage: optional(string()),
        treeRefreshCooldownUntil: optional(number()),
        runId: id("workflow_vaultProvisioning_runs"),
        ghRepoId: string(),
        defaultBranch: string(),
        connectedAt: number(),
        name: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("connected"),
        githubMode: literal("connect_existing_repository"),
        organizationId: id("organizations"),
        convexTeamId: string(),
        cloudflareAccountId: string(),
        deletion: vVaultDeletionState,
        treeRefreshStartedAt: optional(number()),
        lastTreeRefreshFailedAt: optional(number()),
        treeRefreshFailureKind: optional(vTreeRefreshFailureKind),
        treeRefreshFailureMessage: optional(string()),
        treeRefreshCooldownUntil: optional(number()),
        runId: id("workflow_vaultProvisioning_runs"),
        ghRepoId: string(),
        defaultBranch: string(),
        connectedAt: number(),
        name: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("failed"),
        githubMode: literal("create_repository"),
        organizationId: id("organizations"),
        convexTeamId: string(),
        cloudflareAccountId: string(),
        deletion: vVaultDeletionState,
        runId: id("workflow_vaultProvisioning_runs"),
        failedAt: number(),
        name: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("failed"),
        githubMode: literal("connect_existing_repository"),
        organizationId: id("organizations"),
        convexTeamId: string(),
        cloudflareAccountId: string(),
        deletion: vVaultDeletionState,
        runId: id("workflow_vaultProvisioning_runs"),
        failedAt: number(),
        name: string(),
      }),
    ),
  )
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_state_and_deletion_state", [
      "organizationId",
      "state",
      "deletion.state",
    ])
    .index("by_ghRepoId", ["ghRepoId"])
    .index("by_organization_and_name", ["organizationId", "name"]),

  /** Stable Cloudflare Worker identities attached to a repository-backed vault. */
  vaultCloudflareWorkers: defineTable({
    vaultId: id("vaults"),
    organizationId: id("organizations"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    origin: vVaultProviderResourceOrigin,
  })
    .index("by_vault", ["vaultId"])
    .index("by_organization", ["organizationId"])
    .index("by_account_and_worker", ["accountId", "workerName"])
    .index("by_account_and_worker_tag", ["accountId", "workerTag"]),

  /** Stable Convex project identities attached to repository code locations in a vault. */
  vaultConvexProjects: defineTable(vVaultConvexProject)
    .index("by_vault", ["vaultId"])
    .index("by_organization", ["organizationId"])
    .index("by_project", ["projectId"]),
};
