import { Infer, v } from "convex/values";
import { parseRepositoryFullName } from "../../shared/repoName";
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";
import { vVaultDeletionState } from "./deletion/model";
export { parseRepositoryFullName };

const { array, boolean, id, literal, number, object, optional, string, union } = v;

export const VAULT_DEVCONTAINER_CONFIG_MAX_LENGTH = 32_000;
export const VAULT_TREE_REFRESH_FAILURE_MESSAGE_MAX_LENGTH = 4_000;

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

const samebaseRepositoryRouteFields = {
  routeRepositoryKey: string(),
  routeOwner: string(),
  routeName: string(),
} as const;

/**
 * Repository keys are the case-insensitive Samebase route identity captured at
 * connection time. Stable GitHub ids are the provider identity. Connected
 * vaults store the latest verified GitHub owner/name separately.
 */
export function normalizeRepositoryRouteKey(repositoryFullName: string): string {
  const { owner, name } = parseRepositoryFullName(repositoryFullName);
  return `${owner.toLowerCase()}/${name.toLowerCase()}`;
}

/**
 * Visibility is separate from coordinates because owner/name identify the repo
 * target even when visibility is not known yet. Create-repository states use it
 * as requested intent; connected states use it as the latest GitHub metadata
 * observed by Samebase.
 */
const samebaseRepositoryRouteWithVisibilityFields = {
  ...samebaseRepositoryRouteFields,
  visibility: vGitHubRepositoryVisibility,
} as const;

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
export type ConvexDeployKeys = Infer<typeof vConvexDeployKeys>;

export const vConvexPreviewDeployment = union(
  object({
    state: literal("not_ensured"),
  }),
  object({
    state: literal("ready"),
    deploymentName: string(),
    cloudUrl: string(),
  }),
);
export type ConvexPreviewDeployment = Infer<typeof vConvexPreviewDeployment>;

export const vVaultConvexAppRoot = string();
export type VaultConvexAppRoot = Infer<typeof vVaultConvexAppRoot>;

export const vVaultApp = object({
  vaultId: id("vaults"),
  userId: id("users"),
  appRoot: string(),
  createdAt: number(),
});
export type VaultApp = Infer<typeof vVaultApp>;

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

export const vVaultConvexDeployment = object({
  vaultId: id("vaults"),
  userId: id("users"),
  appRoot: vVaultConvexAppRoot,
  projectId: string(),
  teamSlug: string(),
  projectSlug: string(),
  deploymentName: string(),
  deploymentType: literal("prod"),
  cloudUrl: string(),
  siteUrl: string(),
  previewDeployment: vConvexPreviewDeployment,
  deployKeys: vConvexDeployKeys,
  origin: vVaultConvexOrigin,
  upstream: optional(vVaultProviderUpstreamPresence),
  connectedAt: number(),
  lastObservedAt: number(),
});
export type VaultConvexDeployment = Infer<typeof vVaultConvexDeployment>;

export const vVaultCloudflareOrigin = union(literal("provisioned"), literal("selected_existing"));
export type VaultCloudflareOrigin = Infer<typeof vVaultCloudflareOrigin>;

export const vVaultCloudflareAppRoot = string();
export type VaultCloudflareAppRoot = Infer<typeof vVaultCloudflareAppRoot>;

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
      : [`${appRoot}/*`, ".node-version", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];

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
export type VaultCloudflareWorkersBuildTrigger = Infer<typeof vVaultCloudflareWorkersBuildTrigger>;

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
export type VaultCloudflareBuilds = Infer<typeof vVaultCloudflareBuilds>;

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

export const vVaultCloudflareWorker = object({
  vaultId: id("vaults"),
  userId: id("users"),
  appRoot: vVaultCloudflareAppRoot,
  accountId: string(),
  workerName: string(),
  workerTag: string(),
  workersDevUrl: optional(string()),
  origin: vVaultCloudflareOrigin,
  upstream: optional(vVaultProviderUpstreamPresence),
  deployment: vVaultCloudflareDeployment,
  connectedAt: number(),
  lastObservedAt: number(),
});
export type VaultCloudflareWorker = Infer<typeof vVaultCloudflareWorker>;

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

const githubRepositoryDatabaseIdentityFields = {
  ghRepoId: string(),
} as const;

const connectedRepositoryIdentityFields = {
  ...githubRepositoryDatabaseIdentityFields,
  ghRepoNodeId: string(),
  githubOwner: string(),
  githubName: string(),
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

    ...samebaseRepositoryRouteWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("provisioning"),
    githubMode: literal("connect_existing_repository"),
    runId: id("appProvisioningRuns"),
    startedAt: number(),

    ...githubRepositoryDatabaseIdentityFields,
    ...samebaseRepositoryRouteFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("connected"),
    githubMode: literal("create_repository"),
    runId: id("appProvisioningRuns"),
    ...connectedRepositoryIdentityFields,
    connectedAt: number(),

    ...samebaseRepositoryRouteWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("connected"),
    githubMode: literal("connect_existing_repository"),
    runId: id("appProvisioningRuns"),

    ...connectedRepositoryIdentityFields,
    connectedAt: number(),

    ...samebaseRepositoryRouteWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("failed"),
    githubMode: literal("create_repository"),
    runId: id("appProvisioningRuns"),
    failedAt: number(),

    ...samebaseRepositoryRouteWithVisibilityFields,
  }),
  object({
    ...vaultOperationalFields,
    state: literal("failed"),
    githubMode: literal("connect_existing_repository"),
    runId: id("appProvisioningRuns"),
    failedAt: number(),

    ...githubRepositoryDatabaseIdentityFields,
    ...samebaseRepositoryRouteFields,
  }),
);
export type VaultRow = Infer<typeof vVaultRow>;
