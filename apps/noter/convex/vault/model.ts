import { Infer, v } from "convex/values";
import { VaultDeletionState } from "./deletion/model";

const { array, boolean, id, literal, number, object, optional, string, union } =
  v;

export const GithubTree = object({
  path: string(),
  mode: string(),
  type: string(),
  sha: string(),
  size: optional(number()),
  url: optional(string()),
});
export type GithubTree = Infer<typeof GithubTree>;

export const GithubTreeData = object({
  sha: string(),
  url: optional(string()),
  truncated: boolean(),
  tree: array(GithubTree),
});
export type GithubTreeData = Infer<typeof GithubTreeData>;

export const InfraState = union(
  literal("not_started"),
  literal("provisioning"),
  literal("ready"),
  literal("failed"),
  literal("partial"),
);
export type InfraState = Infer<typeof InfraState>;

/**
 * GitHub visibility values currently supported by Noter's create and connect
 * flows.
 */
export const GitHubRepositoryVisibility = union(
  literal("private"),
  literal("public"),
);
export type GitHubRepositoryVisibility = Infer<
  typeof GitHubRepositoryVisibility
>;

export const TreeRefreshFailureKind = union(
  literal("failed"),
  literal("rate_limited"),
);
export type TreeRefreshFailureKind = Infer<typeof TreeRefreshFailureKind>;

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
  visibility: GitHubRepositoryVisibility,
} as const;

export const VaultConvexState = union(
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
export type VaultConvexState = Infer<typeof VaultConvexState>;

export const VaultCloudflareState = union(
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
    projectName: string(),
    productionUrl: string(),
    connectedAt: number(),
  }),
  object({
    state: literal("failed"),
    runId: id("appProvisioningRuns"),
    failedAt: number(),
  }),
);
export type VaultCloudflareState = Infer<typeof VaultCloudflareState>;

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
  deletion: VaultDeletionState,
  lastTreeRefreshAt: optional(number()),
  treeRefreshStartedAt: optional(number()),
  lastTreeRefreshFailedAt: optional(number()),
  treeRefreshFailureKind: optional(TreeRefreshFailureKind),
  treeRefreshFailureMessage: optional(string()),
  treeRefreshCooldownUntil: optional(number()),
  activeCodespaceId: optional(id("codespaces")),
  devcontainerConfig: optional(string()),
} as const;

const connectedRepositoryIdentityFields = {
  ghRepoId: string(),
  defaultBranch: string(),
} as const;

export const VaultRow = union(
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
    convex: VaultConvexState,
    cloudflare: VaultCloudflareState,
    connectedAt: number(),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("connected"),
    githubMode: literal("connect_existing_repository"),
    runId: id("appProvisioningRuns"),

    ...connectedRepositoryIdentityFields,
    convex: VaultConvexState,
    cloudflare: VaultCloudflareState,
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
export type VaultRow = Infer<typeof VaultRow>;
