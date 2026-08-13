import { v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import {
  requireBillingResourceCapacityForAuthority,
  type BillingResourceAuthority,
} from "../billingResourceQuotas";
import { requireVaultForUser, requireVaultOrganization } from "../organizationAccess";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { vVaultProviderResourceOrigin } from "./model";
import {
  requireManualProviderWriteCheckpoint,
  requireUserVaultInfrastructureIdle,
  recordManagedProviderWrite,
} from "./infrastructureOperation";
import { isLiveConnectedVault } from "./state";
import { requireActiveVaultProvisioningAuthority } from "../vaultWorkflowAuthority";

const { array, id, literal, null: nullValue, object, string, union } = v;

const workerConfigurationContextFields = {
  organizationId: id("organizations"),
  ghRepoId: string(),
  owner: string(),
  name: string(),
  defaultBranch: string(),
  accountId: string(),
  workerName: string(),
  workerTag: string(),
};
export const vWorkerConfigurationContext = object(workerConfigurationContextFields);
export type WorkerConfigurationContext = Infer<typeof vWorkerConfigurationContext>;

export const vManagedWorkerConfigurationContext = object({
  ...workerConfigurationContextFields,
  rootDirectory: string(),
});
export type ManagedWorkerConfigurationContext = Infer<typeof vManagedWorkerConfigurationContext>;

export const vWorkerConvexProjectConfigurationContext = object({
  ...workerConfigurationContextFields,
  convexProject: object({
    convexProjectId: id("vaultConvexProjects"),
    teamId: string(),
    projectId: string(),
  }),
});
export type WorkerConvexProjectConfigurationContext = Infer<
  typeof vWorkerConvexProjectConfigurationContext
>;

export const vManagedWorkerConvexProjectConfigurationContext = object({
  ...workerConfigurationContextFields,
  rootDirectory: string(),
  convexProject: object({
    convexProjectId: id("vaultConvexProjects"),
    teamId: string(),
    projectId: string(),
  }),
});
export type ManagedWorkerConvexProjectConfigurationContext = Infer<
  typeof vManagedWorkerConvexProjectConfigurationContext
>;

type WorkerGraphReadCtx = Pick<QueryCtx, "db">;

async function requireConnectedVault(
  ctx: WorkerGraphReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
) {
  const vault = await requireVaultForUser(ctx.db, args);
  if (!isLiveConnectedVault(vault)) {
    throw new Error("Vault not found.");
  }
  return vault;
}

async function requireActiveManagedProvisioning(
  ctx: WorkerGraphReadCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): Promise<{
  vault: Extract<Doc<"vaults">, { state: "connected" }>;
  plan: Doc<"workflow_vaultProvisioning_plans">;
}> {
  const authority = await requireActiveVaultProvisioningAuthority(ctx.db, args);
  if (!isLiveConnectedVault(authority.vault)) {
    throw new Error("Vault not found.");
  }
  const [writeLock, plan] = await Promise.all([
    ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
    ctx.db
      .query("workflow_vaultProvisioning_plans")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
  ]);
  if (authority.run.trigger !== "create" && authority.run.trigger !== "retry") {
    throw new Error("Managed provisioning run does not match vault.");
  }
  if (
    !writeLock ||
    writeLock.owner.kind !== "managed_run" ||
    writeLock.state !== "active" ||
    writeLock.owner.runId !== args.runId
  ) {
    throw new Error("Managed provisioning run no longer holds the write lock.");
  }
  if (!plan) {
    throw new Error("Infrastructure provisioning plan not found for vault.");
  }
  return { vault: authority.vault, plan };
}

async function requireWorker(
  ctx: WorkerGraphReadCtx,
  vault: Extract<Doc<"vaults">, { state: "connected" }>,
  args: {
    vaultId: Id<"vaults">;
    workerId: Id<"vaultCloudflareWorkers">;
  },
) {
  const worker = await ctx.db.get(args.workerId);
  if (
    !worker ||
    worker.vaultId !== args.vaultId ||
    worker.organizationId !== vault.organizationId ||
    worker.accountId !== vault.cloudflareAccountId
  ) {
    throw new Error("Cloudflare Worker attachment not found.");
  }
  return worker;
}

async function requireConvexProject(
  ctx: WorkerGraphReadCtx,
  vault: Extract<Doc<"vaults">, { state: "connected" }>,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    convexProjectId: Id<"vaultConvexProjects">;
  },
) {
  const project = await ctx.db.get(args.convexProjectId);
  if (
    !project ||
    project.vaultId !== args.vaultId ||
    project.organizationId !== vault.organizationId ||
    project.teamId !== vault.convexTeamId
  ) {
    throw new Error("Convex project attachment not found.");
  }
  return project;
}

async function readMatchingWorker(
  ctx: WorkerGraphReadCtx,
  args: {
    vaultId: Id<"vaults">;
    organizationId: Id<"organizations">;
    accountId: string;
    workerName: string;
    workerTag: string;
  },
) {
  const [sameName, sameTag] = await Promise.all([
    ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_account_and_worker", (q) =>
        q.eq("accountId", args.accountId).eq("workerName", args.workerName),
      )
      .unique(),
    ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_account_and_worker_tag", (q) =>
        q.eq("accountId", args.accountId).eq("workerTag", args.workerTag),
      )
      .unique(),
  ]);
  if (sameName && sameTag && sameName._id !== sameTag._id) {
    throw new Error("Cloudflare Worker is already attached.");
  }
  const existing = sameName ?? sameTag;
  if (!existing) {
    return null;
  }
  if (
    existing.vaultId === args.vaultId &&
    existing.organizationId === args.organizationId &&
    existing.accountId === args.accountId &&
    existing.workerName === args.workerName &&
    existing.workerTag === args.workerTag
  ) {
    return existing;
  }
  throw new Error("Cloudflare Worker is already attached.");
}

async function insertWorker(
  ctx: Pick<MutationCtx, "db">,
  vault: Extract<Doc<"vaults">, { state: "connected" }>,
  args: {
    vaultId: Id<"vaults">;
    billingAuthority: BillingResourceAuthority;
    accountId: string;
    workerName: string;
    workerTag: string;
    origin: "provisioned" | "selected_existing";
  },
): Promise<Id<"vaultCloudflareWorkers">> {
  if (args.accountId !== vault.cloudflareAccountId) {
    throw new Error("Cloudflare Worker account does not match the vault destination.");
  }
  const existing = await readMatchingWorker(ctx, {
    vaultId: args.vaultId,
    organizationId: vault.organizationId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
  });
  if (existing) {
    if (args.origin === "provisioned" && existing.origin !== "provisioned") {
      await ctx.db.patch(existing._id, { origin: "provisioned" });
    }
    return existing._id;
  }

  await requireBillingResourceCapacityForAuthority(ctx, {
    authority: args.billingAuthority,
  });

  return await ctx.db.insert("vaultCloudflareWorkers", {
    vaultId: args.vaultId,
    organizationId: vault.organizationId,
    accountId: args.accountId,
    workerName: args.workerName,
    workerTag: args.workerTag,
    origin: args.origin,
  });
}

export const attachWorkers = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workers: array(
      object({
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        origin: vVaultProviderResourceOrigin,
      }),
    ),
  },
  returns: array(id("vaultCloudflareWorkers")),
  handler: async (ctx, args): Promise<Array<Id<"vaultCloudflareWorkers">>> => {
    const vault = await requireUserVaultInfrastructureIdle(ctx, args);
    if (args.workers.some((worker) => worker.accountId !== vault.cloudflareAccountId)) {
      throw new Error("Cloudflare Worker account does not match the vault destination.");
    }

    const workerNames = new Set<string>();
    const workerTags = new Set<string>();
    for (const worker of args.workers) {
      const nameIdentity = `${worker.accountId}\u0000${worker.workerName}`;
      const tagIdentity = `${worker.accountId}\u0000${worker.workerTag}`;
      if (workerNames.has(nameIdentity) || workerTags.has(tagIdentity)) {
        throw new Error("Cloudflare Worker appears more than once in the attachment request.");
      }
      workerNames.add(nameIdentity);
      workerTags.add(tagIdentity);
    }

    const workerAttachmentIds: Array<Id<"vaultCloudflareWorkers">> = [];
    for (const worker of args.workers) {
      workerAttachmentIds.push(
        await insertWorker(ctx, vault, {
          vaultId: args.vaultId,
          billingAuthority: {
            kind: "user",
            organizationId: vault.organizationId,
            userId: args.userId,
          },
          ...worker,
        }),
      );
    }
    return workerAttachmentIds;
  },
});

export const detachWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const vault = await requireUserVaultInfrastructureIdle(ctx, args);
    const worker = await requireWorker(ctx, vault, args);
    if (
      worker.accountId !== args.accountId ||
      worker.workerName !== args.workerName ||
      worker.workerTag !== args.workerTag
    ) {
      throw new Error("Cloudflare Worker attachment changed before removal.");
    }
    await ctx.db.delete(worker._id);
    return null;
  },
});

export const readManagedWorkerCreateCheckpoint = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    accountId: string(),
    workerName: string(),
  },
  returns: union(
    object({ state: literal("planned") }),
    object({ state: literal("creating") }),
    object({
      state: literal("created"),
      workerTag: string(),
    }),
  ),
  handler: async (ctx, args) => {
    const { plan, vault } = await requireActiveManagedProvisioning(ctx, args);
    if (
      vault.cloudflareAccountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    switch (plan.cloudflare.state) {
      case "planned":
        return { state: "planned" as const };
      case "creating":
        return { state: "creating" as const };
      case "created":
        return {
          state: "created" as const,
          workerTag: plan.cloudflare.workerTag,
        };
    }
  },
});

export const beginManagedWorkerCreate = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    accountId: string(),
    workerName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const { plan, vault } = await requireActiveManagedProvisioning(ctx, args);
    if (
      vault.cloudflareAccountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    if (plan.cloudflare.state !== "planned") {
      throw new Error("Managed Cloudflare Worker creation already started.");
    }
    await ctx.db.patch(plan._id, {
      cloudflare: {
        state: "creating",
        workerName: args.workerName,
        rootDirectory: plan.cloudflare.rootDirectory,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordManagedWorkerCreated = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> => {
    const { plan, vault } = await requireActiveManagedProvisioning(ctx, args);
    if (
      vault.cloudflareAccountId !== args.accountId ||
      plan.cloudflare.workerName !== args.workerName
    ) {
      throw new Error("Managed Cloudflare Worker does not match the provisioning plan.");
    }
    let workerId: Id<"vaultCloudflareWorkers">;
    if (plan.cloudflare.state === "created") {
      if (plan.cloudflare.workerTag !== args.workerTag) {
        throw new Error("Managed Cloudflare Worker checkpoint already names another Worker.");
      }
      workerId = await insertWorker(ctx, vault, {
        vaultId: args.vaultId,
        billingAuthority: {
          kind: "vault_provisioning",
          runId: args.runId,
          userId: args.userId,
          vaultId: args.vaultId,
        },
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        origin: "provisioned",
      });
    } else {
      if (plan.cloudflare.state !== "creating") {
        throw new Error("Managed Cloudflare Worker creation was not started.");
      }
      await ctx.db.patch(plan._id, {
        cloudflare: {
          state: "created",
          workerName: args.workerName,
          workerTag: args.workerTag,
          rootDirectory: plan.cloudflare.rootDirectory,
        },
        updatedAt: Date.now(),
      });
      workerId = await insertWorker(ctx, vault, {
        vaultId: args.vaultId,
        billingAuthority: {
          kind: "vault_provisioning",
          runId: args.runId,
          userId: args.userId,
          vaultId: args.vaultId,
        },
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        origin: "provisioned",
      });
    }
    await recordManagedProviderWrite(ctx, {
      vaultId: args.vaultId,
      runId: args.runId,
      provider: "cloudflare",
    });
    return workerId;
  },
});

export const recordManualConnectedWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> => {
    const vault = await requireManualProviderWriteCheckpoint(ctx, {
      vaultId: args.vaultId,
      actionId: args.actionId,
      userId: args.userId,
    });
    return await insertWorker(ctx, vault, {
      vaultId: args.vaultId,
      billingAuthority: {
        kind: "manual_provider_write",
        actionId: args.actionId,
        userId: args.userId,
        vaultId: args.vaultId,
      },
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      origin: "selected_existing",
    });
  },
});

export const recordManualWorkerCreated = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: id("vaultCloudflareWorkers"),
  handler: async (ctx, args): Promise<Id<"vaultCloudflareWorkers">> => {
    const vault = await requireManualProviderWriteCheckpoint(ctx, {
      vaultId: args.vaultId,
      actionId: args.actionId,
      userId: args.userId,
    });
    return await insertWorker(ctx, vault, {
      vaultId: args.vaultId,
      billingAuthority: {
        kind: "manual_provider_write",
        actionId: args.actionId,
        userId: args.userId,
        vaultId: args.vaultId,
      },
      accountId: args.accountId,
      workerName: args.workerName,
      workerTag: args.workerTag,
      origin: "provisioned",
    });
  },
});

export const readWorkerConfigurationContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: vWorkerConfigurationContext,
  handler: async (ctx, args) => {
    const vault = await requireConnectedVault(ctx, args);
    const [worker, organization] = await Promise.all([
      requireWorker(ctx, vault, args),
      requireVaultOrganization(ctx.db, vault),
    ]);
    return {
      organizationId: vault.organizationId,
      ghRepoId: vault.ghRepoId,
      owner: organization.githubOwnerLogin,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
    };
  },
});

export const readManagedWorkerConfigurationContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: vManagedWorkerConfigurationContext,
  handler: async (ctx, args) => {
    const { plan, vault } = await requireActiveManagedProvisioning(ctx, args);
    const [worker, organization] = await Promise.all([
      requireWorker(ctx, vault, args),
      requireVaultOrganization(ctx.db, vault),
    ]);
    if (
      plan.cloudflare.state !== "created" ||
      vault.cloudflareAccountId !== worker.accountId ||
      plan.cloudflare.workerName !== worker.workerName ||
      plan.cloudflare.workerTag !== worker.workerTag
    ) {
      throw new Error("Managed Cloudflare Worker does not match the active provisioning run.");
    }
    return {
      organizationId: vault.organizationId,
      ghRepoId: vault.ghRepoId,
      owner: organization.githubOwnerLogin,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: plan.cloudflare.rootDirectory,
    };
  },
});

export const readWorkerConvexProjectConfigurationContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: vWorkerConvexProjectConfigurationContext,
  handler: async (ctx, args) => {
    const vault = await requireConnectedVault(ctx, args);
    const [worker, project, organization] = await Promise.all([
      requireWorker(ctx, vault, args),
      requireConvexProject(ctx, vault, args),
      requireVaultOrganization(ctx.db, vault),
    ]);
    return {
      organizationId: vault.organizationId,
      ghRepoId: vault.ghRepoId,
      owner: organization.githubOwnerLogin,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      convexProject: {
        convexProjectId: project._id,
        teamId: project.teamId,
        projectId: project.projectId,
      },
    };
  },
});

export const readManagedWorkerConvexProjectConfigurationContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    runId: id("workflow_vaultProvisioning_runs"),
    workerId: id("vaultCloudflareWorkers"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: vManagedWorkerConvexProjectConfigurationContext,
  handler: async (ctx, args) => {
    const { plan, vault } = await requireActiveManagedProvisioning(ctx, args);
    const [worker, project, organization] = await Promise.all([
      requireWorker(ctx, vault, args),
      requireConvexProject(ctx, vault, args),
      requireVaultOrganization(ctx.db, vault),
    ]);
    if (
      plan.cloudflare.state !== "created" ||
      vault.cloudflareAccountId !== worker.accountId ||
      plan.cloudflare.workerName !== worker.workerName ||
      plan.cloudflare.workerTag !== worker.workerTag
    ) {
      throw new Error("Managed Cloudflare Worker does not match the active provisioning run.");
    }
    if (
      plan.convex.state !== "created" ||
      vault.convexTeamId !== project.teamId ||
      plan.convex.projectId !== project.projectId ||
      !("convexConfigPath" in project) ||
      plan.convexConfigPath !== project.convexConfigPath
    ) {
      throw new Error("Managed Convex project does not match the active provisioning run.");
    }
    return {
      organizationId: vault.organizationId,
      ghRepoId: vault.ghRepoId,
      owner: organization.githubOwnerLogin,
      name: vault.name,
      defaultBranch: vault.defaultBranch,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: plan.cloudflare.rootDirectory,
      convexProject: {
        convexProjectId: project._id,
        teamId: project.teamId,
        projectId: project.projectId,
      },
    };
  },
});
