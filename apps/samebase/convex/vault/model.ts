import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { parseRepositoryFullName } from "../../shared/repoName";
import { normalizeVaultRootDirectory, VAULT_ROOT_DIRECTORY } from "../../shared/vaultRootDirectory";
import { vVaultDeletionState } from "./deletion/model";
import { vConvexDeployKeys, vCreatedConvexDeployKeys } from "./deployKeyModel";
export {
  vConvexDeployKeys,
  vConvexPreviewDeployKeyState,
  vConvexProductionDeployKeyState,
  type ConvexDeployKeys,
  type ConvexPreviewDeployKeyState,
  type ConvexProductionDeployKeyState,
} from "./deployKeyModel";
export { parseRepositoryFullName };

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
export type GitHubRepositoryVisibility = Infer<typeof vGitHubRepositoryVisibility>;

export const vTreeRefreshFailureKind = union(literal("failed"), literal("rate_limited"));
export type TreeRefreshFailureKind = Infer<typeof vTreeRefreshFailureKind>;

const githubRepositoryCoordinatesFields = {
  owner: string(),
  name: string(),
} as const;

/**
 * Visibility is separate from coordinates because owner/name identify the repo
 * target even when visibility is not known yet. Create-repository states use it
 * as requested intent; connected states use it as the latest GitHub metadata
 * observed by Samebase.
 */
const githubRepositoryWithVisibilityFields = {
  ...githubRepositoryCoordinatesFields,
  visibility: vGitHubRepositoryVisibility,
} as const;

export const vVaultConvexConnectionTarget = union(
  object({
    mode: literal("connect_existing_project"),
    appId: id("vaultApps"),
    projectId: string(),
  }),
  object({
    mode: literal("create_project"),
    appId: id("vaultApps"),
    teamId: string(),
    projectName: string(),
  }),
);
export type VaultConvexConnectionTarget = Infer<typeof vVaultConvexConnectionTarget>;

export const vVaultRootDirectory = string();

export const vVaultProviderUpstreamPresence = union(
  object({
    state: literal("present"),
  }),
  object({
    state: literal("missing_upstream"),
  }),
);
export type VaultProviderUpstreamPresence = Infer<typeof vVaultProviderUpstreamPresence>;

export const VAULT_PROVIDER_UPSTREAM_PRESENT = {
  state: "present",
} as const satisfies VaultProviderUpstreamPresence;

export const VAULT_PROVIDER_UPSTREAM_MISSING = {
  state: "missing_upstream",
} as const satisfies VaultProviderUpstreamPresence;

type VaultProviderUpstreamCarrier = {
  upstream: VaultProviderUpstreamPresence;
};

export function isVaultProviderUpstreamPresent(row: VaultProviderUpstreamCarrier): boolean {
  return row.upstream.state === "present";
}

export const vVaultWorkersDevAvailability = union(
  object({
    state: literal("available"),
    url: string(),
  }),
  object({
    state: literal("disabled"),
  }),
  object({
    state: literal("unknown"),
  }),
);
export type VaultWorkersDevAvailability = Infer<typeof vVaultWorkersDevAvailability>;

export const vVaultCloudflareWorkerCreationLifecycle = union(
  object({
    state: literal("creating"),
  }),
  object({
    state: literal("created"),
    workerTag: string(),
  }),
);

export const vVaultConvexProjectCreationLifecycle = union(
  object({
    state: literal("creating"),
  }),
  object({
    state: literal("created"),
    projectId: string(),
  }),
);

export const vVaultCloudflareOrigin = union(literal("provisioned"), literal("selected_existing"));
export type VaultCloudflareOrigin = Infer<typeof vVaultCloudflareOrigin>;

const vaultCloudflareBuildSettingsFields = {
  buildCommand: string(),
  deployCommand: string(),
  previewDeployCommand: string(),
  pathIncludes: array(string()),
  pathExcludes: array(string()),
} as const;
export const vVaultCloudflareBuildConfig = object({
  rootDirectory: vVaultRootDirectory,
  ...vaultCloudflareBuildSettingsFields,
});
export type VaultCloudflareBuildConfig = Infer<typeof vVaultCloudflareBuildConfig>;

export function buildVaultCloudflareBuildConfig(args: {
  rootDirectory: string;
  dependencyRootDirectories: string[];
}): VaultCloudflareBuildConfig {
  const rootDirectory = normalizeVaultRootDirectory(args.rootDirectory);
  const dependencyRootDirectories = [
    ...new Set(args.dependencyRootDirectories.map(normalizeVaultRootDirectory)),
  ]
    .filter((dependencyRootDirectory) => dependencyRootDirectory !== rootDirectory)
    .sort();
  const watchedRootDirectories = [rootDirectory, ...dependencyRootDirectories];
  const pathIncludes = watchedRootDirectories.includes(VAULT_ROOT_DIRECTORY)
    ? ["*"]
    : [
        `${rootDirectory}/*`,
        ".node-version",
        ".nvmrc",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        ...dependencyRootDirectories.map(
          (dependencyRootDirectory) => `${dependencyRootDirectory}/*`,
        ),
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

export const vVaultCloudflareWorkersBuildTrigger = object({
  triggerUuid: string(),
  buildTokenUuid: string(),
});

export const vVaultCloudflareConnectedBuilds = object({
  state: literal("connected"),
  ...vaultCloudflareBuildSettingsFields,
  production: vVaultCloudflareWorkersBuildTrigger,
  preview: vVaultCloudflareWorkersBuildTrigger,
});
export type VaultCloudflareConnectedBuilds = Infer<typeof vVaultCloudflareConnectedBuilds>;

export const vVaultCloudflareBuilds = union(
  object({
    state: literal("not_connected"),
  }),
  vVaultCloudflareConnectedBuilds,
);

/**
 * Whether the stored deploy-key pair finished applying to its recorded
 * provider targets. This is provider cleanup evidence, not current
 * relationship truth. Call `isWorkerDeploymentDependencyCurrentlyWired` with
 * the attached deployment before presenting the relationship as wired.
 */
export const vVaultWorkerDeploymentWiring = union(
  object({
    state: literal("not_wired"),
    deployKeys: vConvexDeployKeys,
  }),
  object({
    state: literal("wired"),
    deployKeys: vCreatedConvexDeployKeys,
  }),
);

/**
 * The app resource graph is kept together so its stored facts and lookup paths
 * can be reviewed as one model. Reusable nested states remain named above;
 * schema-only row validators stay inline here.
 */
export const vaultAppResourceTables = {
  /**
   * Stable app identities inside a repo-backed vault. An app remains visible
   * without a provider resource; "/" is the repository-root app.
   */
  vaultApps: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    rootDirectory: vVaultRootDirectory,
    createdAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_vault_and_root_directory", ["vaultId", "rootDirectory"]),

  /**
   * Durable ownership reserved before Samebase asks Cloudflare to create a
   * Worker. `creating` deliberately means the provider call may or may not
   * have succeeded. A validated provider response advances the claim to
   * `created`; successful Worker attachment consumes the claim atomically.
   */
  vaultCloudflareWorkerCreationClaims: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
    runId: id("appProvisioningRuns"),
    accountId: string(),
    workerName: string(),
    lifecycle: vVaultCloudflareWorkerCreationLifecycle,
    createdAt: number(),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_run", ["runId"])
    .index("by_account_and_worker", ["accountId", "workerName"])
    .index("by_account_and_worker_tag", ["accountId", "lifecycle.workerTag"]),

  /**
   * Durable ownership reserved before Samebase asks Convex to create a
   * project. The claim remains separate from an attached production
   * deployment and is consumed only when that deployment is attached.
   */
  vaultConvexProjectCreationClaims: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
    runId: id("appProvisioningRuns"),
    teamId: string(),
    projectName: string(),
    lifecycle: vVaultConvexProjectCreationLifecycle,
    createdAt: number(),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_run", ["runId"])
    .index("by_team_and_project_name", ["teamId", "projectName"])
    .index("by_project", ["lifecycle.projectId"]),

  /**
   * Cloudflare Worker resources attached to stable app identities. More than
   * one Worker may attach to the same app.
   */
  vaultCloudflareWorkers: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDev: vVaultWorkersDevAvailability,
    origin: vVaultCloudflareOrigin,
    upstream: vVaultProviderUpstreamPresence,
    builds: vVaultCloudflareBuilds,
    connectedAt: number(),
    lastObservedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_app", ["appId"])
    .index("by_account_and_worker", ["accountId", "workerName"])
    .index("by_account_and_worker_tag", ["accountId", "workerTag"]),

  /**
   * Convex production deployment resources attached to stable app identities.
   *
   * TODO: Let an app explicitly include member-scoped Convex development
   * deployments when Samebase adds that user story. Extend or split this
   * production-only model with provider member identity; development
   * deployments must never substitute for branch previews.
   */
  vaultConvexDeployments: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
    teamId: string(),
    projectId: string(),
    teamSlug: string(),
    projectSlug: string(),
    deploymentName: string(),
    deploymentType: literal("prod"),
    cloudUrl: string(),
    siteUrl: string(),
    origin: union(literal("provisioned"), literal("selected_existing")),
    upstream: vVaultProviderUpstreamPresence,
    connectedAt: number(),
    lastObservedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_app", ["appId"])
    .index("by_project", ["projectId"]),

  /**
   * An explicit build-time dependency from one Worker to one Convex
   * deployment. A Worker has at most one dependency row; a Convex deployment
   * may be shared by several Workers.
   */
  vaultWorkerDeploymentDependencies: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexDeploymentId: id("vaultConvexDeployments"),
    wiring: vVaultWorkerDeploymentWiring,
    createdAt: number(),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_worker", ["workerId"])
    .index("by_convex_deployment", ["convexDeploymentId"]),
};

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
    connectedAt: number(),

    ...githubRepositoryWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("connected"),
    githubMode: literal("connect_existing_repository"),
    runId: id("appProvisioningRuns"),

    ...connectedRepositoryIdentityFields,
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
