import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";
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

/**
 * GitHub visibility values currently supported by Samebase's create and connect
 * flows.
 */
export const vGitHubRepositoryVisibility = union(literal("private"), literal("public"));

export const vTreeRefreshFailureKind = union(literal("failed"), literal("rate_limited"));
export type TreeRefreshFailureKind = Infer<typeof vTreeRefreshFailureKind>;

/**
 * Visibility is separate from coordinates because owner/name identify the repo
 * target even when visibility is not known yet. Create-repository states use it
 * as requested intent; connected states use it as the latest GitHub metadata
 * observed by Samebase.
 */
export const vVaultConvexOrigin = union(literal("provisioned"), literal("selected_existing"));
export type VaultConvexOrigin = Infer<typeof vVaultConvexOrigin>;

export const vVaultConvexConnectionTarget = union(
  object({
    mode: literal("connect_existing_project"),
    appRoot: string(),
    projectId: string(),
  }),
  object({
    mode: literal("create_project"),
    appRoot: string(),
    projectName: string(),
  }),
);
export type VaultConvexConnectionTarget = Infer<typeof vVaultConvexConnectionTarget>;

export const vConvexDeployKeyState = union(
  object({
    state: literal("not_created"),
  }),
  object({
    state: literal("created"),
    id: string(),
  }),
);
export type ConvexDeployKeyState = Infer<typeof vConvexDeployKeyState>;

export const vConvexDeployKeys = object({
  production: vConvexDeployKeyState,
  preview: vConvexDeployKeyState,
});

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
  upstream?: VaultProviderUpstreamPresence;
};

export function readVaultProviderUpstreamPresence(
  row: VaultProviderUpstreamCarrier,
): VaultProviderUpstreamPresence {
  return row.upstream ?? VAULT_PROVIDER_UPSTREAM_PRESENT;
}

export function isVaultProviderUpstreamPresent(row: VaultProviderUpstreamCarrier): boolean {
  return readVaultProviderUpstreamPresence(row).state === "present";
}

export const vVaultCloudflareOrigin = union(literal("provisioned"), literal("selected_existing"));
export type VaultCloudflareOrigin = Infer<typeof vVaultCloudflareOrigin>;

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

export function buildVaultCloudflareBuildConfigForAppRoot(args: {
  appRoot: string;
}): VaultCloudflareBuildConfig {
  const appRoot = normalizeVaultAppRoot(args.appRoot);
  const rootDirectory = appRoot === "." ? "/" : appRoot;
  const pathIncludes =
    appRoot === "."
      ? ["*"]
      : [
          `${appRoot}/*`,
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

export const vVaultCloudflareWorkersBuildTrigger = object({
  triggerUuid: string(),
  buildTokenUuid: string(),
});

export const vVaultCloudflareConnectedBuilds = object({
  state: literal("connected"),
  ...vaultCloudflareBuildConfigFields,
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

export const vVaultCloudflareConvexBuildAccess = union(
  object({
    state: literal("not_wired"),
  }),
  object({
    state: literal("wired"),
  }),
);
export type VaultCloudflareConvexBuildAccess = Infer<typeof vVaultCloudflareConvexBuildAccess>;

export const vVaultCloudflareDeployment = object({
  builds: vVaultCloudflareBuilds,
  convexBuildAccess: vVaultCloudflareConvexBuildAccess,
});
export type VaultCloudflareDeployment = Infer<typeof vVaultCloudflareDeployment>;

export function buildVaultCloudflareDeploymentNotConfigured(): VaultCloudflareDeployment {
  return {
    builds: { state: "not_connected" },
    convexBuildAccess: { state: "not_wired" },
  };
}

export function buildVaultCloudflareDeploymentWithConnectedBuilds(args: {
  builds: VaultCloudflareConnectedBuilds;
  convexBuildAccess: VaultCloudflareConvexBuildAccess;
}): VaultCloudflareDeployment {
  return {
    builds: args.builds,
    convexBuildAccess: args.convexBuildAccess,
  };
}

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
export const vaultTables = {
  /** Durable app containers with explicit repository connection states. */
  vaults: defineTable(
    union(
      object({
        state: literal("not_connected"),
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
      }),
      object({
        state: literal("provisioning"),
        githubMode: literal("create_repository"),
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
        runId: id("workflow_vaultProvisioning_runs"),
        startedAt: number(),
        owner: string(),
        name: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("provisioning"),
        githubMode: literal("connect_existing_repository"),
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
        runId: id("workflow_vaultProvisioning_runs"),
        startedAt: number(),
        owner: string(),
        name: string(),
      }),
      object({
        state: literal("connected"),
        githubMode: literal("create_repository"),
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
        runId: id("workflow_vaultProvisioning_runs"),
        ghRepoId: string(),
        defaultBranch: string(),
        connectedAt: number(),
        owner: string(),
        name: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("connected"),
        githubMode: literal("connect_existing_repository"),
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
        runId: id("workflow_vaultProvisioning_runs"),
        ghRepoId: string(),
        defaultBranch: string(),
        connectedAt: number(),
        owner: string(),
        name: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("failed"),
        githubMode: literal("create_repository"),
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
        runId: id("workflow_vaultProvisioning_runs"),
        failedAt: number(),
        owner: string(),
        name: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("failed"),
        githubMode: literal("connect_existing_repository"),
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
        runId: id("workflow_vaultProvisioning_runs"),
        failedAt: number(),
        owner: string(),
        name: string(),
      }),
    ),
  )
    .index("by_userId", ["userId"])
    .index("by_userId_and_state_and_deletion_state", ["userId", "state", "deletion.state"])
    .index("by_userId_and_ghRepoId", ["userId", "ghRepoId"])
    .index("by_owner_and_name", ["owner", "name"])
    .index("by_userId_and_owner_and_name", ["userId", "owner", "name"]),

  /** Stable app identities inside a repository-backed vault, identified by Cloudflare's root directory. */
  vaultApps: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    rootDirectory: string(),
    createdAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_vault_and_root_directory", ["vaultId", "rootDirectory"]),

  /** Cloudflare Workers connected to deployable app roots in a vault. */
  vaultCloudflareWorkers: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDevUrl: optional(string()),
    origin: vVaultCloudflareOrigin,
    upstream: optional(vVaultProviderUpstreamPresence),
    deployment: vVaultCloudflareDeployment,
    connectedAt: number(),
    lastObservedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_vault_and_appRoot", ["vaultId", "appRoot"])
    .index("by_vault_and_account_and_worker", ["vaultId", "accountId", "workerName"]),

  /** Convex deployments connected to a repository-backed vault. */
  vaultConvexDeployments: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    appRoot: string(),
    projectId: string(),
    teamSlug: string(),
    projectSlug: string(),
    deploymentName: string(),
    deploymentType: literal("prod"),
    cloudUrl: string(),
    siteUrl: string(),
    previewDeployment: union(
      object({
        state: literal("not_ensured"),
      }),
      object({
        state: literal("ready"),
        deploymentName: string(),
        cloudUrl: string(),
      }),
    ),
    deployKeys: vConvexDeployKeys,
    origin: vVaultConvexOrigin,
    upstream: optional(vVaultProviderUpstreamPresence),
    connectedAt: number(),
    lastObservedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_vault_and_appRoot", ["vaultId", "appRoot"])
    .index("by_vault_and_project", ["vaultId", "projectId"]),

  /** Branch-to-domain mappings observed or provisioned for a vault. */
  vaultDomains: defineTable({
    vaultId: id("vaults"),
    branch: string(),
    kind: union(literal("main"), literal("branch_preview")),
    url: string(),
    source: union(
      literal("cloudflare_workers_default"),
      literal("cloudflare_workers_custom"),
      literal("cloudflare_workers_preview"),
    ),
    active: boolean(),
    lastSyncedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_branch", ["vaultId", "branch"]),
};
