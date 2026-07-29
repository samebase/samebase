import { v, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  vManualProviderWriteAction,
  vManualProviderWriteTarget,
  type ManualProviderWriteAction,
} from "../appProvisioningModel";
import { readVaultDeletionState } from "./deletion/state";
import { isConnectedVault, isLiveConnectedVault } from "./state";

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
export const MANUAL_PROVIDER_RECOVERY_LEASE_MS = 11 * 60 * 1000;
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
    }
  | {
      kind: "deletion";
      state: "deleting" | "delete_failed";
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

async function readActiveManagedRun(
  ctx: InfrastructureOperationReadCtx,
  vaultId: Id<"vaults">,
): Promise<ProvisioningRun | null> {
  const [queuedRun, runningRun] = await Promise.all([
    ctx.db
      .query("workflow_vaultProvisioning_runs")
      .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "queued"))
      .filter((q) => q.or(q.eq(q.field("trigger"), "create"), q.eq(q.field("trigger"), "retry")))
      .order("desc")
      .first(),
    ctx.db
      .query("workflow_vaultProvisioning_runs")
      .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "running"))
      .filter((q) => q.or(q.eq(q.field("trigger"), "create"), q.eq(q.field("trigger"), "retry")))
      .order("desc")
      .first(),
  ]);
  if (!queuedRun) {
    return runningRun;
  }
  if (!runningRun) {
    return queuedRun;
  }
  return runningRun.updatedAt > queuedRun.updatedAt ||
    (runningRun.updatedAt === queuedRun.updatedAt && runningRun._id < queuedRun._id)
    ? runningRun
    : queuedRun;
}

/**
 * Reads the one vault-level operation that can change provider intent or
 * infrastructure. A provisioning plan is not an operation.
 */
export async function readVaultInfrastructureState(
  ctx: InfrastructureOperationReadCtx,
  vault: Doc<"vaults">,
): Promise<VaultInfrastructureState> {
  const [activeManagedRun, providerWrite] = await Promise.all([
    readActiveManagedRun(ctx, vault._id),
    ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .unique(),
  ]);
  const deletion = readVaultDeletionState(vault);
  if (deletion.state !== "not_deleting") {
    return {
      operation: { kind: "deletion", state: deletion.state },
      providerWrite,
    };
  }
  if (providerWrite) {
    const owner = providerWrite.owner;
    if (
      owner.kind === "manual_provider_write" &&
      (providerWrite.state === "active" ||
        providerWrite.state === "recovery_required" ||
        providerWrite.state === "recovering")
    ) {
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
    const run =
      activeManagedRun?._id === providerWrite.owner.runId
        ? activeManagedRun
        : await ctx.db.get(providerWrite.owner.runId);
    if (run && (run.trigger === "create" || run.trigger === "retry")) {
      return {
        operation: {
          kind: "managed_run",
          runId: providerWrite.owner.runId,
          run,
          updatedAt: run.updatedAt,
        },
        providerWrite,
      };
    }
  }
  if (activeManagedRun) {
    return {
      operation: {
        kind: "managed_run",
        runId: activeManagedRun._id,
        run: activeManagedRun,
        updatedAt: activeManagedRun.updatedAt,
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
  const vault = await ctx.db.get(args.vaultId);
  if (!isConnectedVault(vault) || vault.userId !== args.userId) {
    throw new Error("Vault not found.");
  }
  const infrastructure = await readVaultInfrastructureState(ctx, vault);
  if (infrastructure.operation.kind !== "none") {
    throw new Error("Another vault infrastructure operation is active.");
  }
  return vault;
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

function readManualProviderActionDeadline(owner: ManualProviderWrite["owner"]): number {
  return owner.expiresAt - (MANUAL_PROVIDER_WRITE_EXPIRY_MS - MANUAL_PROVIDER_ACTION_LIMIT_MS);
}

export function requireManualProviderActionDeadline(deadlineAt: number): void {
  if (Date.now() >= deadlineAt) {
    throw new Error("Manual provider action time limit expired.");
  }
}

async function requireManualProviderWriteOwner(
  ctx: Pick<QueryCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    actionId: string;
    action: ManualProviderWriteAction;
  },
): Promise<ManualProviderWrite> {
  const [vault, write] = await Promise.all([
    ctx.db.get(args.vaultId),
    ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .unique(),
  ]);
  if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
    throw new Error("Vault not found.");
  }
  if (
    !write ||
    write.owner.kind !== "manual_provider_write" ||
    write.owner.actionId !== args.actionId ||
    write.owner.target.action !== args.action
  ) {
    throw new Error("Manual provider action no longer owns the vault write.");
  }
  return { ...write, owner: write.owner };
}

export type ManualProviderWriteCheckpoint = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  actionId: string;
  action: ManualProviderWriteAction;
} & (
  | { expectedState: "active" }
  | {
      expectedState: "recovering";
      recoveryAttemptId: string;
    }
);

export async function requireManualProviderWriteCheckpoint(
  ctx: Pick<QueryCtx, "db">,
  args: ManualProviderWriteCheckpoint,
): Promise<ManualProviderWrite> {
  const write = await requireManualProviderWriteOwner(ctx, args);
  if (args.expectedState === "active") {
    if (write.state !== "active") {
      throw new Error("Manual provider action state changed before its checkpoint was recorded.");
    }
    requireManualProviderActionDeadline(readManualProviderActionDeadline(write.owner));
    return write;
  }

  if (write.state !== "recovering" || write.recoveryAttemptId !== args.recoveryAttemptId) {
    throw new Error("Manual provider recovery attempt no longer owns the vault write.");
  }
  requireManualProviderActionDeadline(write.recoveryDeadlineAt);
  return write;
}

type FinishManualProviderWriteArgs = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  actionId: string;
  action: ManualProviderWriteAction;
  completion:
    | {
        expectedState: "active";
        result: "succeeded";
        providerResult: "complete";
      }
    | {
        expectedState: "active";
        result: "failed";
        providerResult: "complete" | "not_started";
      }
    | {
        expectedState: "recovering";
        recoveryAttemptId: string;
        result: "succeeded";
        providerResult: "complete";
      };
};

async function finishManualProviderWrite(
  ctx: Pick<MutationCtx, "db">,
  args: FinishManualProviderWriteArgs,
): Promise<void> {
  const write = await requireManualProviderWriteOwner(ctx, args);
  const completion = args.completion;
  if (completion.expectedState === "active") {
    if (write.state !== "active") {
      throw new Error("Manual provider action state changed before result was recorded.");
    }
    requireManualProviderActionDeadline(readManualProviderActionDeadline(write.owner));
  } else if (
    write.state !== "recovering" ||
    write.recoveryAttemptId !== completion.recoveryAttemptId
  ) {
    throw new Error("Manual provider recovery attempt changed before result was recorded.");
  } else {
    requireManualProviderActionDeadline(write.recoveryDeadlineAt);
  }

  const now = Date.now();
  const lastWriteAt = { ...write.lastWriteAt };
  if (completion.providerResult === "complete") {
    for (const provider of readManualProviderWriteProviders(args.action)) {
      lastWriteAt[provider] = now;
    }
  }
  await ctx.db.replace(write._id, {
    vaultId: write.vaultId,
    owner: write.owner,
    state: completion.result,
    lastWriteAt,
    updatedAt: now,
  });
}

const vManualProviderWriteCompletion = union(
  object({
    expectedState: literal("active"),
    result: literal("succeeded"),
    providerResult: literal("complete"),
  }),
  object({
    expectedState: literal("active"),
    result: literal("failed"),
    providerResult: union(literal("complete"), literal("not_started")),
  }),
  object({
    expectedState: literal("recovering"),
    recoveryAttemptId: string(),
    result: literal("succeeded"),
    providerResult: literal("complete"),
  }),
);

const vManualProviderRecoveryClaim = object({
  actionId: string(),
  recoveryAttemptId: string(),
  target: vManualProviderWriteTarget,
});
type ManualProviderRecoveryClaim = Infer<typeof vManualProviderRecoveryClaim>;

async function startManualProviderRecoveryAttempt(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  write: Extract<ManualProviderWrite, { state: "recovery_required" }>,
): Promise<ManualProviderRecoveryClaim> {
  const now = Date.now();
  const recoveryAttemptId = `${write.owner.actionId}:${now}:${Math.random().toString(36).slice(2)}`;
  const recoveryDeadlineAt = now + MANUAL_PROVIDER_ACTION_LIMIT_MS;
  const recoveryLeaseExpiresAt = now + MANUAL_PROVIDER_RECOVERY_LEASE_MS;
  await ctx.db.replace(write._id, {
    vaultId: write.vaultId,
    owner: write.owner,
    state: "recovering",
    recoveryAttemptId,
    recoveryDeadlineAt,
    recoveryLeaseExpiresAt,
    lastWriteAt: write.lastWriteAt,
    updatedAt: now,
  });
  await ctx.scheduler.runAt(
    recoveryLeaseExpiresAt,
    internal.vault.infrastructureOperation.watchManualProviderRecoveryAttempt,
    {
      vaultId: write.vaultId,
      actionId: write.owner.actionId,
      recoveryAttemptId,
    },
  );
  return {
    actionId: write.owner.actionId,
    recoveryAttemptId,
    target: write.owner.target,
  };
}

async function scheduleManualProviderRecoveryAttempt(
  ctx: Pick<MutationCtx, "scheduler">,
  args: {
    vaultId: Id<"vaults">;
    actionId: string;
    recoveryAttemptId: string;
    target: ManualProviderWrite["owner"]["target"];
  },
): Promise<void> {
  switch (args.target.action) {
    case "create_convex_project":
      await ctx.scheduler.runAfter(0, internal.vault.convex.recoverManualConvexProviderWrite, {
        vaultId: args.vaultId,
        actionId: args.actionId,
        recoveryAttemptId: args.recoveryAttemptId,
      });
      return;
    case "connect_cloudflare_worker":
    case "create_cloudflare_worker":
    case "configure_workers_builds_for_github":
    case "rotate_convex_deploy_keys_for_workers_builds":
      await ctx.scheduler.runAfter(
        0,
        internal.vault.cloudflare.recoverManualCloudflareProviderWrite,
        {
          vaultId: args.vaultId,
          actionId: args.actionId,
          recoveryAttemptId: args.recoveryAttemptId,
        },
      );
      return;
    default:
      args.target satisfies never;
  }
}

export const claimManualProviderWrite = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    target: vManualProviderWriteTarget,
  },
  returns: vManualProviderWriteClaim,
  handler: async (ctx, args): Promise<ManualProviderWriteClaim> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const infrastructure = await readVaultInfrastructureState(ctx, vault);
    if (infrastructure.operation.kind !== "none") {
      throw new Error("Another vault infrastructure operation is active.");
    }

    const now = Date.now();
    const deadlineAt = now + MANUAL_PROVIDER_ACTION_LIMIT_MS;
    const expiresAt = now + MANUAL_PROVIDER_WRITE_EXPIRY_MS;
    const owner = {
      kind: "manual_provider_write" as const,
      actionId: args.actionId,
      target: args.target,
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
      internal.vault.infrastructureOperation.enterManualProviderWriteRecovery,
      {
        vaultId: args.vaultId,
        actionId: args.actionId,
      },
    );
    return { deadlineAt };
  },
});

export const claimManualProviderRecovery = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: vManualProviderRecoveryClaim,
  handler: async (ctx, args) => {
    const [vault, write] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .unique(),
    ]);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (
      !write ||
      write.owner.kind !== "manual_provider_write" ||
      write.state !== "recovery_required"
    ) {
      throw new Error("Manual provider recovery is not available.");
    }
    return await startManualProviderRecoveryAttempt(ctx, {
      ...write,
      owner: write.owner,
    });
  },
});

export const finishManualProviderWriteResult = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    action: vManualProviderWriteAction,
    completion: vManualProviderWriteCompletion,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await finishManualProviderWrite(ctx, args);
    return null;
  },
});

export const enterManualProviderWriteRecovery = internalMutation({
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

    const recovery = await startManualProviderRecoveryAttempt(ctx, {
      ...write,
      state: "recovery_required",
      owner: write.owner,
    });
    await scheduleManualProviderRecoveryAttempt(ctx, {
      vaultId: args.vaultId,
      ...recovery,
    });
    return null;
  },
});

export const checkpointManualProviderRecoveryAttempt = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    actionId: string(),
    action: vManualProviderWriteAction,
    recoveryAttemptId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManualProviderWriteCheckpoint(ctx, {
      ...args,
      expectedState: "recovering",
    });
    return null;
  },
});

export const returnManualProviderRecoveryAttemptToRequired = internalMutation({
  args: {
    vaultId: id("vaults"),
    actionId: string(),
    recoveryAttemptId: string(),
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
      write.state !== "recovering" ||
      write.recoveryAttemptId !== args.recoveryAttemptId
    ) {
      return null;
    }

    await ctx.db.replace(write._id, {
      vaultId: write.vaultId,
      owner: write.owner,
      state: "recovery_required",
      lastWriteAt: write.lastWriteAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const watchManualProviderRecoveryAttempt = internalMutation({
  args: {
    vaultId: id("vaults"),
    actionId: string(),
    recoveryAttemptId: string(),
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
      write.state !== "recovering" ||
      write.recoveryAttemptId !== args.recoveryAttemptId ||
      Date.now() < write.recoveryLeaseExpiresAt
    ) {
      return null;
    }

    await ctx.db.replace(write._id, {
      vaultId: write.vaultId,
      owner: write.owner,
      state: "recovery_required",
      lastWriteAt: write.lastWriteAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const readManualProviderRecoveryAttempt = internalQuery({
  args: {
    vaultId: id("vaults"),
    actionId: string(),
    recoveryAttemptId: string(),
  },
  returns: union(
    v.null(),
    object({
      userId: id("users"),
      target: vManualProviderWriteTarget,
      deadlineAt: number(),
    }),
  ),
  handler: async (ctx, args) => {
    const [vault, write] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .unique(),
    ]);
    if (
      !isLiveConnectedVault(vault) ||
      !write ||
      write.owner.kind !== "manual_provider_write" ||
      write.owner.actionId !== args.actionId ||
      write.state !== "recovering" ||
      write.recoveryAttemptId !== args.recoveryAttemptId
    ) {
      return null;
    }
    return {
      userId: vault.userId,
      target: write.owner.target,
      deadlineAt: write.recoveryDeadlineAt,
    };
  },
});
