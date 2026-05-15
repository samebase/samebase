import { Infer, v } from "convex/values";
import { vVaultDeletionState } from "./deletion/model";

const { array, boolean, id, literal, number, object, optional, string, union } =
  v;

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

export const vInfraState = union(
  literal("not_started"),
  literal("provisioning"),
  literal("ready"),
  literal("failed"),
  literal("partial"),
);
export type InfraState = Infer<typeof vInfraState>;

/**
 * GitHub visibility values currently supported by Noter's create and connect
 * flows.
 */
export const vGitHubRepositoryVisibility = union(
  literal("private"),
  literal("public"),
);
export type GitHubRepositoryVisibility = Infer<
  typeof vGitHubRepositoryVisibility
>;

export function parseRepositoryFullName(repositoryFullName: string): {
  owner: string;
  name: string;
} {
  const parts = repositoryFullName.split("/");
  if (parts.length !== 2) {
    throw new Error("Invalid repository full name");
  }
  const owner = parts[0].trim();
  const name = parts[1].trim();
  if (!owner || !name) {
    throw new Error("Invalid repository full name");
  }
  return { owner, name };
}

export const vTreeRefreshFailureKind = union(
  literal("failed"),
  literal("rate_limited"),
);
export type TreeRefreshFailureKind = Infer<typeof vTreeRefreshFailureKind>;

const githubRepositoryCoordinatesFields = {
  owner: string(),
  name: string(),
} as const;

/**
 * Visibility is separate from coordinates because owner/name identify the repo
 * target even when visibility is not known yet. Create-repository states use it
 * as requested intent; connected states use it as the latest GitHub metadata
 * observed by Noter.
 */
const githubRepositoryWithVisibilityFields = {
  ...githubRepositoryCoordinatesFields,
  visibility: vGitHubRepositoryVisibility,
} as const;

export const vVaultConvexState = union(
  object({
    state: literal("not_configured"),
  }),
  object({
    state: literal("provisioning"),
    runId: id("appProvisioningRuns"),
    startedAt: number(),
  }),
  object({
    state: literal("connected"),
    projectId: string(),
    projectSlug: string(),
    deploymentName: string(),
    connectedAt: number(),
  }),
  object({
    state: literal("failed"),
    runId: id("appProvisioningRuns"),
    failedAt: number(),
  }),
);
export type VaultConvexState = Infer<typeof vVaultConvexState>;

export const vVaultCloudflareState = union(
  object({
    state: literal("not_configured"),
  }),
  object({
    state: literal("provisioning"),
    runId: id("appProvisioningRuns"),
    startedAt: number(),
  }),
  object({
    state: literal("connected"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    productionUrl: string(),
    connectedAt: number(),
  }),
  object({
    state: literal("failed"),
    runId: id("appProvisioningRuns"),
    failedAt: number(),
  }),
);
export type VaultCloudflareState = Infer<typeof vVaultCloudflareState>;

/**
 * Compatibility fields from the pre-vault-first vault row. They stay on every
 * vault state in Phase 1 so existing reads and mutations do not need a second
 * migration while the primary state model changes. Most of these only make
 * sense after GitHub is connected.
 *
 * TODO(Vault-First cleanup): move repo refresh, Codespace, and devcontainer
 * state into connected-only state or vault-scoped tables once that follow-up
 * project owns the callsites.
 */
const vaultOperationalFields = {
  userId: id("users"),
  deletion: vVaultDeletionState,
  lastTreeRefreshAt: optional(number()),
  treeRefreshStartedAt: optional(number()),
  lastTreeRefreshFailedAt: optional(number()),
  treeRefreshFailureKind: optional(vTreeRefreshFailureKind),
  treeRefreshFailureMessage: optional(string()),
  treeRefreshCooldownUntil: optional(number()),
  activeCodespaceId: optional(id("codespaces")),
  devcontainerConfig: optional(string()),
} as const;

const connectedRepositoryIdentityFields = {
  ghRepoId: string(),
  defaultBranch: string(),
} as const;

export const vVaultRow = union(
  object({
    ...vaultOperationalFields,
    state: literal("not_connected"),
  }),
  object({
    ...vaultOperationalFields,
    state: literal("provisioning"),
    githubMode: literal("create_repository"),
    runId: id("appProvisioningRuns"),
    startedAt: number(),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("provisioning"),
    githubMode: literal("connect_existing_repository"),
    runId: id("appProvisioningRuns"),
    startedAt: number(),

    ...githubRepositoryCoordinatesFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("connected"),
    githubMode: literal("create_repository"),
    runId: id("appProvisioningRuns"),
    ...connectedRepositoryIdentityFields,
    convex: vVaultConvexState,
    cloudflare: vVaultCloudflareState,
    connectedAt: number(),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("connected"),
    githubMode: literal("connect_existing_repository"),
    runId: id("appProvisioningRuns"),

    ...connectedRepositoryIdentityFields,
    convex: vVaultConvexState,
    cloudflare: vVaultCloudflareState,
    connectedAt: number(),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("failed"),
    githubMode: literal("create_repository"),
    runId: id("appProvisioningRuns"),
    failedAt: number(),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("failed"),
    githubMode: literal("connect_existing_repository"),
    runId: id("appProvisioningRuns"),
    failedAt: number(),

    ...githubRepositoryCoordinatesFields,
  }),
);
export type VaultRow = Infer<typeof vVaultRow>;
