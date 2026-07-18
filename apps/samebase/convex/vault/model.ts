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

export const vVaultConvexOrigin = union(literal("provisioned"), literal("selected_existing"));
export type VaultConvexOrigin = Infer<typeof vVaultConvexOrigin>;

export const vVaultConvexConnectionTarget = union(
  object({
    mode: literal("connect_existing_project"),
    appId: id("vaultApps"),
    projectId: string(),
  }),
  object({
    mode: literal("create_project"),
    appId: id("vaultApps"),
    projectName: string(),
  }),
);
export type VaultConvexConnectionTarget = Infer<typeof vVaultConvexConnectionTarget>;

export const vVaultRootDirectory = string();
export type VaultRootDirectory = Infer<typeof vVaultRootDirectory>;

export const vVaultApp = object({
  vaultId: id("vaults"),
  userId: id("users"),
  rootDirectory: vVaultRootDirectory,
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
  appId: id("vaultApps"),
  projectId: string(),
  teamSlug: string(),
  projectSlug: string(),
  deploymentName: string(),
  deploymentType: literal("prod"),
  cloudUrl: string(),
  siteUrl: string(),
  origin: vVaultConvexOrigin,
  upstream: optional(vVaultProviderUpstreamPresence),
  connectedAt: number(),
  lastObservedAt: number(),
});
export type VaultConvexDeployment = Infer<typeof vVaultConvexDeployment>;

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
export type VaultCloudflareWorkersBuildTrigger = Infer<typeof vVaultCloudflareWorkersBuildTrigger>;

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
export type VaultCloudflareBuilds = Infer<typeof vVaultCloudflareBuilds>;

export const vVaultCloudflareWorker = object({
  vaultId: id("vaults"),
  userId: id("users"),
  appId: id("vaultApps"),
  accountId: string(),
  workerName: string(),
  workerTag: string(),
  workersDevUrl: optional(string()),
  origin: vVaultCloudflareOrigin,
  upstream: optional(vVaultProviderUpstreamPresence),
  builds: vVaultCloudflareBuilds,
  connectedAt: number(),
  lastObservedAt: number(),
});
export type VaultCloudflareWorker = Infer<typeof vVaultCloudflareWorker>;

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
export type VaultWorkerDeploymentWiring = Infer<typeof vVaultWorkerDeploymentWiring>;

export const vVaultWorkerDeploymentDependency = object({
  vaultId: id("vaults"),
  userId: id("users"),
  workerId: id("vaultCloudflareWorkers"),
  convexDeploymentId: id("vaultConvexDeployments"),
  wiring: vVaultWorkerDeploymentWiring,
  createdAt: number(),
  updatedAt: number(),
});
export type VaultWorkerDeploymentDependency = Infer<typeof vVaultWorkerDeploymentDependency>;

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
