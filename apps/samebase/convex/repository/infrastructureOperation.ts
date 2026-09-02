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
  vRepositoryManualProviderWriteAction,
  type RepositoryManualProviderWriteAction,
} from "./provisioningModel";
import { toErrorMessage } from "../jsonUtils";
import { isRuntimeRepository, requireRepositoryForUser } from "../organizationAccess";
import { requireOrganizationNotBillingLimited } from "../organizationBillingLimits";
import { recordOrganizationLastUsedBuildToken } from "../organizations";
import {
  requireRepositoryAuthorityContinuation,
  requireRepositoryOperationStart,
} from "../repositoryMigration/maintenance";
import { requireActiveRepositoryProvisioningRun } from "../repositoryWorkflowAuthority";
import { assertConnectedRepository, isLiveConnectedRepository } from "./state";

type InfrastructureOperationReadCtx = Pick<QueryCtx, "db">;
type ProviderWrite = Doc<"workflow_repositoryProvisioning_writeLocks">;
type ProvisioningRun = Doc<"workflow_repositoryProvisioning_runs">;
export type ManualProviderWrite = Extract<
  ProviderWrite,
  { owner: { kind: "manual_provider_write" } }
>;

const { array, id, literal, number, object, optional, string, union } = v;
const vManualProviderWriteClaim = object({
  deadlineAt: number(),
});
type ManualProviderWriteClaim = Infer<typeof vManualProviderWriteClaim>;

export const MANUAL_PROVIDER_ACTION_LIMIT_MS = 5 * 60 * 1000;
export const MANUAL_PROVIDER_WRITE_EXPIRY_MS = 10 * 60 * 1000;
const vProvider = union(literal("convex"), literal("cloudflare"));
type Provider = Infer<typeof vProvider>;

export type RepositoryInfrastructureOperation =
  | { kind: "none" }
  | {
      kind: "managed_run";
      runId: Id<"workflow_repositoryProvisioning_runs">;
      run: ProvisioningRun | null;
      updatedAt: number;
    }
  | {
      kind: "manual_provider_write";
      write: ManualProviderWrite;
    };

export type RepositoryInfrastructureState = {
  operation: RepositoryInfrastructureOperation;
  providerWrite: ProviderWrite | null;
};

export function readManualProviderWriteProviders(
  action: RepositoryManualProviderWriteAction,
): Provider[] {
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
 * Reads the one repository-level operation that can change provider intent or
 * infrastructure. A provisioning plan is not an operation.
 */
export async function readRepositoryInfrastructureState(
  ctx: InfrastructureOperationReadCtx,
  repository: Doc<"repositories">,
): Promise<RepositoryInfrastructureState> {
  const providerWrite = await ctx.db
    .query("workflow_repositoryProvisioning_writeLocks")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
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
export async function requireUserRepositoryInfrastructureIdle(
  ctx: InfrastructureOperationReadCtx,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<Extract<Doc<"repositories">, { state: "connected" }>> {
  const repository = await requireRepositoryForUser(ctx.db, args);
  if (repository.state !== "connected") {
    throw new Error("Repository not found.");
  }
  const connectedRepository = assertConnectedRepository(repository);
  const infrastructure = await readRepositoryInfrastructureState(ctx, connectedRepository);
  if (infrastructure.operation.kind !== "none") {
    throw new Error("Another repository infrastructure operation is active.");
  }
  return connectedRepository;
}

export async function recordManagedProviderWrite(
  ctx: Pick<MutationCtx, "db">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    provider: "convex" | "cloudflare";
  },
): Promise<void> {
  const write = await ctx.db
    .query("workflow_repositoryProvisioning_writeLocks")
    .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
    .unique();
  if (
    !write ||
    write.owner.kind !== "managed_run" ||
    write.owner.runId !== args.runId ||
    write.state !== "active"
  ) {
    throw new Error("Managed provisioning run no longer holds the write lock.");
  }
  const run = await ctx.db.get(args.runId);
  if (run === null) {
    throw new Error("Managed provisioning run not found.");
  }
  await requireActiveRepositoryProvisioningRun(ctx.db, {
    runId: args.runId,
    userId: run.userId,
    repositoryId: args.repositoryId,
  });
  await requireRepositoryAuthorityContinuation(ctx);

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
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    providers: array(vProvider),
    lastUsedBuildTokenUuid: optional(string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const provider of args.providers) {
      await recordManagedProviderWrite(ctx, {
        repositoryId: args.repositoryId,
        runId: args.runId,
        provider,
      });
    }
    if (args.lastUsedBuildTokenUuid !== undefined) {
      if (!args.providers.includes("cloudflare")) {
        throw new Error("A managed Builds token use requires a Cloudflare provider write.");
      }
      const repository = await ctx.db.get(args.repositoryId);
      if (repository === null || !isRuntimeRepository(repository)) {
        throw new Error("Repository not found.");
      }
      if (repository.cloudflareAccountId === undefined) {
        throw new Error("Cloudflare account is not configured for this repository.");
      }
      await recordOrganizationLastUsedBuildToken(ctx, {
        organizationId: repository.organizationId,
        cloudflareAccountId: repository.cloudflareAccountId,
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
  repositoryId: Id<"repositories">;
  actionId: string;
};
type ManualProviderWriteActorArgs = ManualProviderWriteOwnerArgs & {
  userId: Id<"users">;
};

async function requireManualProviderWriteOwner(
  ctx: Pick<QueryCtx, "db">,
  args: ManualProviderWriteOwnerArgs,
): Promise<{
  repository: Extract<Doc<"repositories">, { state: "connected" }>;
  write: ManualProviderWrite;
}> {
  const [repository, write] = await Promise.all([
    ctx.db.get(args.repositoryId),
    ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique(),
  ]);
  if (!isLiveConnectedRepository(repository)) {
    throw new Error("Repository not found.");
  }
  if (
    !write ||
    write.owner.kind !== "manual_provider_write" ||
    write.owner.actionId !== args.actionId
  ) {
    throw new Error("Manual provider action no longer owns the repository write.");
  }
  return { repository, write: { ...write, owner: write.owner } };
}

export async function requireManualProviderWriteCheckpoint(
  ctx: Pick<QueryCtx, "db">,
  args: ManualProviderWriteActorArgs,
): Promise<Extract<Doc<"repositories">, { state: "connected" }>> {
  const { repository, write } = await requireManualProviderWriteOwner(ctx, args);
  if (write.owner.userId !== args.userId) {
    throw new Error("Manual provider action no longer owns the repository write.");
  }
  if (write.state !== "active" || Date.now() >= write.owner.expiresAt) {
    throw new Error("Manual provider action state changed before its checkpoint was recorded.");
  }
  await requireOrganizationNotBillingLimited(ctx.db, repository.organizationId);
  return repository;
}

export async function requireManualProviderWriteContinuation(
  ctx: Pick<MutationCtx, "db">,
  args: ManualProviderWriteActorArgs,
): Promise<Extract<Doc<"repositories">, { state: "connected" }>> {
  const repository = await requireManualProviderWriteCheckpoint(ctx, args);
  await requireRepositoryAuthorityContinuation(ctx);
  return repository;
}

const vManualProviderWriteResult = union(literal("succeeded"), literal("failed"));

export const claimManualProviderWrite = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    actionId: string(),
    action: vRepositoryManualProviderWriteAction,
  },
  returns: vManualProviderWriteClaim,
  handler: async (ctx, args): Promise<ManualProviderWriteClaim> => {
    const repository = await requireRepositoryForUser(ctx.db, args);
    if (repository.state !== "connected") {
      throw new Error("Repository not found.");
    }
    const connectedRepository = assertConnectedRepository(repository);
    const infrastructure = await readRepositoryInfrastructureState(ctx, connectedRepository);
    if (infrastructure.operation.kind !== "none") {
      throw new Error("Another repository infrastructure operation is active.");
    }
    await requireRepositoryOperationStart(ctx);

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
    if (infrastructure.providerWrite) {
      await ctx.db.replace(infrastructure.providerWrite._id, {
        repositoryId: args.repositoryId,
        owner,
        state: "active",
        lastWriteAt: infrastructure.providerWrite.lastWriteAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
        repositoryId: args.repositoryId,
        owner,
        state: "active",
        lastWriteAt: {},
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAt(
      expiresAt,
      internal.repository.infrastructureOperation.expireManualProviderWrite,
      {
        repositoryId: args.repositoryId,
        actionId: args.actionId,
      },
    );
    return { deadlineAt };
  },
});

export const recordManualWorkersBuildsTokenUse = internalMutation({
  args: {
    repositoryId: id("repositories"),
    actionId: string(),
    buildTokenUuid: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { repository, write } = await requireManualProviderWriteOwner(ctx, args);
    if (write.state !== "active" || Date.now() >= write.owner.expiresAt) {
      throw new Error("Manual provider action state changed before the Builds token was recorded.");
    }
    if (
      write.owner.action !== "connect_cloudflare_worker" &&
      write.owner.action !== "create_cloudflare_worker" &&
      write.owner.action !== "configure_workers_builds_for_github"
    ) {
      throw new Error("This manual provider action does not configure Workers Builds.");
    }
    if (repository.cloudflareAccountId === undefined) {
      throw new Error("Cloudflare account is not configured for this repository.");
    }
    await requireRepositoryAuthorityContinuation(ctx);
    await recordOrganizationLastUsedBuildToken(ctx, {
      organizationId: repository.organizationId,
      cloudflareAccountId: repository.cloudflareAccountId,
      buildTokenUuid: args.buildTokenUuid,
    });
    return null;
  },
});

export const finishManualProviderWriteResult = internalMutation({
  args: {
    repositoryId: id("repositories"),
    actionId: string(),
    result: vManualProviderWriteResult,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { write } = await requireManualProviderWriteOwner(ctx, args);
    if (write.state !== "active" || Date.now() >= write.owner.expiresAt) {
      throw new Error("Manual provider action state changed before result was recorded.");
    }
    await requireRepositoryAuthorityContinuation(ctx);

    const now = Date.now();
    const lastWriteAt = { ...write.lastWriteAt };
    for (const provider of readManualProviderWriteProviders(write.owner.action)) {
      lastWriteAt[provider] = now;
    }
    await ctx.db.replace(write._id, {
      repositoryId: write.repositoryId,
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
    await ctx.runMutation(
      internal.repository.infrastructureOperation.finishManualProviderWriteResult,
      {
        repositoryId: args.repositoryId,
        actionId: args.actionId,
        result: "failed",
      },
    );
  } catch (error) {
    console.warn("repository:manual_provider_write:failure_record_failed", {
      repositoryId: args.repositoryId,
      actionId: args.actionId,
      message: toErrorMessage(error),
    });
  }
}

export const expireManualProviderWrite = internalMutation({
  args: {
    repositoryId: id("repositories"),
    actionId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const write = await ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
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
    await requireRepositoryAuthorityContinuation(ctx);

    const now = Date.now();
    const lastWriteAt = { ...write.lastWriteAt };
    for (const provider of readManualProviderWriteProviders(write.owner.action)) {
      lastWriteAt[provider] = now;
    }
    await ctx.db.replace(write._id, {
      repositoryId: write.repositoryId,
      owner: write.owner,
      state: "failed",
      lastWriteAt,
      updatedAt: now,
    });
    return null;
  },
});
