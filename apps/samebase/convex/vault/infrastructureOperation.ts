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
import { assertConnectedVault, isLiveConnectedVault } from "./state";

type InfrastructureOperationReadCtx = Pick<QueryCtx, "db">;
type ProviderWrite = Doc<"workflow_vaultProvisioning_writeLocks">;
type ProvisioningRun = Doc<"workflow_vaultProvisioning_runs">;
export type ManualProviderWrite = Extract<
  ProviderWrite,
  { owner: { kind: "manual_provider_write" } }
>;

const { array, id, literal, number, object, string, union } = v;
const vManualProviderWriteClaim = object({
  deadlineAt: number(),
});
type ManualProviderWriteClaim = Infer<typeof vManualProviderWriteClaim>;

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
    case "create_cloudflare_worker":
    case "configure_workers_builds_for_github":
      return ["cloudflare"];
    case "rotate_convex_deploy_keys_for_workers_builds":
      return ["convex", "cloudflare"];
    default:
      action satisfies never;
      throw new Error("Unknown manual provider write action.");
  }
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

async function requireManualProviderWriteOwner(
  ctx: Pick<QueryCtx, "db">,
  args: ManualProviderWriteOwnerArgs,
): Promise<ManualProviderWrite> {
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
  return { ...write, owner: write.owner };
}

export async function requireManualProviderWriteCheckpoint(
  ctx: Pick<QueryCtx, "db">,
  args: ManualProviderWriteOwnerArgs,
): Promise<void> {
  const write = await requireManualProviderWriteOwner(ctx, args);
  if (write.state !== "active" || Date.now() >= write.owner.expiresAt) {
    throw new Error("Manual provider action state changed before its checkpoint was recorded.");
  }
}

const vManualProviderWriteResult = union(literal("succeeded"), literal("failed"));

export const claimManualProviderWrite = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    action: vManualProviderWriteAction,
  },
  returns: vManualProviderWriteClaim,
  handler: async (ctx, args): Promise<ManualProviderWriteClaim> => {
    const [vault, user] = await Promise.all([
      requireVaultForUser(ctx.db, args),
      ctx.db.get(args.userId),
    ]);
    if (vault.state !== "connected") {
      throw new Error("Vault not found.");
    }
    const connectedVault = assertConnectedVault(vault);
    if (!user || user.accountDeletion !== undefined) {
      throw new Error("Account deletion is in progress.");
    }
    const infrastructure = await readVaultInfrastructureState(ctx, connectedVault);
    if (infrastructure.operation.kind !== "none") {
      throw new Error("Another vault infrastructure operation is active.");
    }

    const now = Date.now();
    const deadlineAt = now + MANUAL_PROVIDER_ACTION_LIMIT_MS;
    const expiresAt = now + MANUAL_PROVIDER_WRITE_EXPIRY_MS;
    const owner = {
      kind: "manual_provider_write" as const,
      actionId: args.actionId,
      action: args.action,
      expiresAt,
    };
    if (infrastructure.providerWrite) {
      await ctx.db.replace(infrastructure.providerWrite._id, {
        vaultId: args.vaultId,
        owner,
        state: "active",
        lastWriteAt: infrastructure.providerWrite.lastWriteAt,
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
    const write = await requireManualProviderWriteOwner(ctx, args);
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
      ...args,
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
