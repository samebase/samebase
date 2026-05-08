import { v, type Infer } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  AppProvisioningRunStep,
  GitHubRepositoryVisibility,
  GithubTreeData,
  PullRequestLabel,
  TreeRefreshFailureKind,
} from "./schema";
import {
  hasStagedFileChanges,
  type StagedFileChangeCandidate,
} from "./stagingChanges";
import { type Doc, Id } from "./_generated/dataModel";
import { getUserId } from "./common";
import {
  hostingProviderValidator,
  hostingStateValidator,
} from "./hostingState";
import {
  assertConnectedVault,
  getConnectedVaultHostingProvider,
  hasConnectedVaultTreeSnapshot,
  isConnectedVault,
  isNoterManagedVault,
} from "./vaultState";
import {
  resolveCloudflareHostingState,
  resolveHostingMainUrl,
} from "./hostingStateHelpers";
import {
  doesTreeRefreshClaimMatch,
  getLastRepositoryMetadataRefreshAt,
  shouldPreserveTreeRefreshCooldownAfterSuccess,
  TREE_REFRESH_DEBOUNCE_MS,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../shared/treeRefresh";

const nullValidator = v.null();
const { array, boolean, id, literal, number, object, optional, string, union } =
  v;
const cloudflarePreviewMetadataFields = {
  cloudflareBranchPreviewUrl: optional(string()),
  cloudflarePreviewPullRequestNumber: optional(number()),
  cloudflarePreviewUrl: optional(string()),
  cloudflarePreviewCommitSha: optional(string()),
  cloudflarePreviewStatus: optional(string()),
  cloudflarePreviewLogsUrl: optional(string()),
  cloudflarePreviewCommentCreatedAt: optional(number()),
} as const;
const cloudflarePreviewMetadataValidator = object(
  cloudflarePreviewMetadataFields,
);
const treeRefreshFailureFields = {
  lastTreeRefreshFailedAt: optional(number()),
  treeRefreshFailureKind: optional(TreeRefreshFailureKind),
  treeRefreshFailureMessage: optional(string()),
  treeRefreshCooldownUntil: optional(number()),
} as const;
const sourceSetupSummary = union(
  object({
    status: literal("not_applicable"),
  }),
  object({
    status: literal("ready"),
  }),
  object({
    status: literal("running"),
    runId: id("appProvisioningRuns"),
    step: AppProvisioningRunStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    runId: id("appProvisioningRuns"),
    step: AppProvisioningRunStep,
    message: string(),
    updatedAt: number(),
  }),
);

type CloudflarePreviewMetadata = Infer<
  typeof cloudflarePreviewMetadataValidator
>;
type SourceSetupSummary = Infer<typeof sourceSetupSummary>;
type NoterManagedConnectedVault = Extract<
  Doc<"vaults">,
  { githubMode: "create_repository"; state: "connected" }
>;
const SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT = 20;

async function readLatestRunErrorMessage(
  ctx: Pick<QueryCtx, "db">,
  runId: Id<"appProvisioningRuns">,
): Promise<string | undefined> {
  const events = await ctx.db
    .query("appProvisioningEvents")
    .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
    .order("desc")
    .take(SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT);
  return events.find((event) => event.level === "error")?.message;
}

async function resolveSourceSetupSummary(
  ctx: Pick<QueryCtx, "db">,
  args: {
    hasUsableDefaultBranchTree: boolean;
    vault: NoterManagedConnectedVault;
  },
): Promise<SourceSetupSummary> {
  if (args.hasUsableDefaultBranchTree) {
    return { status: "ready" };
  }

  const run = await ctx.db.get(args.vault.runId);
  if (run?.state === "failed") {
    const message =
      (await readLatestRunErrorMessage(ctx, args.vault.runId)) ??
      run.lastError ??
      `Provisioning failed during ${run.currentStep}.`;
    return {
      status: "failed",
      runId: args.vault.runId,
      step: run.currentStep,
      message,
      updatedAt: run.updatedAt,
    };
  }

  if (run?.state !== "queued" && run?.state !== "running") {
    return { status: "not_applicable" };
  }

  return {
    status: "running",
    runId: args.vault.runId,
    step: run.currentStep,
    updatedAt: run.updatedAt,
  };
}

const vaultBranchFiltersValidator = object({
  vaultId: id("vaults"),
  hiddenLabels: array(string()),
  includeDrafts: boolean(),
  includeNoLabel: optional(boolean()),
  branchesExpanded: optional(boolean()),
});
type VaultBranchFilters = Infer<typeof vaultBranchFiltersValidator>;

/**
 * Dashboard URLs fail closed when provider metadata is partial. Trim before
 * checking presence and encode every segment before handing it to the browser.
 */
function buildCloudflareProjectDashboardUrl(
  infra: { hosting?: Infer<typeof hostingStateValidator> } | null | undefined,
): string | undefined {
  const hosting = resolveCloudflareHostingState(infra);
  if (!hosting) {
    return undefined;
  }

  const accountId = hosting.accountId.trim();
  const projectName = hosting.projectName.trim();
  if (accountId.length === 0 || projectName.length === 0) {
    return undefined;
  }

  return `https://dash.cloudflare.com/?to=/${encodeURIComponent(accountId)}/pages/view/${encodeURIComponent(projectName)}`;
}

/**
 * Convex dashboard URLs are only useful with real team/project/deploy slugs.
 * Return nothing for blank metadata so the dashboard never renders fake links.
 */
export function buildConvexDeploymentDashboardUrl(args: {
  deploymentName: string | undefined;
  projectSlug: string | undefined;
  teamSlug: string | undefined;
}): string | undefined {
  const normalizedTeamSlug = args.teamSlug?.trim();
  const normalizedProjectSlug = args.projectSlug?.trim();
  const normalizedDeploymentName = args.deploymentName?.trim();
  if (
    !normalizedTeamSlug ||
    !normalizedProjectSlug ||
    !normalizedDeploymentName
  ) {
    return undefined;
  }

  return `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}/${encodeURIComponent(normalizedProjectSlug)}/${encodeURIComponent(normalizedDeploymentName)}`;
}

/**
 * Project settings use the project scope, not a deployment scope. Keep the link
 * hidden until both dashboard slugs are known.
 */
export function buildConvexProjectSettingsDashboardUrl(args: {
  projectSlug: string | undefined;
  teamSlug: string | undefined;
}): string | undefined {
  const normalizedTeamSlug = args.teamSlug?.trim();
  const normalizedProjectSlug = args.projectSlug?.trim();
  if (!normalizedTeamSlug || !normalizedProjectSlug) {
    return undefined;
  }

  return `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}/${encodeURIComponent(normalizedProjectSlug)}/settings`;
}

function encodeConvexDashboardPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

/**
 * Preview deployment dashboards are branch-scoped. Preserve branch slash
 * separators while still encoding each path segment.
 */
export function buildConvexPreviewDeploymentDashboardUrl(args: {
  branchName: string | undefined;
  projectSlug: string | undefined;
  teamSlug: string | undefined;
}): string | undefined {
  const normalizedTeamSlug = args.teamSlug?.trim();
  const normalizedProjectSlug = args.projectSlug?.trim();
  const normalizedBranchName = args.branchName?.trim();
  if (!normalizedTeamSlug || !normalizedProjectSlug || !normalizedBranchName) {
    return undefined;
  }

  return `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}/${encodeURIComponent(normalizedProjectSlug)}/preview/${encodeConvexDashboardPath(normalizedBranchName)}`;
}

/**
 * Cloudflare can edit or partially reformat its PR comment without removing the
 * underlying branch alias. Preserve existing cached fields when the latest
 * comment only yields a partial parse, but still clear everything when GitHub
 * told us there is no relevant preview comment for the branch anymore.
 */
export function resolveSyncedCloudflarePreviewMetadata(args: {
  existing?: CloudflarePreviewMetadata;
  incoming: CloudflarePreviewMetadata & {
    previewState: "resolved" | "clear";
  };
}): CloudflarePreviewMetadata {
  if (args.incoming.previewState === "clear") {
    return {
      cloudflareBranchPreviewUrl: undefined,
      cloudflarePreviewPullRequestNumber: undefined,
      cloudflarePreviewUrl: undefined,
      cloudflarePreviewCommitSha: undefined,
      cloudflarePreviewStatus: undefined,
      cloudflarePreviewLogsUrl: undefined,
      cloudflarePreviewCommentCreatedAt: undefined,
    };
  }

  return {
    cloudflareBranchPreviewUrl:
      args.incoming.cloudflareBranchPreviewUrl ??
      args.existing?.cloudflareBranchPreviewUrl,
    cloudflarePreviewPullRequestNumber:
      args.incoming.cloudflarePreviewPullRequestNumber ??
      args.existing?.cloudflarePreviewPullRequestNumber,
    cloudflarePreviewUrl:
      args.incoming.cloudflarePreviewUrl ?? args.existing?.cloudflarePreviewUrl,
    cloudflarePreviewCommitSha:
      args.incoming.cloudflarePreviewCommitSha ??
      args.existing?.cloudflarePreviewCommitSha,
    cloudflarePreviewStatus:
      args.incoming.cloudflarePreviewStatus ??
      args.existing?.cloudflarePreviewStatus,
    cloudflarePreviewLogsUrl:
      args.incoming.cloudflarePreviewLogsUrl ??
      args.existing?.cloudflarePreviewLogsUrl,
    cloudflarePreviewCommentCreatedAt:
      args.incoming.cloudflarePreviewCommentCreatedAt ??
      args.existing?.cloudflarePreviewCommentCreatedAt,
  };
}

/**
 * Cloudflare preview links are cached per PR. Clear the saved preview when the
 * branch loses its current PR or when GitHub points the branch at a different
 * PR number so the next hydration can fetch fresh comment data exactly once for
 * that PR.
 */
export function shouldClearCloudflarePreviewForPullRequestSync(args: {
  incomingPullRequestState: "resolved" | "preserve";
  incomingPullRequestNumber?: number;
  existingPullRequestNumber?: number;
}): boolean {
  if (args.incomingPullRequestState !== "resolved") {
    return false;
  }

  if (typeof args.incomingPullRequestNumber !== "number") {
    return true;
  }

  return args.incomingPullRequestNumber !== args.existingPullRequestNumber;
}

// MARK: Public

export const removeVault = mutation({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      console.error("vault not found", args.vaultId);
      return;
    }
    if (vault.userId !== userId) {
      console.error("vault ownership mismatch", args.vaultId);
      return;
    }

    const vaultBranchFilter = await ctx.db
      .query("vaultBranchFilters")
      .withIndex("by_user_and_vault", (q) =>
        q.eq("userId", userId).eq("vaultId", args.vaultId),
      )
      .first();
    if (vaultBranchFilter) {
      await ctx.db.delete(vaultBranchFilter._id);
    }

    // 1. Delete all blobs
    const blobs = await ctx.db
      .query("blobs")
      .filter((q) => q.eq(q.field("vaultId"), args.vaultId))
      .collect();

    for (const blob of blobs) {
      if (blob.storageId) {
        await ctx.storage.delete(blob.storageId).catch((e) => {
          console.error("storage delete", e);
        });
      }
      await ctx.db.delete(blob._id).catch((e) => {
        console.error("blob delete", e);
      });
    }

    // 2. Delete all collaborative updates of all the stagedFiles
    const stagedFiles = await ctx.db
      .query("fileStaging")
      .filter((q) => q.eq(q.field("vaultId"), args.vaultId))
      .collect();

    for (const stagedFile of stagedFiles) {
      await ctx.db.delete(stagedFile._id).catch((e) => {
        console.error("stagedFile delete", e);
      });
    }

    // 3. Delete all the stagedFiles
    await ctx.db.delete(args.vaultId);

    // 4. Delete folder expansion states
    const folderExpansionStates = await ctx.db
      .query("folderExpansionState")
      .filter((q) => q.eq(q.field("vaultId"), args.vaultId))
      .collect();

    for (const folderExpansionState of folderExpansionStates) {
      await ctx.db.delete(folderExpansionState._id).catch((e) => {
        console.error("folderExpansionState delete", e);
      });
    }

    // 5. Delete infra domain mappings
    const domains = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    for (const domain of domains) {
      await ctx.db.delete(domain._id).catch((e) => {
        console.error("vaultDomain delete", e);
      });
    }

    // 6. Delete infra record
    const infra = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (infra) {
      await ctx.db.delete(infra._id).catch((e) => {
        console.error("vaultInfrastructure delete", e);
      });
    }

    // 7. Delete codespaces records (GitHub resources are handled by vaultActions.deleteVault)
    const codespaces = await ctx.db
      .query("codespaces")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    for (const codespace of codespaces) {
      await ctx.db.delete(codespace._id).catch((e) => {
        console.error("codespace delete", e);
      });
    }

    // 8. Delete branch metadata/cache rows
    const remoteBranches = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    for (const branch of remoteBranches) {
      await ctx.db.delete(branch._id).catch((e) => {
        console.error("vaultRemoteBranch delete", e);
      });
    }

    const branchTrees = await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    for (const branchTree of branchTrees) {
      await ctx.db.delete(branchTree._id).catch((e) => {
        console.error("vaultBranchTree delete", e);
      });
    }

    // 9. Delete the vault
    await ctx.db.delete(vault._id).catch((e) => {
      console.error("vault delete", e);
    });
  },
});

export const getUserVaultBranchFilters = query({
  args: {},
  returns: array(vaultBranchFiltersValidator),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    return (
      await ctx.db
        .query("vaultBranchFilters")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).map((vaultBranchFilter) => ({
      vaultId: vaultBranchFilter.vaultId,
      hiddenLabels: vaultBranchFilter.hiddenLabels,
      includeDrafts: vaultBranchFilter.includeDrafts,
      includeNoLabel: vaultBranchFilter.includeNoLabel !== false,
      branchesExpanded: vaultBranchFilter.branchesExpanded === true,
    }));
  },
});

export const setVaultBranchFilters = mutation({
  args: vaultBranchFiltersValidator,
  returns: nullValidator,
  handler: async (ctx, args: VaultBranchFilters) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const existing = await ctx.db
      .query("vaultBranchFilters")
      .withIndex("by_user_and_vault", (q) =>
        q.eq("userId", userId).eq("vaultId", args.vaultId),
      )
      .first();
    const shouldPersist =
      args.hiddenLabels.length > 0 ||
      args.includeDrafts === true ||
      args.includeNoLabel === false ||
      args.branchesExpanded === true;

    if (!shouldPersist) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return null;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel !== false,
        branchesExpanded: args.branchesExpanded === true,
      });
    } else {
      await ctx.db.insert("vaultBranchFilters", {
        userId,
        vaultId: args.vaultId,
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel !== false,
        branchesExpanded: args.branchesExpanded === true,
      });
    }

    return null;
  },
});

// Get a specific vault by repository full name for a user
export const getVaultByRepository = query({
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    return await getVaultByRepositoryHelper(ctx, {
      userId,
      repositoryFullName: args.repositoryFullName,
      branch: args.branch,
    });
  },
});

// MARK: Internal

export const getByIdForUser = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      return null;
    }
    return vault;
  },
});

// mutation to add new vault
export const addVault = internalMutation({
  args: {
    ghRepoId: v.string(),
    ghRepoOwner: v.string(),
    ghRepoName: v.string(),
    defaultBranch: v.string(),
    visibility: GitHubRepositoryVisibility,
    treeSHA: v.string(),
    commitSHA: v.optional(v.string()),
    treeData: GithubTreeData,
  },
  handler: async (ctx, args): Promise<Id<"vaults">> => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    // GitHub repository id stays stable across owner/name renames.
    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_userId_and_ghRepoId", (q) =>
        q.eq("userId", currentUser._id).eq("ghRepoId", args.ghRepoId),
      )
      .first();

    if (existingVault) {
      const connectedVault = assertConnectedVault(existingVault);
      // Keep reconnect idempotency limited to the fields this path just read
      // from GitHub. Broader repository drift correction belongs in one future
      // refresh worker, not in a second ad hoc refresh implementation here.
      await ctx.db.patch(connectedVault._id, {
        owner: args.ghRepoOwner,
        name: args.ghRepoName,
        defaultBranch: args.defaultBranch,
        visibility: args.visibility,
        treeSHA: args.treeSHA,
        treeData: args.treeData,
      });
      if (args.commitSHA) {
        await ctx.db.patch(connectedVault._id, { commitSHA: args.commitSHA });
      }
      return connectedVault._id;
    }

    return await ctx.db.insert("vaults", {
      userId: currentUser._id,
      state: "connected",
      githubMode: "connect_existing_repository",
      ghRepoId: args.ghRepoId,
      owner: args.ghRepoOwner,
      name: args.ghRepoName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      treeSHA: args.treeSHA,
      commitSHA: args.commitSHA,
      treeData: args.treeData,
      connectedAt: Date.now(),
      convex: { state: "not_configured" },
      hosting: { state: "not_configured" },
      infraState: "not_started",
      infraLastError: undefined,
      infraLastProvisionedAt: undefined,
      infraProvisioningStartedAt: undefined,
    });
  },
});

export const addNoterManagedVaultForUser = internalMutation({
  args: {
    userId: id("users"),
    ghRepoId: string(),
    ghRepoOwner: string(),
    ghRepoName: string(),
    defaultBranch: string(),
    visibility: GitHubRepositoryVisibility,
    runId: id("appProvisioningRuns"),
    treeSHA: string(),
    commitSHA: optional(string()),
    treeData: GithubTreeData,
  },
  returns: id("vaults"),
  handler: async (ctx, args): Promise<Id<"vaults">> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // GitHub repository id stays stable across owner/name renames.
    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_userId_and_ghRepoId", (q) =>
        q.eq("userId", args.userId).eq("ghRepoId", args.ghRepoId),
      )
      .first();

    if (existingVault) {
      const connectedVault = assertConnectedVault(existingVault);
      // Keep reconnect idempotency limited to the fields this path just read
      // from GitHub. Broader repository drift correction belongs in one future
      // refresh worker, not in a second ad hoc refresh implementation here.
      await ctx.db.patch(connectedVault._id, {
        owner: args.ghRepoOwner,
        name: args.ghRepoName,
        defaultBranch: args.defaultBranch,
        visibility: args.visibility,
        treeSHA: args.treeSHA,
        treeData: args.treeData,
      });
      if (args.commitSHA) {
        await ctx.db.patch(connectedVault._id, { commitSHA: args.commitSHA });
      }
      return connectedVault._id;
    }

    return await ctx.db.insert("vaults", {
      userId: args.userId,
      state: "connected",
      githubMode: "create_repository",
      runId: args.runId,
      ghRepoId: args.ghRepoId,
      owner: args.ghRepoOwner,
      name: args.ghRepoName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      treeSHA: args.treeSHA,
      commitSHA: args.commitSHA,
      treeData: args.treeData,
      connectedAt: Date.now(),
      convex: { state: "not_configured" },
      hosting: { state: "not_configured" },
      infraState: "not_started",
      infraLastError: undefined,
      infraLastProvisionedAt: undefined,
      infraProvisioningStartedAt: undefined,
    });
  },
});

export const createInitializingNoterManagedVaultForUser = internalMutation({
  args: {
    userId: id("users"),
    ghRepoOwner: string(),
    ghRepoName: string(),
    visibility: GitHubRepositoryVisibility,
  },
  returns: object({
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
  }> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", args.ghRepoOwner).eq("name", args.ghRepoName),
      )
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
    if (existingVault) {
      throw new Error("Vault already exists for this repository.");
    }

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      userId: args.userId,
      state: "not_connected",
    });
    const repositoryFullName = `${args.ghRepoOwner}/${args.ghRepoName}`;
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId: args.userId,
      vaultId,
      repositoryFullName,
      trigger: "create",
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });

    // The run owns this GitHub attempt; later provider retries use their own runs.
    await ctx.db.patch(vaultId, {
      state: "provisioning",
      githubMode: "create_repository",
      runId,
      startedAt: now,
      owner: args.ghRepoOwner,
      name: args.ghRepoName,
      visibility: args.visibility,
    });

    return { vaultId, runId };
  },
});

export const connectNoterManagedVaultGitHub = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    ghRepoId: string(),
    ghRepoOwner: string(),
    ghRepoName: string(),
    defaultBranch: string(),
    visibility: GitHubRepositoryVisibility,
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found");
    }
    if (isConnectedVault(vault)) {
      if (!isNoterManagedVault(vault)) {
        throw new Error(
          "Connected vault repository identity cannot be changed.",
        );
      }
      if (vault.ghRepoId !== args.ghRepoId || vault.runId !== args.runId) {
        throw new Error(
          "Connected vault repository identity cannot be changed.",
        );
      }
      return null;
    }
    if (
      vault.state !== "provisioning" ||
      vault.githubMode !== "create_repository" ||
      vault.runId !== args.runId
    ) {
      throw new Error("Vault is not waiting for GitHub provisioning.");
    }

    await ctx.db.replace(args.vaultId, {
      userId: vault.userId,
      lastTreeRefreshAt: vault.lastTreeRefreshAt,
      treeRefreshStartedAt: vault.treeRefreshStartedAt,
      lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
      treeRefreshFailureKind: vault.treeRefreshFailureKind,
      treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
      treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
      activeCodespaceId: vault.activeCodespaceId,
      devcontainerConfig: vault.devcontainerConfig,
      state: "connected",
      githubMode: "create_repository",
      runId: args.runId,
      ghRepoId: args.ghRepoId,
      owner: args.ghRepoOwner,
      name: args.ghRepoName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      connectedAt: Date.now(),
      convex: { state: "not_configured" },
      hosting: { state: "not_configured" },
      infraState: "not_started",
      infraLastError: undefined,
      infraLastProvisionedAt: undefined,
      infraProvisioningStartedAt: undefined,
    });

    return null;
  },
});

export const markNoterManagedGithubProvisioningFailed = internalMutation({
  args: {
    runId: id("appProvisioningRuns"),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.vaultId === null) {
      return null;
    }
    const vault = await ctx.db.get(run.vaultId);
    if (
      vault?.state !== "provisioning" ||
      vault.githubMode !== "create_repository" ||
      vault.runId !== args.runId
    ) {
      return null;
    }

    await ctx.db.replace(vault._id, {
      userId: vault.userId,
      lastTreeRefreshAt: vault.lastTreeRefreshAt,
      treeRefreshStartedAt: vault.treeRefreshStartedAt,
      lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
      treeRefreshFailureKind: vault.treeRefreshFailureKind,
      treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
      treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
      activeCodespaceId: vault.activeCodespaceId,
      devcontainerConfig: vault.devcontainerConfig,
      state: "failed",
      githubMode: "create_repository",
      runId: args.runId,
      owner: vault.owner,
      name: vault.name,
      visibility: vault.visibility,
      failedAt: Date.now(),
    });

    return null;
  },
});

export const markVaultAsReady = internalMutation({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    assertConnectedVault(await ctx.db.get(args.vaultId));
    return null;
  },
});

export const updateVaultDevcontainerConfig = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    devcontainerConfig: v.string(),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      devcontainerConfig: args.devcontainerConfig,
    });
    return null;
  },
});

function compareRemoteBranchSortOrder(
  left: {
    remoteState: "active" | "deleted_upstream";
    lastCommitAt?: number;
    isDefault: boolean;
    name: string;
  },
  right: {
    remoteState: "active" | "deleted_upstream";
    lastCommitAt?: number;
    isDefault: boolean;
    name: string;
  },
): number {
  if (left.remoteState !== right.remoteState) {
    return left.remoteState === "active" ? -1 : 1;
  }
  // Keep the repository default branch pinned at the top regardless of activity.
  // `isDefault` comes from GitHub's `default_branch`, so it works for `main`,
  // `master`, or any custom default branch name.
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }
  const leftLastCommitAt = left.lastCommitAt ?? Number.NEGATIVE_INFINITY;
  const rightLastCommitAt = right.lastCommitAt ?? Number.NEGATIVE_INFINITY;
  if (leftLastCommitAt !== rightLastCommitAt) {
    return rightLastCommitAt - leftLastCommitAt;
  }
  return left.name.localeCompare(right.name);
}

type BranchStagingChangeCandidate = StagedFileChangeCandidate;
type BranchStagingRecord = BranchStagingChangeCandidate & {
  _id: Id<"fileStaging">;
  branch: string;
};

export function hasBranchStagingChanges(
  file: BranchStagingChangeCandidate,
): boolean {
  return hasStagedFileChanges(file);
}

export function resolveSyncedBranchLastCommitAt(args: {
  incomingHeadCommitSha: string;
  incomingLastCommitAt?: number;
  existingBranch?: {
    headCommitSha: string;
    lastCommitAt?: number;
  };
}): number | undefined {
  if (args.incomingLastCommitAt !== undefined) {
    return args.incomingLastCommitAt;
  }
  if (
    args.existingBranch &&
    args.existingBranch.headCommitSha === args.incomingHeadCommitSha
  ) {
    return args.existingBranch.lastCommitAt;
  }
  return undefined;
}

export function selectDeletedUpstreamBranchesToAutoPrune(args: {
  branches: Array<{
    name: string;
    remoteState: "active" | "deleted_upstream";
  }>;
  branchHasStagedChanges: ReadonlyMap<string, boolean>;
}): string[] {
  return args.branches
    .filter(
      (branch) =>
        branch.remoteState === "deleted_upstream" &&
        args.branchHasStagedChanges.get(branch.name) !== true,
    )
    .map((branch) => branch.name);
}

function groupStagingFilesByBranch(
  stagingFiles: BranchStagingRecord[],
): Map<string, BranchStagingRecord[]> {
  const grouped = new Map<string, BranchStagingRecord[]>();
  for (const stagingFile of stagingFiles) {
    const existing = grouped.get(stagingFile.branch);
    if (existing) {
      existing.push(stagingFile);
      continue;
    }
    grouped.set(stagingFile.branch, [stagingFile]);
  }
  return grouped;
}

async function deleteVaultBranchArtifacts(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    branch: string;
    collaborativeUpdatesCutoffTimestamp: number;
    stagingFiles: BranchStagingRecord[];
  },
): Promise<void> {
  const branchTree = await ctx.db
    .query("vaultBranchTrees")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", args.vaultId).eq("branch", args.branch),
    )
    .first();
  if (branchTree) {
    await ctx.db.delete(branchTree._id);
  }

  const domains = await ctx.db
    .query("vaultDomains")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", args.vaultId).eq("branch", args.branch),
    )
    .collect();
  for (const domain of domains) {
    await ctx.db.delete(domain._id);
  }

  for (const stagingFile of args.stagingFiles) {
    await ctx.db.delete(stagingFile._id);
  }

  await ctx.scheduler.runAfter(
    0,
    internal.fileStaging.deleteCollaborativeUpdatesBatch,
    {
      vaultId: args.vaultId,
      branch: args.branch,
      cutoffTimestamp: args.collaborativeUpdatesCutoffTimestamp,
    },
  );
}

async function pruneDeletedUpstreamBranchesForVault(
  ctx: MutationCtx,
  vaultId: Id<"vaults">,
): Promise<void> {
  const deletedUpstreamBranches = await ctx.db
    .query("vaultRemoteBranches")
    .withIndex("by_vault_and_remote_state", (q) =>
      q.eq("vaultId", vaultId).eq("remoteState", "deleted_upstream"),
    )
    .collect();
  if (deletedUpstreamBranches.length === 0) {
    return;
  }

  const collaborativeUpdatesCutoffTimestamp = Date.now() + 1;
  const stagingFilesByBranch = groupStagingFilesByBranch(
    await ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .collect(),
  );
  const branchHasStagedChanges = new Map<string, boolean>();
  for (const branch of deletedUpstreamBranches) {
    const branchStaging = stagingFilesByBranch.get(branch.name) ?? [];
    branchHasStagedChanges.set(
      branch.name,
      branchStaging.some(hasBranchStagingChanges),
    );
  }

  const branchNamesToPrune = new Set(
    selectDeletedUpstreamBranchesToAutoPrune({
      branches: deletedUpstreamBranches,
      branchHasStagedChanges,
    }),
  );

  for (const branch of deletedUpstreamBranches) {
    if (!branchNamesToPrune.has(branch.name)) {
      continue;
    }
    await deleteVaultBranchArtifacts(ctx, {
      vaultId,
      branch: branch.name,
      collaborativeUpdatesCutoffTimestamp,
      stagingFiles: stagingFilesByBranch.get(branch.name) ?? [],
    });
    await ctx.db.delete(branch._id);
  }
}

const getUserVaultsResult = array(
  object({
    _id: id("vaults"),
    _creationTime: number(),
    ghRepoOwner: string(),
    ghRepoName: string(),
    repositoryFullName: string(),
    commitSHA: optional(string()),
    fileCount: number(),
    lastEditTime: optional(number()),
    lastTreeRefreshAt: optional(number()),
    treeRefreshStartedAt: optional(number()),
    ...treeRefreshFailureFields,
    state: union(literal("copying_files"), literal("ready"), literal("failed")),
    sourceSetup: sourceSetupSummary,
    isNoterManaged: boolean(),
    hasConnectedGitHubRepository: boolean(),
    hostingProvider: optional(hostingProviderValidator),
    hasConvexProvision: boolean(),
    hasHostingProvision: boolean(),
    remoteBranches: array(
      object({
        name: string(),
        headCommitSha: string(),
        lastCommitAt: optional(number()),
        aheadBy: optional(number()),
        behindBy: optional(number()),
        pullRequestUrl: optional(string()),
        pullRequestNumber: optional(number()),
        pullRequestLabels: optional(array(PullRequestLabel)),
        pullRequestTitle: optional(string()),
        pullRequestIsDraft: optional(boolean()),
        isDefault: boolean(),
        isProtected: boolean(),
        remoteState: union(literal("active"), literal("deleted_upstream")),
        lastSyncedAt: number(),
        ...cloudflarePreviewMetadataFields,
        convexPreviewDeploymentDashboardUrl: optional(string()),
      }),
    ),
    infraState: union(
      literal("not_started"),
      literal("provisioning"),
      literal("ready"),
      literal("failed"),
      literal("partial"),
    ),
    infraProductionUrl: optional(string()),
    cloudflareProjectDashboardUrl: optional(string()),
    convexProjectSettingsDashboardUrl: optional(string()),
    convexDeploymentDashboardUrl: optional(string()),
  }),
);

type UserVaultResult = Infer<typeof getUserVaultsResult>[number];

// Get user's vaults with optional file staging stats
export const getUserVaults = query({
  args: {},
  returns: getUserVaultsResult,
  handler: async (ctx, _args) => {
    const userId = await getUserId(ctx);

    // Get user's vaults
    const vaults = await ctx.db
      .query("vaults")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    const convexConnection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_kind", (q) =>
        q.eq("userId", userId).eq("kind", "convex"),
      )
      .first();
    const convexTeamDashboardSlug =
      convexConnection?.kind === "convex"
        ? convexConnection.teamSlug
        : undefined;

    // Pre-GitHub vaults render as non-ready cards; repo-backed controls stay
    // gated until a connected vault has branch data.
    const connectedVaults = vaults.filter(isConnectedVault);
    const initializingVaultResults: UserVaultResult[] = [];
    for (const vault of vaults) {
      if (vault.state !== "provisioning" && vault.state !== "failed") {
        continue;
      }
      initializingVaultResults.push({
        _id: vault._id,
        _creationTime: vault._creationTime,
        ghRepoOwner: vault.owner,
        ghRepoName: vault.name,
        repositoryFullName: `${vault.owner}/${vault.name}`,
        commitSHA: undefined,
        fileCount: 0,
        lastEditTime: undefined,
        lastTreeRefreshAt: vault.lastTreeRefreshAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
        lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
        treeRefreshFailureKind: vault.treeRefreshFailureKind,
        treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
        treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
        state: vault.state === "failed" ? "failed" : "copying_files",
        sourceSetup: { status: "not_applicable" },
        isNoterManaged: vault.githubMode === "create_repository",
        hasConnectedGitHubRepository: false,
        hostingProvider: undefined,
        hasConvexProvision: false,
        hasHostingProvision: false,
        remoteBranches: [],
        infraState: "not_started",
        infraProductionUrl: undefined,
        cloudflareProjectDashboardUrl: undefined,
        convexProjectSettingsDashboardUrl: undefined,
        convexDeploymentDashboardUrl: undefined,
      });
    }

    // Get staging stats for each vault
    const vaultResults: UserVaultResult[] = await Promise.all(
      connectedVaults.map(async (vault) => {
        const [stagingData, remoteBranches, infra, defaultBranchTree] =
          await Promise.all([
            ctx.db
              .query("fileStaging")
              .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
              .collect(),
            ctx.db
              .query("vaultRemoteBranches")
              .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
              .collect(),
            ctx.db
              .query("vaultInfrastructure")
              .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
              .first(),
            ctx.db
              .query("vaultBranchTrees")
              .withIndex("by_vault_and_branch", (q) =>
                q.eq("vaultId", vault._id).eq("branch", vault.defaultBranch),
              )
              .first(),
          ]);

        const fileCount = stagingData.filter(hasBranchStagingChanges).length;

        const lastEditTime =
          stagingData.length > 0
            ? Math.max(...stagingData.map((s) => s.lastEditTime))
            : undefined;

        const repositoryFullName = `${vault.owner}/${vault.name}`;
        const hasUsableDefaultBranchTree = Boolean(
          defaultBranchTree || vault.treeData,
        );
        const sourceSetup = isNoterManagedVault(vault)
          ? await resolveSourceSetupSummary(ctx, {
              hasUsableDefaultBranchTree,
              vault,
            })
          : { status: "not_applicable" as const };
        const hasConvexProvision =
          typeof infra?.convexProjectId === "string" ||
          typeof infra?.convexDeploymentName === "string";
        const hasCloudflareProvision =
          infra?.hosting?.provider === "cloudflare" &&
          typeof infra.hosting.projectName === "string" &&
          infra.hosting.projectName.length > 0 &&
          typeof infra.hosting.accountId === "string" &&
          infra.hosting.accountId.length > 0;
        const hasHostingProvision = hasCloudflareProvision;

        return {
          _id: vault._id,
          _creationTime: vault._creationTime,
          ghRepoOwner: vault.owner,
          ghRepoName: vault.name,
          repositoryFullName,
          commitSHA: vault.commitSHA,
          fileCount,
          lastEditTime,
          lastTreeRefreshAt: vault.lastTreeRefreshAt,
          treeRefreshStartedAt: vault.treeRefreshStartedAt,
          lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
          treeRefreshFailureKind: vault.treeRefreshFailureKind,
          treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
          treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
          state: hasUsableDefaultBranchTree ? "ready" : "copying_files",
          sourceSetup,
          isNoterManaged: isNoterManagedVault(vault),
          hasConnectedGitHubRepository: true,
          hostingProvider: getConnectedVaultHostingProvider(vault),
          hasConvexProvision,
          hasHostingProvision,
          remoteBranches: remoteBranches
            .sort(compareRemoteBranchSortOrder)
            .map((branch) => ({
              name: branch.name,
              headCommitSha: branch.headCommitSha,
              lastCommitAt: branch.lastCommitAt,
              aheadBy: branch.aheadBy,
              behindBy: branch.behindBy,
              pullRequestUrl: branch.pullRequestUrl,
              pullRequestNumber: branch.pullRequestNumber,
              pullRequestLabels: branch.pullRequestLabels,
              pullRequestTitle: branch.pullRequestTitle,
              pullRequestIsDraft: branch.pullRequestIsDraft,
              isDefault: branch.isDefault,
              isProtected: branch.isProtected,
              remoteState: branch.remoteState,
              lastSyncedAt: branch.lastSyncedAt,
              cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
              cloudflarePreviewPullRequestNumber:
                branch.cloudflarePreviewPullRequestNumber,
              cloudflarePreviewUrl: branch.cloudflarePreviewUrl,
              cloudflarePreviewCommitSha: branch.cloudflarePreviewCommitSha,
              cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
              cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
              cloudflarePreviewCommentCreatedAt:
                branch.cloudflarePreviewCommentCreatedAt,
              convexPreviewDeploymentDashboardUrl:
                !branch.isDefault &&
                branch.remoteState === "active" &&
                typeof branch.cloudflareBranchPreviewUrl === "string" &&
                branch.pullRequestNumber ===
                  branch.cloudflarePreviewPullRequestNumber
                  ? buildConvexPreviewDeploymentDashboardUrl({
                      branchName: branch.name,
                      projectSlug: infra?.convexProjectSlug,
                      teamSlug: convexTeamDashboardSlug,
                    })
                  : undefined,
            })),
          infraState: vault.infraState,
          infraProductionUrl: resolveHostingMainUrl(infra),
          cloudflareProjectDashboardUrl:
            buildCloudflareProjectDashboardUrl(infra),
          convexProjectSettingsDashboardUrl:
            buildConvexProjectSettingsDashboardUrl({
              projectSlug: infra?.convexProjectSlug,
              teamSlug: convexTeamDashboardSlug,
            }),
          convexDeploymentDashboardUrl: buildConvexDeploymentDashboardUrl({
            deploymentName: infra?.convexDeploymentName,
            projectSlug: infra?.convexProjectSlug,
            teamSlug: convexTeamDashboardSlug,
          }),
        };
      }),
    );

    // Sort by last edit time if available, otherwise by creation time
    return [...vaultResults, ...initializingVaultResults].sort((a, b) => {
      const aTime = a.lastEditTime ?? a._creationTime;
      const bTime = b.lastEditTime ?? b._creationTime;
      return bTime - aTime;
    });
  },
});

export const getById = internalQuery({
  args: {
    id: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getInfrastructureByVaultId = internalQuery({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
  },
});

export const getVaultRemoteBranches = query({
  args: {
    vaultId: id("vaults"),
  },
  returns: array(
    object({
      name: string(),
      headCommitSha: string(),
      lastCommitAt: optional(number()),
      aheadBy: optional(number()),
      behindBy: optional(number()),
      pullRequestUrl: optional(string()),
      pullRequestNumber: optional(number()),
      pullRequestLabels: optional(array(PullRequestLabel)),
      pullRequestTitle: optional(string()),
      pullRequestIsDraft: optional(boolean()),
      isDefault: boolean(),
      isProtected: boolean(),
      remoteState: union(literal("active"), literal("deleted_upstream")),
      deletedUpstreamAt: optional(number()),
      lastSyncedAt: number(),
      ...cloudflarePreviewMetadataFields,
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      return [];
    }

    const branches = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    return branches.sort(compareRemoteBranchSortOrder).map((branch) => ({
      name: branch.name,
      headCommitSha: branch.headCommitSha,
      lastCommitAt: branch.lastCommitAt,
      aheadBy: branch.aheadBy,
      behindBy: branch.behindBy,
      pullRequestUrl: branch.pullRequestUrl,
      pullRequestNumber: branch.pullRequestNumber,
      pullRequestLabels: branch.pullRequestLabels,
      pullRequestTitle: branch.pullRequestTitle,
      pullRequestIsDraft: branch.pullRequestIsDraft,
      isDefault: branch.isDefault,
      isProtected: branch.isProtected,
      remoteState: branch.remoteState,
      deletedUpstreamAt: branch.deletedUpstreamAt,
      lastSyncedAt: branch.lastSyncedAt,
      cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
      cloudflarePreviewPullRequestNumber:
        branch.cloudflarePreviewPullRequestNumber,
      cloudflarePreviewUrl: branch.cloudflarePreviewUrl,
      cloudflarePreviewCommitSha: branch.cloudflarePreviewCommitSha,
      cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
      cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
      cloudflarePreviewCommentCreatedAt:
        branch.cloudflarePreviewCommentCreatedAt,
    }));
  },
});

export const getVaultRemoteBranch = internalQuery({
  args: {
    vaultId: id("vaults"),
    branchName: string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault_and_name", (q) =>
        q.eq("vaultId", args.vaultId).eq("name", args.branchName),
      )
      .first();
  },
});

export const syncVaultRemoteBranches = internalMutation({
  args: {
    vaultId: id("vaults"),
    syncedAt: number(),
    branches: array(
      object({
        name: string(),
        headCommitSha: string(),
        lastCommitAt: optional(number()),
        aheadBy: optional(number()),
        behindBy: optional(number()),
        aheadBehindState: union(
          literal("resolved"),
          literal("unavailable"),
          literal("preserve"),
        ),
        pullRequestUrl: optional(string()),
        pullRequestNumber: optional(number()),
        pullRequestLabels: optional(array(PullRequestLabel)),
        pullRequestTitle: optional(string()),
        pullRequestIsDraft: optional(boolean()),
        pullRequestState: union(literal("resolved"), literal("preserve")),
        isDefault: boolean(),
        isProtected: boolean(),
      }),
    ),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return null;
    }

    const existing = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    const existingByName = new Map(
      existing.map((branch) => [branch.name, branch]),
    );
    const seenNames = new Set<string>();

    for (const branch of args.branches) {
      seenNames.add(branch.name);
      const existingBranch = existingByName.get(branch.name);
      if (existingBranch) {
        const nextLastCommitAt = resolveSyncedBranchLastCommitAt({
          incomingHeadCommitSha: branch.headCommitSha,
          incomingLastCommitAt: branch.lastCommitAt,
          existingBranch,
        });
        const patchData: {
          headCommitSha: string;
          lastCommitAt?: number;
          aheadBy?: number;
          behindBy?: number;
          pullRequestUrl?: string;
          pullRequestNumber?: number;
          pullRequestLabels?: PullRequestLabel[];
          pullRequestTitle?: string;
          pullRequestIsDraft?: boolean;
          cloudflareBranchPreviewUrl?: string;
          cloudflarePreviewPullRequestNumber?: number;
          cloudflarePreviewUrl?: string;
          cloudflarePreviewCommitSha?: string;
          cloudflarePreviewStatus?: string;
          cloudflarePreviewLogsUrl?: string;
          cloudflarePreviewCommentCreatedAt?: number;
          isDefault: boolean;
          isProtected: boolean;
          remoteState: "active";
          deletedUpstreamAt?: number;
          lastSyncedAt: number;
        } = {
          headCommitSha: branch.headCommitSha,
          lastCommitAt: nextLastCommitAt,
          isDefault: branch.isDefault,
          isProtected: branch.isProtected,
          remoteState: "active",
          deletedUpstreamAt: undefined,
          lastSyncedAt: args.syncedAt,
        };
        if (branch.aheadBehindState === "resolved") {
          patchData.aheadBy = branch.aheadBy;
          patchData.behindBy = branch.behindBy;
        } else if (
          branch.aheadBehindState === "unavailable" ||
          existingBranch.headCommitSha !== branch.headCommitSha
        ) {
          patchData.aheadBy = undefined;
          patchData.behindBy = undefined;
        }
        if (branch.pullRequestState === "resolved") {
          patchData.pullRequestUrl = branch.pullRequestUrl;
          patchData.pullRequestNumber = branch.pullRequestNumber;
          patchData.pullRequestLabels = branch.pullRequestLabels;
          patchData.pullRequestTitle = branch.pullRequestTitle;
          patchData.pullRequestIsDraft =
            typeof branch.pullRequestUrl === "string"
              ? branch.pullRequestIsDraft === true
              : undefined;
          if (
            shouldClearCloudflarePreviewForPullRequestSync({
              incomingPullRequestState: branch.pullRequestState,
              incomingPullRequestNumber: branch.pullRequestNumber,
              existingPullRequestNumber: existingBranch.pullRequestNumber,
            })
          ) {
            patchData.cloudflareBranchPreviewUrl = undefined;
            patchData.cloudflarePreviewPullRequestNumber = undefined;
            patchData.cloudflarePreviewUrl = undefined;
            patchData.cloudflarePreviewCommitSha = undefined;
            patchData.cloudflarePreviewStatus = undefined;
            patchData.cloudflarePreviewLogsUrl = undefined;
            patchData.cloudflarePreviewCommentCreatedAt = undefined;
          }
        }
        await ctx.db.patch(existingBranch._id, patchData);
        continue;
      }

      const insertData: {
        vaultId: Id<"vaults">;
        name: string;
        headCommitSha: string;
        lastCommitAt?: number;
        aheadBy?: number;
        behindBy?: number;
        pullRequestUrl?: string;
        pullRequestNumber?: number;
        pullRequestLabels?: PullRequestLabel[];
        pullRequestTitle?: string;
        pullRequestIsDraft?: boolean;
        isDefault: boolean;
        isProtected: boolean;
        remoteState: "active";
        deletedUpstreamAt?: number;
        lastSyncedAt: number;
      } = {
        vaultId: args.vaultId,
        name: branch.name,
        headCommitSha: branch.headCommitSha,
        lastCommitAt: branch.lastCommitAt,
        isDefault: branch.isDefault,
        isProtected: branch.isProtected,
        remoteState: "active",
        deletedUpstreamAt: undefined,
        lastSyncedAt: args.syncedAt,
      };
      if (branch.aheadBehindState === "resolved") {
        insertData.aheadBy = branch.aheadBy;
        insertData.behindBy = branch.behindBy;
      }
      if (branch.pullRequestState === "resolved") {
        if (typeof branch.pullRequestUrl === "string") {
          insertData.pullRequestUrl = branch.pullRequestUrl;
        }
        if (typeof branch.pullRequestNumber === "number") {
          insertData.pullRequestNumber = branch.pullRequestNumber;
        }
        if (Array.isArray(branch.pullRequestLabels)) {
          insertData.pullRequestLabels = branch.pullRequestLabels;
        }
        if (typeof branch.pullRequestTitle === "string") {
          insertData.pullRequestTitle = branch.pullRequestTitle;
        }
        if (typeof branch.pullRequestUrl === "string") {
          insertData.pullRequestIsDraft = branch.pullRequestIsDraft === true;
        }
      }
      await ctx.db.insert("vaultRemoteBranches", insertData);
    }

    for (const branch of existing) {
      if (seenNames.has(branch.name)) {
        continue;
      }
      await ctx.db.patch(branch._id, {
        isDefault: false,
        remoteState: "deleted_upstream",
        deletedUpstreamAt: branch.deletedUpstreamAt ?? args.syncedAt,
        lastSyncedAt: args.syncedAt,
        cloudflareBranchPreviewUrl: undefined,
        cloudflarePreviewPullRequestNumber: undefined,
        cloudflarePreviewUrl: undefined,
        cloudflarePreviewCommitSha: undefined,
        cloudflarePreviewStatus: undefined,
        cloudflarePreviewLogsUrl: undefined,
        cloudflarePreviewCommentCreatedAt: undefined,
      });
    }

    await pruneDeletedUpstreamBranchesForVault(ctx, args.vaultId);

    return null;
  },
});

export const syncVaultRemoteBranchCloudflarePreviews = internalMutation({
  args: {
    vaultId: id("vaults"),
    branches: array(
      object({
        name: string(),
        previewState: union(
          literal("resolved"),
          literal("clear"),
          literal("preserve"),
        ),
        ...cloudflarePreviewMetadataFields,
      }),
    ),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    const existingByName = new Map(
      existing.map((branch) => [branch.name, branch]),
    );

    for (const branch of args.branches) {
      if (branch.previewState === "preserve") {
        continue;
      }

      const existingBranch = existingByName.get(branch.name);
      if (!existingBranch) {
        continue;
      }

      const resolvedMetadata =
        branch.previewState === "clear"
          ? resolveSyncedCloudflarePreviewMetadata({
              existing: existingBranch,
              incoming: {
                previewState: "clear",
              },
            })
          : resolveSyncedCloudflarePreviewMetadata({
              existing: existingBranch,
              incoming: {
                previewState: "resolved",
                cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
                cloudflarePreviewPullRequestNumber:
                  branch.cloudflarePreviewPullRequestNumber,
                cloudflarePreviewUrl: branch.cloudflarePreviewUrl,
                cloudflarePreviewCommitSha: branch.cloudflarePreviewCommitSha,
                cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
                cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
                cloudflarePreviewCommentCreatedAt:
                  branch.cloudflarePreviewCommentCreatedAt,
              },
            });

      await ctx.db.patch(existingBranch._id, resolvedMetadata);
    }

    return null;
  },
});

export const getVaultBranchTree = internalQuery({
  args: {
    vaultId: id("vaults"),
    branch: string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .first();
  },
});

export const upsertVaultBranchTree = internalMutation({
  args: {
    vaultId: id("vaults"),
    branch: string(),
    treeData: GithubTreeData,
    commitSHA: optional(string()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        treeSHA: args.treeData.sha,
        commitSHA: args.commitSHA,
        treeData: args.treeData,
        lastTreeRefreshAt: now,
        treeRefreshStartedAt: undefined,
      });
      return null;
    }

    await ctx.db.insert("vaultBranchTrees", {
      vaultId: args.vaultId,
      branch: args.branch,
      treeSHA: args.treeData.sha,
      commitSHA: args.commitSHA,
      treeData: args.treeData,
      lastTreeRefreshAt: now,
      treeRefreshStartedAt: undefined,
    });

    return null;
  },
});

export const hasOtherVaultsForRepository = internalQuery({
  args: {
    owner: string(),
    repo: string(),
    excludeVaultId: id("vaults"),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("vaults")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", args.owner).eq("name", args.repo),
      )
      .take(2);
    return matches.some(
      (vault) => isConnectedVault(vault) && vault._id !== args.excludeVaultId,
    );
  },
});

async function getVaultByRepositoryHelper(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    repositoryFullName: string;
    branch?: string;
  },
) {
  const [owner, name] = args.repositoryFullName.split("/");
  if (!owner || !name) {
    throw new Error("Invalid repository full name");
  }

  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_owner_and_name", (q) =>
      q.eq("owner", owner).eq("name", name),
    )
    .filter((q) => q.eq(q.field("userId"), args.userId))
    .first();

  if (!isConnectedVault(vault)) {
    return null;
  }

  const requestedBranch =
    typeof args.branch === "string" && args.branch.trim().length > 0
      ? args.branch.trim()
      : undefined;

  const remoteBranches = await ctx.db
    .query("vaultRemoteBranches")
    .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
    .collect();
  const { defaultBranch, resolvedBranch, branchNotFound } =
    resolveVaultBranchSelection({
      requestedBranch,
      defaultBranch: vault.defaultBranch,
      remoteBranches,
    });

  const branchTree = await ctx.db
    .query("vaultBranchTrees")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", vault._id).eq("branch", resolvedBranch),
    )
    .first();
  const canUseDefaultBranchSnapshot =
    !branchNotFound &&
    resolvedBranch === defaultBranch &&
    hasConnectedVaultTreeSnapshot(vault);
  const treeSHA = branchTree?.treeSHA ?? vault.treeSHA;
  const treeData = branchTree?.treeData ?? vault.treeData;
  const commitSHA = branchTree?.commitSHA ?? vault.commitSHA;

  return {
    _id: vault._id,
    _creationTime: vault._creationTime,
    ghRepoOwner: vault.owner,
    ghRepoName: vault.name,
    owner: vault.owner,
    name: vault.name,
    repositoryFullName: args.repositoryFullName,
    treeSHA: branchTree
      ? treeSHA
      : canUseDefaultBranchSnapshot
        ? treeSHA
        : undefined,
    commitSHA: branchTree
      ? commitSHA
      : canUseDefaultBranchSnapshot
        ? commitSHA
        : undefined,
    treeData: branchTree
      ? treeData
      : canUseDefaultBranchSnapshot
        ? treeData
        : undefined,
    treeRefreshStartedAt:
      branchTree?.treeRefreshStartedAt ?? vault.treeRefreshStartedAt,
    lastTreeRefreshAt: branchTree?.lastTreeRefreshAt ?? vault.lastTreeRefreshAt,
    lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
    treeRefreshFailureKind: vault.treeRefreshFailureKind,
    treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
    treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
    lastRepositoryMetadataRefreshAt:
      getLastRepositoryMetadataRefreshAt(remoteBranches),
    // Budget automatic refreshes from live remote branches only; retained
    // deleted-upstream rows are local recovery state, not GitHub fan-out.
    remoteBranchCount: countActiveRemoteBranches(remoteBranches),
    hasResolvedBranchTree: branchTree !== null || canUseDefaultBranchSnapshot,
    defaultBranch,
    resolvedBranch,
    branchNotFound,
    infraState: vault.infraState,
    infraLastError: vault.infraLastError,
    infraLastProvisionedAt: vault.infraLastProvisionedAt,
  };
}

export function resolveVaultBranchSelection(args: {
  requestedBranch?: string;
  defaultBranch: string;
  remoteBranches: Array<{
    name: string;
    isDefault: boolean;
    remoteState: "active" | "deleted_upstream";
  }>;
}): {
  defaultBranch?: string;
  resolvedBranch: string;
  branchNotFound: boolean;
} {
  const activeRemoteBranches = args.remoteBranches.filter(
    (branch) => branch.remoteState === "active",
  );
  const requestedBranchMatch =
    args.requestedBranch === undefined
      ? undefined
      : args.remoteBranches.find(
          (branch) => branch.name === args.requestedBranch,
        );
  const defaultBranch =
    activeRemoteBranches.find((branch) => branch.isDefault)?.name ??
    args.defaultBranch;
  const canValidateRequestedBranch = args.remoteBranches.length > 0;
  const requestedBranchDiffersFromDefault =
    args.requestedBranch !== undefined &&
    args.requestedBranch !== defaultBranch;
  const branchNotFound = Boolean(
    args.requestedBranch &&
    ((canValidateRequestedBranch && !requestedBranchMatch) ||
      (!canValidateRequestedBranch && requestedBranchDiffersFromDefault)),
  );
  let resolvedBranch = defaultBranch;
  if (branchNotFound) {
    resolvedBranch = defaultBranch;
  } else if (args.requestedBranch) {
    resolvedBranch = args.requestedBranch;
  }

  return {
    defaultBranch,
    resolvedBranch,
    branchNotFound,
  };
}

export function countActiveRemoteBranches(
  remoteBranches: Array<{
    remoteState: "active" | "deleted_upstream";
  }>,
): number {
  return remoteBranches.filter((branch) => branch.remoteState === "active")
    .length;
}

export const getVaultInfrastructure = query({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.union(
    v.object({
      infraState: v.union(
        v.literal("not_started"),
        v.literal("provisioning"),
        v.literal("ready"),
        v.literal("failed"),
        v.literal("partial"),
      ),
      infraLastError: v.optional(v.string()),
      infraLastProvisionedAt: v.optional(v.number()),
      infrastructure: v.optional(
        v.object({
          status: v.union(
            v.literal("not_started"),
            v.literal("provisioning"),
            v.literal("ready"),
            v.literal("failed"),
            v.literal("partial"),
          ),
          convexProjectId: v.optional(v.string()),
          convexProjectSlug: v.optional(v.string()),
          convexDeploymentName: v.optional(v.string()),
          convexCloudUrl: v.optional(v.string()),
          convexSiteUrl: v.optional(v.string()),
          hosting: v.optional(hostingStateValidator),
        }),
      ),
      domains: v.array(
        v.object({
          branch: v.string(),
          kind: v.union(v.literal("main"), v.literal("branch_preview")),
          url: v.string(),
          source: v.union(
            v.literal("cloudflare_pages_default"),
            v.literal("cloudflare_pages_custom"),
          ),
          active: v.boolean(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      return null;
    }
    if (!isConnectedVault(vault)) {
      return null;
    }

    const infrastructure = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();

    const domains = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    return {
      infraState: vault.infraState,
      infraLastError: vault.infraLastError,
      infraLastProvisionedAt: vault.infraLastProvisionedAt,
      infrastructure: infrastructure
        ? {
            status: infrastructure.status,
            convexProjectId: infrastructure.convexProjectId,
            convexProjectSlug: infrastructure.convexProjectSlug,
            convexDeploymentName: infrastructure.convexDeploymentName,
            convexCloudUrl: infrastructure.convexCloudUrl,
            convexSiteUrl: infrastructure.convexSiteUrl,
            hosting: infrastructure.hosting,
          }
        : undefined,
      domains: domains.map((domain) => ({
        branch: domain.branch,
        kind: domain.kind,
        url: domain.url,
        source: domain.source,
        active: domain.active,
      })),
    };
  },
});

export const getByRepositoryFullName = internalQuery({
  args: {
    userId: v.id("users"),
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await getVaultByRepositoryHelper(ctx, {
      userId: args.userId,
      repositoryFullName: args.repositoryFullName,
      branch: args.branch,
    });
  },
});

const REFRESH_DEBOUNCE_MS = TREE_REFRESH_DEBOUNCE_MS;
const STALE_LOCK_MS = TREE_REFRESH_STALE_LOCK_MS;

function getLaterCooldownUntil(
  existingCooldownUntil: number | undefined,
  nextCooldownUntil: number | undefined,
): number | undefined {
  if (typeof existingCooldownUntil !== "number") {
    return nextCooldownUntil;
  }
  if (typeof nextCooldownUntil !== "number") {
    return existingCooldownUntil;
  }
  return Math.max(existingCooldownUntil, nextCooldownUntil);
}

// Atomically claim the tree refresh lock for a vault.
// Returns the claimed timestamp when this caller should proceed.
export const claimTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    force: v.optional(v.boolean()),
    debounceMs: v.optional(v.number()),
    skipRecentSuccessDebounce: v.optional(v.boolean()),
  },
  returns: v.object({
    claimed: v.boolean(),
    startedAt: v.optional(v.number()),
    reason: v.optional(
      v.union(
        v.literal("cooldown"),
        v.literal("recent_success"),
        v.literal("in_progress"),
      ),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    claimed: boolean;
    startedAt?: number;
    reason?: "cooldown" | "recent_success" | "in_progress";
  }> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) return { claimed: false };

    const now = Date.now();
    const debounceMs =
      args.debounceMs !== undefined
        ? Math.max(0, Math.floor(args.debounceMs))
        : REFRESH_DEBOUNCE_MS;

    if (!args.force) {
      if (
        typeof vault.treeRefreshCooldownUntil === "number" &&
        vault.treeRefreshCooldownUntil > now
      ) {
        return { claimed: false, reason: "cooldown" };
      }

      // Skip if last successful refresh was recent
      if (
        !args.skipRecentSuccessDebounce &&
        vault.lastTreeRefreshAt &&
        now - vault.lastTreeRefreshAt < debounceMs
      ) {
        return { claimed: false, reason: "recent_success" };
      }

      // Skip if another refresh is already in progress (and not stale)
      if (
        vault.treeRefreshStartedAt &&
        now - vault.treeRefreshStartedAt < STALE_LOCK_MS
      ) {
        return { claimed: false, reason: "in_progress" };
      }
    }

    // Claim the lock
    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: now });
    return { claimed: true, startedAt: now };
  },
});

// Optimistically start tree refresh (for immediate UI feedback)
export const startTreeRefreshOptimistic = mutation({
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) return;

    // Optimistically set the refresh started timestamp
    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: Date.now() });
  },
});

// Release the tree refresh lock and record completion time.
export const releaseTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    startedAt: v.number(),
    markRefreshed: v.optional(v.boolean()),
    updateLastTreeRefreshAt: v.optional(v.boolean()),
    failureKind: v.optional(TreeRefreshFailureKind),
    failureMessage: v.optional(v.string()),
    cooldownUntil: v.optional(v.number()),
  },
  returns: object({
    released: boolean(),
  }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return { released: false };
    }

    if (
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
      })
    ) {
      return { released: false };
    }

    const now = Date.now();
    const cooldownUntil = getLaterCooldownUntil(
      vault.treeRefreshCooldownUntil,
      args.cooldownUntil,
    );
    const shouldPreserveCooldownState =
      args.markRefreshed !== false &&
      shouldPreserveTreeRefreshCooldownAfterSuccess({
        claimedStartedAt: args.startedAt,
        lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
        cooldownUntil,
        now,
      });
    await ctx.db.patch(
      args.vaultId,
      args.markRefreshed === false
        ? {
            treeRefreshStartedAt: undefined,
            lastTreeRefreshFailedAt: now,
            treeRefreshFailureKind: args.failureKind ?? "failed",
            treeRefreshFailureMessage: args.failureMessage,
            treeRefreshCooldownUntil: cooldownUntil,
          }
        : {
            lastTreeRefreshAt:
              args.updateLastTreeRefreshAt === false
                ? vault.lastTreeRefreshAt
                : now,
            treeRefreshStartedAt: undefined,
            // Preserve any newer repo-level cooldown that landed while this
            // tree refresh was still in flight so a late success cannot reopen
            // GitHub traffic immediately.
            lastTreeRefreshFailedAt: shouldPreserveCooldownState
              ? vault.lastTreeRefreshFailedAt
              : undefined,
            treeRefreshFailureKind: shouldPreserveCooldownState
              ? vault.treeRefreshFailureKind
              : undefined,
            treeRefreshFailureMessage: shouldPreserveCooldownState
              ? vault.treeRefreshFailureMessage
              : undefined,
            treeRefreshCooldownUntil: shouldPreserveCooldownState
              ? cooldownUntil
              : undefined,
          },
    );
    return { released: true };
  },
});

export const recordTreeRefreshFailure = internalMutation({
  args: {
    vaultId: id("vaults"),
    startedAt: optional(number()),
    failureKind: optional(TreeRefreshFailureKind),
    failureMessage: optional(string()),
    cooldownUntil: optional(number()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return null;
    }
    // Ignore stale fallback failures once another refresh claim has taken over.
    if (
      typeof args.startedAt === "number" &&
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
      })
    ) {
      return null;
    }

    await ctx.db.patch(args.vaultId, {
      lastTreeRefreshFailedAt: Date.now(),
      treeRefreshFailureKind: args.failureKind ?? "failed",
      treeRefreshFailureMessage: args.failureMessage,
      treeRefreshCooldownUntil: getLaterCooldownUntil(
        vault.treeRefreshCooldownUntil,
        args.cooldownUntil,
      ),
    });
    return null;
  },
});

// Update vault tree internal mutation
export const updateVaultTree = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    treeData: GithubTreeData,
    commitSHA: v.optional(v.string()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);

    if (!vault) {
      throw new Error("Vault not found");
    }

    const patchData: {
      treeSHA: string;
      treeData: typeof args.treeData;
      commitSHA?: string;
    } = {
      treeSHA: args.treeData.sha,
      treeData: args.treeData,
    };

    if (typeof args.commitSHA === "string") {
      patchData.commitSHA = args.commitSHA;
    }
    await ctx.db.patch(args.vaultId, patchData);

    return null;
  },
});
