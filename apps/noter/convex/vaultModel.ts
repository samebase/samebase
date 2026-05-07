import { Infer, v } from "convex/values";
import { hostingProviderValidator } from "./hostingState";

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
  /** GitHub user or organization owner. */
  owner: string(),

  /** GitHub repository name. */
  name: string(),
} as const;

const githubRepositoryWithVisibilityFields = {
  ...githubRepositoryCoordinatesFields,

  // NIT: Why do we have a separate type for this and don't just include visibility in githubRepositoryCoordinatesFields?
  /** Repository visibility, either requested intent or current GitHub metadata. */
  visibility: GitHubRepositoryVisibility,
} as const;

export const VaultConvexState = union(
  object({
    /** Convex has not been provisioned for this connected repository. */
    state: literal("not_configured"),
  }),
  object({
    /** Convex provisioning is running for this connected repository. */
    state: literal("provisioning"),

    /** Durable workflow run that owns this Convex provisioning attempt. */
    runId: id("appProvisioningRuns"),

    /** Timestamp when this Convex provisioning attempt started. */
    startedAt: number(),
  }),
  object({
    /** Convex infrastructure is connected for this repository. */
    state: literal("connected"),

    /** Convex project id used for management API calls. */
    projectId: string(),

    /** Convex project slug used for dashboard links. */
    projectSlug: string(),

    /** Convex deployment name used for dashboard links and env updates. */
    deploymentName: string(),

    /** Timestamp when Convex first became connected for this vault. */
    connectedAt: number(),
  }),
  object({
    /** Latest Convex provisioning attempt failed. */
    state: literal("failed"),

    /** Durable workflow run that recorded this failure. */
    runId: id("appProvisioningRuns"),

    // NIT: It looks like you seem forced to add a comment for each and every state, even though for most of them it makes sense already what they mean, right? It's clear what fail that means. I think just putting a comment for each and every one, and a comment of the same size, basically removes the benefit that it brings. It's never clear what actually requires the comment, because it's more complex and contains a lot of thinking behind it, and what's just a date, a failed at thing?
    /** Timestamp when the latest failure was recorded. */
    failedAt: number(),
  }),
);
export type VaultConvexState = Infer<typeof VaultConvexState>;

export const VaultHostingState = union(
  object({
    /** Hosting has not been provisioned for this connected repository. */
    state: literal("not_configured"),
  }),
  object({
    /** Cloudflare hosting provisioning is running for this connected repository. */
    state: literal("provisioning"),
    provider: hostingProviderValidator,

    /** Durable workflow run that owns this hosting provisioning attempt. */
    runId: id("appProvisioningRuns"),

    /** Timestamp when this hosting provisioning attempt started. */
    startedAt: number(),
  }),
  object({
    /** Cloudflare hosting is connected for this repository. */
    state: literal("connected"),
    provider: hostingProviderValidator,

    /** Cloudflare account id used for API calls and dashboard links. */
    accountId: string(),

    /** Cloudflare Pages project name used for API calls and dashboard links. */
    projectName: string(),

    /** Production URL for the connected hosting provider. */
    productionUrl: string(),

    /** Timestamp when hosting first became connected for this vault. */
    connectedAt: number(),
  }),
  object({
    /** Latest Cloudflare hosting provisioning attempt failed. */
    state: literal("failed"),
    provider: hostingProviderValidator,

    /** Durable workflow run that recorded this failure. */
    runId: id("appProvisioningRuns"),

    /** Timestamp when the latest failure was recorded. */
    failedAt: number(),
  }),
);
export type VaultHostingState = Infer<typeof VaultHostingState>;

const vaultOperationalFields = {
  /** Ownership and authorization boundary for the vault. */
  userId: id("users"),

  /** Tree refresh mutex timestamp for repo-backed refreshes. */
  lastTreeRefreshAt: optional(number()),

  /** Tree refresh mutex claim timestamp for repo-backed refreshes. */
  treeRefreshStartedAt: optional(number()),

  /** Timestamp of the latest tree refresh failure. */
  lastTreeRefreshFailedAt: optional(number()),

  /** Failure kind for the latest tree refresh failure. */
  treeRefreshFailureKind: optional(TreeRefreshFailureKind),

  /** User-safe message for the latest tree refresh failure. */
  treeRefreshFailureMessage: optional(string()),

  /** Cooldown deadline after a rate-limited tree refresh failure. */
  treeRefreshCooldownUntil: optional(number()),

  /** Active Codespace row linked to this vault, when one exists. */
  activeCodespaceId: optional(id("codespaces")),

  /** Serialized devcontainer configuration for Codespace creation. */
  devcontainerConfig: optional(string()),
} as const;

export const VaultRow = union(
  object({
    // NIT: So, it's possible to have a vault that's not connected yet to anything, and it has all this tree refresh stuff. It's a bit confusing. I know they're optional, but I'm wondering if these vault operational fields need to be so high up inside the vault? Were they already here? I mean, what's the status with them? During our discussions, you never mentioned that we have so many cooldowns and messages, failure kinds, all of that stuff.
    ...vaultOperationalFields,

    /** Explicit empty state for future manual connection flows. */
    state: literal("not_connected"),
  }),
  object({
    ...vaultOperationalFields,

    /** GitHub repository creation is in progress for this vault. */
    state: literal("provisioning"),

    /** Distinguishes create-repo provisioning from existing-repo connection. */
    githubMode: literal("create_repository"),

    /** Durable run that owns the in-flight create-repository operation. */
    runId: id("appProvisioningRuns"),

    /** Timestamp when this GitHub provisioning attempt started. */
    startedAt: number(),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,

    /** Existing GitHub repository connection is in progress for this vault. */
    state: literal("provisioning"),

    /** Distinguishes existing-repo connection from repository creation. */
    githubMode: literal("connect_existing_repository"),

    /** Durable run that owns the in-flight existing-repo connection. */
    runId: id("appProvisioningRuns"),

    /** Timestamp when this GitHub connection attempt started. */
    startedAt: number(),

    ...githubRepositoryCoordinatesFields,
  }),
  object({
    ...vaultOperationalFields,

    /** Noter created the GitHub repo; repo-backed vault behavior is allowed. */
    state: literal("connected"),

    /** Records that this vault came from Noter-managed repository creation. */
    githubMode: literal("create_repository"),

    /** Durable run that established this GitHub connection. */
    runId: id("appProvisioningRuns"),

    /** Immutable GitHub repository id; prevents in-place repo replacement. */
    ghRepoId: string(),

    /** Default branch for source views and initial tree sync. */
    defaultBranch: string(),

    /** Default-branch tree SHA retained until branch tree reads own this fully. */
    treeSHA: string(),

    /** Default-branch commit SHA retained until branch tree reads own this fully. */
    commitSHA: optional(string()),

    /** Default-branch tree cache retained for current source reads. */
    treeData: GithubTreeData,

    /** Convex infrastructure state, only valid after GitHub is connected. */
    convex: VaultConvexState,

    /** Hosting infrastructure state, only valid after GitHub is connected. */
    hosting: VaultHostingState,

    /** Timestamp when the vault first became a usable source workspace. */
    connectedAt: number(),

    // Again, I don't remember that we ever discussed this infra state, infra last error, infra last provision that, infra provision started at, and all of this stuff. Can we actually discuss this, because we discussed a lot when building the spec, and this was never talked about?
    /** Current infrastructure summary mirrored for existing dashboard reads. */
    infraState: InfraState,

    /** Latest infrastructure error; absent means no current stored error. */
    infraLastError: optional(string()),

    /** Latest completed infrastructure attempt; absent until one finishes. */
    infraLastProvisionedAt: optional(number()),

    /** Active infrastructure attempt start; absent when none is running. */
    infraProvisioningStartedAt: optional(number()),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,

    /** Existing GitHub repo is connected; repo-backed vault behavior is allowed. */
    state: literal("connected"),

    /** Records that this vault attached an existing GitHub repository. */
    githubMode: literal("connect_existing_repository"),

    // TODO(Vault-First Phase 5): add runId when existing-repository
    // onboarding moves onto provisioning runs.

    /** Immutable GitHub repository id; prevents in-place repo replacement. */
    ghRepoId: string(),

    /** Default branch for source views and initial tree sync. */
    defaultBranch: string(),

    /** Default-branch tree SHA retained until branch tree reads own this fully. */
    treeSHA: string(),

    /** Default-branch commit SHA retained until branch tree reads own this fully. */
    commitSHA: optional(string()),

    /** Default-branch tree cache retained for current source reads. */
    treeData: GithubTreeData,

    /** Convex infrastructure state, only valid after GitHub is connected. */
    convex: VaultConvexState,

    /** Hosting infrastructure state, only valid after GitHub is connected. */
    hosting: VaultHostingState,

    /** Timestamp when the vault first became a usable source workspace. */
    connectedAt: number(),

    /** Current infrastructure summary mirrored for existing dashboard reads. */
    infraState: InfraState,

    /** Latest infrastructure error; absent means no current stored error. */
    infraLastError: optional(string()),

    /** Latest completed infrastructure attempt; absent until one finishes. */
    infraLastProvisionedAt: optional(number()),

    /** Active infrastructure attempt start; absent when none is running. */
    infraProvisioningStartedAt: optional(number()),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,

    /** Latest GitHub repository creation attempt failed. */
    state: literal("failed"),

    /** Failed GitHub operation kind; selects the valid retry behavior. */
    githubMode: literal("create_repository"),

    /** Durable run that recorded the failure. */
    runId: id("appProvisioningRuns"),

    /** Timestamp when the latest failure was recorded. */
    failedAt: number(),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,

    /** Latest existing GitHub repository connection attempt failed. */
    state: literal("failed"),

    /** Failed GitHub operation kind; selects the valid retry behavior. */
    githubMode: literal("connect_existing_repository"),

    /** Durable run that recorded the failure. */
    runId: id("appProvisioningRuns"),

    /** Timestamp when the latest failure was recorded. */
    failedAt: number(),

    ...githubRepositoryCoordinatesFields,
  }),
);
export type VaultRow = Infer<typeof VaultRow>;
