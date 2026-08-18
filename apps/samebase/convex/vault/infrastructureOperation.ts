import { v, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  vManualProviderWriteAction,
  type ManualProviderWriteAction,
} from "../appProvisioningModel";
import { toErrorMessage } from "../jsonUtils";
import { requireVaultForUser } from "../organizationAccess";
import { requireOrganizationNotBillingLimited } from "../organizationBillingLimits";
import { recordOrganizationLastUsedBuildToken } from "../organizations";
import { assertConnectedVault, isLiveConnectedVault } from "./state";

type InfrastructureOperationReadCtx = Pick<QueryCtx, "db">;
type ProviderWrite = Doc<"workflow_vaultProvisioning_writeLocks">;
type ProvisioningRun = Doc<"workflow_vaultProvisioning_runs">;
export type ManualProviderWrite = Extract<
  ProviderWrite,
  { owner: { kind: "manual_provider_write" } }
>;

const { array, id, literal, number, object, optional, string, union } = v;
const vManualProviderWriteClaim = object({
  deadlineAt: number(),
});
type ManualProviderWriteClaim = Infer<typeof vManualProviderWriteClaim>;
export const vManualWorkerCreateContinuation = union(
  object({ state: literal("generic") }),
  object({
    state: literal("managed"),
    convexProjectId: id("vaultConvexProjects"),
  }),
);
export type ManualWorkerCreateContinuation = Infer<typeof vManualWorkerCreateContinuation>;
const vManualWorkerCreateClaim = object({
  deadlineAt: number(),
  continuation: vManualWorkerCreateContinuation,
});
type ManualWorkerCreateClaim = Infer<typeof vManualWorkerCreateClaim>;

type ManualWorkerCreateContinuationCheckpoint =
  | Extract<ManualWorkerCreateContinuation, { state: "generic" }>
  | (Extract<ManualWorkerCreateContinuation, { state: "managed" }> & {
      plan: Doc<"workflow_vaultProvisioning_plans">;
    });

export const MANUAL_PROVIDER_ACTION_LIMIT_MS = 5 * 60 * 1000;
export const MANUAL_PROVIDER_WRITE_EXPIRY_MS = 10 * 60 * 1000;
const vProvider = union(literal("convex"), literal("cloudflare"));
type Provider = Infer<typeof vProvider>;

export type VaultInfrastructureOperation =
  | { kind: "none" }
  | {
      kind: "managed_run";
      runId: Id<"workflow_vaultProvisioning_runs">;
      run: ProvisioningRun | null;
      updatedAt: number;
    }
  | {
      kind: "manual_provider_write";
      write: ManualProviderWrite;
    };

export type VaultInfrastructureState = {
  operation: VaultInfrastructureOperation;
  providerWrite: ProviderWrite | null;
};

export function readManualProviderWriteProviders(action: ManualProviderWriteAction): Provider[] {
  switch (action) {
    case "create_convex_project":
      return ["convex"];
    case "connect_cloudflare_worker":
    case "configure_workers_builds_for_github":
    case "create_cloudflare_worker":
      return ["cloudflare"];
    case "create_cloudflare_worker_with_convex":
    case "rotate_convex_deploy_keys_for_workers_builds":
      return ["convex", "cloudflare"];
    default:
      action satisfies never;
      throw new Error("Unknown manual provider write action.");
  }
}

export async function readManualWorkerCreateContinuation(
  ctx: InfrastructureOperationReadCtx,
  vault: Extract<Doc<"vaults">, { state: "connected" }>,
  args: {
    vaultId: Id<"vaults">;
    accountId: string;
  },
): Promise<ManualWorkerCreateContinuationCheckpoint> {
  const [plan, attachedWorker] = await Promise.all([
    ctx.db
      .query("workflow_vaultProvisioning_plans")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
    ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first(),
  ]);
  if (
    !plan ||
    plan.cloudflare.buildTokenUuid !== null ||
    attachedWorker ||
    (plan.cloudflare.state !== "planned" && plan.cloudflare.state !== "created")
  ) {
    return { state: "generic" };
  }
  if (args.accountId !== vault.cloudflareAccountId) {
    throw new Error("Cloudflare Worker account does not match the vault destination.");
  }
  if (plan.convex.state !== "created") {
    throw new Error("The managed Convex project is not ready for Cloudflare setup.");
  }
  const convexPlan = plan.convex;
  const project = await ctx.db
    .query("vaultConvexProjects")
    .withIndex("by_project", (q) => q.eq("projectId", convexPlan.projectId))
    .unique();
  if (
    !project ||
    project.vaultId !== args.vaultId ||
    project.organizationId !== vault.organizationId ||
    project.teamId !== vault.convexTeamId ||
    !("convexConfigPath" in project) ||
    project.convexConfigPath !== plan.convexConfigPath
  ) {
    throw new Error("The managed Convex project attachment does not match its plan.");
  }
  return {
    state: "managed",
    plan,
    convexProjectId: project._id,
  };
}

/**
 * Reads the one vault-level operation that can change provider intent or
 * infrastructure. A provisioning plan is not an operation.
 */
export async function readVaultInfrastructureState(
  ctx: InfrastructureOperationReadCtx,
  vault: Doc<"vaults">,
): Promise<VaultInfrastructureState> {
  const providerWrite = await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
    .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
    .unique();
  if (providerWrite) {
    const owner = providerWrite.owner;
    if (owner.kind === "manual_provider_write" && providerWrite.state === "active") {
      return {
        operation: {
          kind: "manual_provider_write",
          write: { ...providerWrite, owner },
        },
        providerWrite,
      };
    }
  }
  if (providerWrite?.owner.kind === "managed_run" && providerWrite.state === "active") {
    const run = await ctx.db.get(providerWrite.owner.runId);
    return {
      operation: {
        kind: "managed_run",
        runId: providerWrite.owner.runId,
        run,
        updatedAt: providerWrite.updatedAt,
      },
      providerWrite,
    };
  }
  return { operation: { kind: "none" }, providerWrite };
}

/**
 * Checks attachment mutation ownership and operation exclusion in one
 * transaction.
 */
export async function requireUserVaultInfrastructureIdle(
  ctx: InfrastructureOperationReadCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<Extract<Doc<"vaults">, { state: "connected" }>> {
  const vault = await requireVaultForUser(ctx.db, args);
  if (vault.state !== "connected") {
    throw new Error("Vault not found.");
  }
  const connectedVault = assertConnectedVault(vault);
  const infrastructure = await readVaultInfrastructureState(ctx, connectedVault);
  if (infrastructure.operation.kind !== "none") {
    throw new Error("Another vault infrastructure operation is active.");
  }
  return connectedVault;
}

export async function recordManagedProviderWrite(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    provider: "convex" | "cloudflare";
  },
): Promise<void> {
  const write = await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .unique();
  if (
    !write ||
    write.owner.kind !== "managed_run" ||
    write.owner.runId !== args.runId ||
    write.state !== "active"
  ) {
    throw new Error("Managed provisioning run no longer holds the write lock.");
  }

  const now = Date.now();
  await ctx.db.patch(write._id, {
    lastWriteAt:
      args.provider === "convex"
        ? { ...write.lastWriteAt, convex: now }
        : { ...write.lastWriteAt, cloudflare: now },
    updatedAt: now,
  });
}

export const recordManagedProviderWrites = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    providers: array(vProvider),
    lastUsedBuildTokenUuid: optional(string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const provider of args.providers) {
      await recordManagedProviderWrite(ctx, {
        vaultId: args.vaultId,
        runId: args.runId,
        provider,
      });
    }
    if (args.lastUsedBuildTokenUuid !== undefined) {
      if (!args.providers.includes("cloudflare")) {
        throw new Error("A managed Builds token use requires a Cloudflare provider write.");
      }
      const vault = await ctx.db.get(args.vaultId);
      if (vault === null) {
        throw new Error("Vault not found.");
      }
      await recordOrganizationLastUsedBuildToken(ctx, {
        organizationId: vault.organizationId,
        cloudflareAccountId: vault.cloudflareAccountId,
        buildTokenUuid: args.lastUsedBuildTokenUuid,
      });
    }
    return null;
  },
});

export function requireManualProviderActionDeadline(deadlineAt: number): void {
  if (Date.now() >= deadlineAt) {
    throw new Error("Manual provider action time limit expired.");
  }
}

type ManualProviderWriteOwnerArgs = {
  vaultId: Id<"vaults">;
  actionId: string;
};
type ManualProviderWriteActorArgs = ManualProviderWriteOwnerArgs & {
  userId: Id<"users">;
};

async function requireManualProviderWriteOwner(
  ctx: Pick<QueryCtx, "db">,
  args: ManualProviderWriteOwnerArgs,
): Promise<{
  vault: Extract<Doc<"vaults">, { state: "connected" }>;
  write: ManualProviderWrite;
}> {
  const [vault, write] = await Promise.all([
    ctx.db.get(args.vaultId),
    ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
  ]);
  if (!isLiveConnectedVault(vault)) {
    throw new Error("Vault not found.");
  }
  if (
    !write ||
    write.owner.kind !== "manual_provider_write" ||
    write.owner.actionId !== args.actionId
  ) {
    throw new Error("Manual provider action no longer owns the vault write.");
  }
  return { vault, write: { ...write, owner: write.owner } };
}

export async function requireManualProviderWriteCheckpoint(
  ctx: Pick<QueryCtx, "db">,
  args: ManualProviderWriteActorArgs,
): Promise<Extract<Doc<"vaults">, { state: "connected" }>> {
  const { vault, write } = await requireManualProviderWriteOwner(ctx, args);
  if (write.owner.userId !== args.userId) {
    throw new Error("Manual provider action no longer owns the vault write.");
  }
  if (write.state !== "active" || Date.now() >= write.owner.expiresAt) {
    throw new Error("Manual provider action state changed before its checkpoint was recorded.");
  }
  await requireOrganizationNotBillingLimited(ctx.db, vault.organizationId);
  return vault;
}

const vManualProviderWriteResult = union(literal("succeeded"), literal("failed"));

async function readManualProviderWriteClaimContext(
  ctx: Pick<MutationCtx, "db">,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
) {
  const vault = await requireVaultForUser(ctx.db, args);
  if (vault.state !== "connected") {
    throw new Error("Vault not found.");
  }
  const connectedVault = assertConnectedVault(vault);
  const infrastructure = await readVaultInfrastructureState(ctx, connectedVault);
  if (infrastructure.operation.kind !== "none") {
    throw new Error("Another vault infrastructure operation is active.");
  }
  return { vault: connectedVault, providerWrite: infrastructure.providerWrite };
}

async function writeManualProviderWriteClaim(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    actionId: string;
    action: ManualProviderWriteAction;
    providerWrite: ProviderWrite | null;
  },
): Promise<ManualProviderWriteClaim> {
  const now = Date.now();
  const deadlineAt = now + MANUAL_PROVIDER_ACTION_LIMIT_MS;
  const expiresAt = now + MANUAL_PROVIDER_WRITE_EXPIRY_MS;
  const owner = {
    kind: "manual_provider_write" as const,
    userId: args.userId,
    actionId: args.actionId,
    action: args.action,
    expiresAt,
  };
  if (args.providerWrite) {
    await ctx.db.replace(args.providerWrite._id, {
      vaultId: args.vaultId,
      owner,
      state: "active",
      lastWriteAt: args.providerWrite.lastWriteAt,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId: args.vaultId,
      owner,
      state: "active",
      lastWriteAt: {},
      updatedAt: now,
    });
  }
  await ctx.scheduler.runAt(
    expiresAt,
    internal.vault.infrastructureOperation.expireManualProviderWrite,
    {
      vaultId: args.vaultId,
      actionId: args.actionId,
    },
  );
  return { deadlineAt };
}

export const claimManualProviderWrite = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    action: vManualProviderWriteAction,
  },
  returns: vManualProviderWriteClaim,
  handler: async (ctx, args): Promise<ManualProviderWriteClaim> => {
    const context = await readManualProviderWriteClaimContext(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    });
    return await writeManualProviderWriteClaim(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      actionId: args.actionId,
      action: args.action,
      providerWrite: context.providerWrite,
    });
  },
});

export const claimManualCloudflareWorkerCreate = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    accountId: string(),
  },
  returns: vManualWorkerCreateClaim,
  handler: async (ctx, args): Promise<ManualWorkerCreateClaim> => {
    const context = await readManualProviderWriteClaimContext(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    });
    const checkpoint = await readManualWorkerCreateContinuation(ctx, context.vault, {
      vaultId: args.vaultId,
      accountId: args.accountId,
    });
    const continuation: ManualWorkerCreateContinuation =
      checkpoint.state === "managed"
        ? { state: "managed", convexProjectId: checkpoint.convexProjectId }
        : { state: "generic" };
    const claim = await writeManualProviderWriteClaim(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
      actionId: args.actionId,
      action:
        continuation.state === "managed"
          ? "create_cloudflare_worker_with_convex"
          : "create_cloudflare_worker",
      providerWrite: context.providerWrite,
    });
    return { deadlineAt: claim.deadlineAt, continuation };
  },
});

export const recordManualWorkersBuildsTokenUse = internalMutation({
  args: {
    vaultId: id("vaults"),
    actionId: string(),
    buildTokenUuid: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { vault, write } = await requireManualProviderWriteOwner(ctx, args);
    if (write.state !== "active" || Date.now() >= write.owner.expiresAt) {
      throw new Error("Manual provider action state changed before the Builds token was recorded.");
    }
    if (
      write.owner.action !== "connect_cloudflare_worker" &&
      write.owner.action !== "create_cloudflare_worker" &&
      write.owner.action !== "create_cloudflare_worker_with_convex" &&
      write.owner.action !== "configure_workers_builds_for_github"
    ) {
      throw new Error("This manual provider action does not configure Workers Builds.");
    }
    await recordOrganizationLastUsedBuildToken(ctx, {
      organizationId: vault.organizationId,
      cloudflareAccountId: vault.cloudflareAccountId,
      buildTokenUuid: args.buildTokenUuid,
    });
    return null;
  },
});

export const finishManualProviderWriteResult = internalMutation({
  args: {
    vaultId: id("vaults"),
    actionId: string(),
    result: vManualProviderWriteResult,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { write } = await requireManualProviderWriteOwner(ctx, args);
    if (write.state !== "active" || Date.now() >= write.owner.expiresAt) {
      throw new Error("Manual provider action state changed before result was recorded.");
    }

    const now = Date.now();
    const lastWriteAt = { ...write.lastWriteAt };
    for (const provider of readManualProviderWriteProviders(write.owner.action)) {
      lastWriteAt[provider] = now;
    }
    await ctx.db.replace(write._id, {
      vaultId: write.vaultId,
      owner: write.owner,
      state: args.result,
      lastWriteAt,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Records the terminal failure when possible. The bookkeeping error must not
 * replace the provider error that tells the user what failed.
 */
export async function attemptManualProviderWriteFailureRecord(
  ctx: Pick<ActionCtx, "runMutation">,
  args: ManualProviderWriteOwnerArgs,
): Promise<void> {
  try {
    await ctx.runMutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
      vaultId: args.vaultId,
      actionId: args.actionId,
      result: "failed",
    });
  } catch (error) {
    console.warn("vault:manual_provider_write:failure_record_failed", {
      vaultId: args.vaultId,
      actionId: args.actionId,
      message: toErrorMessage(error),
    });
  }
}

export const expireManualProviderWrite = internalMutation({
  args: {
    vaultId: id("vaults"),
    actionId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const write = await ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique();
    if (
      !write ||
      write.owner.kind !== "manual_provider_write" ||
      write.owner.actionId !== args.actionId ||
      write.state !== "active" ||
      Date.now() < write.owner.expiresAt
    ) {
      return null;
    }

    const now = Date.now();
    const lastWriteAt = { ...write.lastWriteAt };
    for (const provider of readManualProviderWriteProviders(write.owner.action)) {
      lastWriteAt[provider] = now;
    }
    await ctx.db.replace(write._id, {
      vaultId: write.vaultId,
      owner: write.owner,
      state: "failed",
      lastWriteAt,
      updatedAt: now,
    });
    return null;
  },
});
