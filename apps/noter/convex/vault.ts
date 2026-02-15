import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { GithubTreeData } from "./schema";
import { Id } from "./_generated/dataModel";
import { getUserId } from "./common";

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

    // 8. Delete the vault
    await ctx.db.delete(vault._id).catch((e) => {
      console.error("vault delete", e);
    });
  },
});

// Get a specific vault by repository full name for a user
export const getVaultByRepository = query({
  args: {
    repositoryFullName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    return await getVaultByRepositoryHelper(ctx, {
      userId,
      repositoryFullName: args.repositoryFullName,
    });
  },
});

// MARK: Internal

// mutation to add new vault
export const addVault = internalMutation({
  args: {
    ghRepoId: v.string(),
    ghRepoOwner: v.string(),
    ghRepoName: v.string(),
    treeSHA: v.string(),
    commitSHA: v.optional(v.string()),
    treeData: GithubTreeData,
    state: v.union(v.literal("copying_files"), v.literal("ready")),
    isNoterManaged: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"vaults">> => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Check if vault already exists for this user and repository
    const existingVault = await ctx.db
      .query("vaults")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), currentUser._id),
          q.eq(q.field("ghRepoId"), args.ghRepoId),
        ),
      )
      .first();

    if (existingVault) {
      if (!existingVault.commitSHA && args.commitSHA) {
        await ctx.db.patch(existingVault._id, { commitSHA: args.commitSHA });
      }
      return existingVault._id;
    }

    return await ctx.db.insert("vaults", {
      userId: currentUser._id,
      ghRepoId: args.ghRepoId,
      ghRepoOwner: args.ghRepoOwner,
      ghRepoName: args.ghRepoName,
      treeSHA: args.treeSHA,
      commitSHA: args.commitSHA,
      treeData: args.treeData,
      state: args.state,
      isNoterManaged: args.isNoterManaged ?? false,
      infraState: "not_started",
      infraLastError: undefined,
      infraLastProvisionedAt: undefined,
      infraProvisioningStartedAt: undefined,
    });
  },
});

export const markVaultAsReady = internalMutation({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.vaultId, { state: "ready" });
  },
});

export const updateVaultDevcontainerConfig = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    devcontainerConfig: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      devcontainerConfig: args.devcontainerConfig,
    });
    return null;
  },
});

export const updateVaultDaytonaSandbox = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    sandboxId: v.string(),
    sandboxName: v.optional(v.string()),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      daytonaSandboxId: args.sandboxId,
      daytonaSandboxName: args.sandboxName,
      daytonaSandboxCreatedAt: args.createdAt,
    });
    return null;
  },
});

// Get user's vaults with optional file staging stats
export const getUserVaults = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("vaults"),
      _creationTime: v.number(),
      ghRepoOwner: v.string(),
      ghRepoName: v.string(),
      repositoryFullName: v.string(),
      fileCount: v.number(),
      lastEditTime: v.optional(v.number()),
      state: v.union(v.literal("copying_files"), v.literal("ready")),
      isNoterManaged: v.boolean(),
      hasConvexProvision: v.boolean(),
      hasNetlifyProvision: v.boolean(),
      daytonaSandboxId: v.optional(v.string()),
      daytonaSandboxName: v.optional(v.string()),
      daytonaSandboxCreatedAt: v.optional(v.number()),
      infraState: v.union(
        v.literal("not_started"),
        v.literal("provisioning"),
        v.literal("ready"),
        v.literal("failed"),
        v.literal("partial"),
      ),
      infraProductionUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, _args) => {
    const userId = await getUserId(ctx);

    // Get user's vaults
    const vaults = await ctx.db
      .query("vaults")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    // Get staging stats for each vault
    const vaultResults = await Promise.all(
      vaults.map(async (vault) => {
        const stagingData = await ctx.db
          .query("fileStaging")
          .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
          .collect();

        const fileCount = stagingData.filter(
          (file) =>
            file.content !== file.initialContent ||
            file.fileDeleted ||
            file.filePath !== file.initialFilePath,
        ).length;

        const lastEditTime =
          stagingData.length > 0
            ? Math.max(...stagingData.map((s) => s.lastEditTime))
            : undefined;

        const repositoryFullName = `${vault.ghRepoOwner}/${vault.ghRepoName}`;
        const infra = await ctx.db
          .query("vaultInfrastructure")
          .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
          .first();
        const hasConvexProvision =
          typeof infra?.convexProjectId === "string" ||
          typeof infra?.convexDeploymentName === "string";
        const hasNetlifyProvision = typeof infra?.netlifySiteId === "string";

        return {
          _id: vault._id,
          _creationTime: vault._creationTime,
          ghRepoOwner: vault.ghRepoOwner,
          ghRepoName: vault.ghRepoName,
          repositoryFullName,
          fileCount,
          lastEditTime,
          state: vault.state,
          isNoterManaged: vault.isNoterManaged ?? false,
          hasConvexProvision,
          hasNetlifyProvision,
          daytonaSandboxId: vault.daytonaSandboxId,
          daytonaSandboxName: vault.daytonaSandboxName,
          daytonaSandboxCreatedAt: vault.daytonaSandboxCreatedAt,
          infraState: vault.infraState ?? "not_started",
          infraProductionUrl:
            infra?.netlifyProductionUrl ?? infra?.netlifyDefaultUrl,
        };
      }),
    );

    // Sort by last edit time if available, otherwise by creation time
    return vaultResults.sort((a, b) => {
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

async function getVaultByRepositoryHelper(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    repositoryFullName: string;
  },
) {
  const [owner, name] = args.repositoryFullName.split("/");
  if (!owner || !name) {
    throw new Error("Invalid repository full name");
  }

  const vault = await ctx.db
    .query("vaults")
    .filter((q) =>
      q.and(
        q.eq(q.field("userId"), args.userId),
        q.eq(q.field("ghRepoOwner"), owner),
        q.eq(q.field("ghRepoName"), name),
      ),
    )
    .first();

  if (!vault) {
    return null;
  }

  return {
    _id: vault._id,
    _creationTime: vault._creationTime,
    ghRepoOwner: vault.ghRepoOwner,
    ghRepoName: vault.ghRepoName,
    repositoryFullName: args.repositoryFullName,
    treeSHA: vault.treeSHA,
    commitSHA: vault.commitSHA,
    treeData: vault.treeData,
    treeRefreshStartedAt: vault.treeRefreshStartedAt,
    lastTreeRefreshAt: vault.lastTreeRefreshAt,
    infraState: vault.infraState ?? "not_started",
    infraLastError: vault.infraLastError,
    infraLastProvisionedAt: vault.infraLastProvisionedAt,
  };
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
          netlifySiteId: v.optional(v.string()),
          netlifySiteName: v.optional(v.string()),
          netlifyDefaultUrl: v.optional(v.string()),
          netlifyProductionUrl: v.optional(v.string()),
        }),
      ),
      domains: v.array(
        v.object({
          branch: v.string(),
          kind: v.union(v.literal("main"), v.literal("branch_preview")),
          url: v.string(),
          source: v.union(v.literal("netlify_default"), v.literal("netlify_custom")),
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

    const infrastructure = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();

    const domains = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    return {
      infraState: vault.infraState ?? "not_started",
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
            netlifySiteId: infrastructure.netlifySiteId,
            netlifySiteName: infrastructure.netlifySiteName,
            netlifyDefaultUrl: infrastructure.netlifyDefaultUrl,
            netlifyProductionUrl: infrastructure.netlifyProductionUrl,
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
  },
  handler: async (ctx, args) => {
    return await getVaultByRepositoryHelper(ctx, {
      userId: args.userId,
      repositoryFullName: args.repositoryFullName,
    });
  },
});

const REFRESH_DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes
const STALE_LOCK_MS = 3 * 60 * 1000; // 3 minutes — consider a lock stale if action crashed

// Atomically claim the tree refresh lock for a vault.
// Returns { claimed: true } if this caller should proceed, { claimed: false } if skipped.
export const claimTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    force: v.optional(v.boolean()),
    debounceMs: v.optional(v.number()),
  },
  returns: v.object({ claimed: v.boolean() }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) return { claimed: false };

    const now = Date.now();
    const debounceMs =
      args.debounceMs !== undefined
        ? Math.max(0, Math.floor(args.debounceMs))
        : REFRESH_DEBOUNCE_MS;

    if (!args.force) {
      // Skip if last successful refresh was recent
      if (
        vault.lastTreeRefreshAt &&
        now - vault.lastTreeRefreshAt < debounceMs
      ) {
        return { claimed: false };
      }

      // Skip if another refresh is already in progress (and not stale)
      if (
        vault.treeRefreshStartedAt &&
        now - vault.treeRefreshStartedAt < STALE_LOCK_MS
      ) {
        return { claimed: false };
      }
    }

    // Claim the lock
    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: now });
    return { claimed: true };
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
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) return;

    await ctx.db.patch(args.vaultId, {
      lastTreeRefreshAt: Date.now(),
      treeRefreshStartedAt: undefined,
    });
  },
});

// Update vault tree internal mutation
export const updateVaultTree = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    treeData: GithubTreeData,
    commitSHA: v.optional(v.string()),
  },
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

    return await ctx.db.patch(args.vaultId, patchData);
  },
});
