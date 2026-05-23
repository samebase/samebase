import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { AppProvisioningStep } from "../schema";
import { vVaultCloudflareOrigin } from "./model";
import { isLiveConnectedVault } from "./state";

const { boolean, id, null: nullValue, object, optional, string } = v;
const CLOUDFLARE_CONNECTION_STALE_MS = 10 * 60 * 1000;

type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type CloudflareWorkerConnectionEventCtx = Pick<MutationCtx, "runMutation">;
type CloudflareWorkerConnectionReadCtx = Pick<QueryCtx, "db">;

async function getVaultInfrastructureOwnership(
  ctx: CloudflareWorkerConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<VaultInfrastructureOwnership | null> {
  return await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

function isActiveCloudflareWorkerConnectionOwner(
  ownership: VaultInfrastructureOwnership | null,
  args: {
    runId: Id<"appProvisioningRuns">;
  },
): boolean {
  return ownership?.state === "active" && ownership.runId === args.runId;
}

async function appendCloudflareWorkerConnectionEvent(
  ctx: CloudflareWorkerConnectionEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
    level: "info" | "warn" | "error";
    message: string;
    state: "unchanged" | "queued" | "running" | "succeeded" | "failed" | "canceled";
  },
): Promise<void> {
  await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, args);
}

async function cancelSupersededCloudflareWorkerConnectionRun(
  ctx: CloudflareWorkerConnectionEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
  },
): Promise<void> {
  await appendCloudflareWorkerConnectionEvent(ctx, {
    runId: args.runId,
    step: "claim_infra",
    level: "warn",
    message: "Cloudflare Worker connection was superseded by a newer run.",
    state: "canceled",
  });
}

async function requireCloudflareWorkerConnectionRun(
  ctx: CloudflareWorkerConnectionReadCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"appProvisioningRuns">> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Cloudflare Worker connection run not found.");
  }
  if (
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    run.trigger !== "connect_cloudflare_worker"
  ) {
    throw new Error("Cloudflare Worker connection run does not match vault.");
  }
  return run;
}

async function assertNoActiveCloudflareProvisioning(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<void> {
  const ownership = await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault_and_state", (q) => q.eq("vaultId", vaultId).eq("state", "active"))
    .first();
  if (ownership) {
    throw new Error("Cloudflare provisioning is already running.");
  }
}

export const requireAttachableVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.cloudflare.state !== "not_configured") {
      throw new Error("Vault already has a Cloudflare Worker attached.");
    }
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

    return null;
  },
});

export const requireCloudflareWorkerConnectionVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.cloudflare.state !== "not_configured") {
      throw new Error("Vault already has a Cloudflare Worker attached.");
    }

    return null;
  },
});

export const attachWorker = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDevUrl: optional(string()),
    origin: vVaultCloudflareOrigin,
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.cloudflare.state !== "not_configured") {
      throw new Error("Vault already has a Cloudflare Worker attached.");
    }
    await assertNoActiveCloudflareProvisioning(ctx, args.vaultId);

    const now = Date.now();
    await ctx.db.patch(args.vaultId, {
      cloudflare: {
        state: "connected",
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDevUrl: args.workersDevUrl,
        origin: args.origin,
        connectedAt: now,
        lastObservedAt: now,
      },
    });

    return null;
  },
});

export const claimCloudflareWorkerConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    accountId: string(),
    workerName: string(),
    origin: vVaultCloudflareOrigin,
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.cloudflare.state !== "not_configured") {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Vault already has a Cloudflare Worker attached.",
        state: "canceled",
      });
      return { claimed: false };
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      ownership &&
      ownership.state === "active" &&
      ownership.runId !== args.runId &&
      now - ownership.updatedAt < CLOUDFLARE_CONNECTION_STALE_MS
    ) {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Cloudflare Worker connection is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }

    const nextProvisioningVersion =
      ownership && ownership.runId === args.runId
        ? ownership.provisioningVersion
        : (ownership?.provisioningVersion ?? 0) + 1;
    if (ownership) {
      if (ownership.state === "active" && ownership.runId !== args.runId) {
        await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
          runId: ownership.runId,
        });
      }
      await ctx.db.patch(ownership._id, {
        runId: args.runId,
        provisioningVersion: nextProvisioningVersion,
        state: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: args.vaultId,
        runId: args.runId,
        provisioningVersion: nextProvisioningVersion,
        state: "active",
        updatedAt: now,
      });
    }

    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: "Started Cloudflare Worker connection.",
      state: "running",
    });

    return { claimed: true };
  },
});

export const readActiveCloudflareWorkerConnection = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
  },
  returns: object({ active: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    return {
      active:
        vault.cloudflare.state === "not_configured" &&
        isActiveCloudflareWorkerConnectionOwner(ownership, { runId: args.runId }),
    };
  },
});

export const attachWorkerForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    workersDevUrl: optional(string()),
    origin: vVaultCloudflareOrigin,
  },
  returns: object({ attached: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    if (vault.cloudflare.state !== "not_configured") {
      await appendCloudflareWorkerConnectionEvent(ctx, {
        runId: args.runId,
        step: "ensure_cloudflare",
        level: "warn",
        message: "Vault already has a Cloudflare Worker attached.",
        state: "canceled",
      });
      return { attached: false };
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareWorkerConnectionOwner(ownership, { runId: args.runId })) {
      await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
        runId: args.runId,
      });
      return { attached: false };
    }

    const now = Date.now();
    await ctx.db.patch(args.vaultId, {
      cloudflare: {
        state: "connected",
        accountId: args.accountId,
        workerName: args.workerName,
        workerTag: args.workerTag,
        workersDevUrl: args.workersDevUrl,
        origin: args.origin,
        connectedAt: now,
        lastObservedAt: now,
      },
    });
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "ensure_cloudflare",
      level: "info",
      message: `Cloudflare Worker ready: ${args.workerName}.`,
      state: "running",
    });

    return { attached: true };
  },
});

export const readCreatedWorkerRollbackSafety = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
  },
  returns: object({ shouldDelete: boolean() }),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      return { shouldDelete: true };
    }

    const cloudflare = vault.cloudflare;
    return {
      shouldDelete:
        cloudflare.state !== "connected" ||
        cloudflare.accountId !== args.accountId ||
        cloudflare.workerName !== args.workerName ||
        cloudflare.workerTag !== args.workerTag,
    };
  },
});

export const finishCloudflareWorkerConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    await requireCloudflareWorkerConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveCloudflareWorkerConnectionOwner(ownership, { runId: args.runId })) {
      await cancelSupersededCloudflareWorkerConnectionRun(ctx, {
        runId: args.runId,
      });
      return null;
    }
    if (vault.cloudflare.state !== "connected") {
      throw new Error("Cloudflare Worker connection did not attach a Worker.");
    }

    const now = Date.now();
    await ctx.db.patch(ownership._id, {
      state: "succeeded",
      updatedAt: now,
    });
    await appendCloudflareWorkerConnectionEvent(ctx, {
      runId: args.runId,
      step: "finish",
      level: "info",
      message: "Cloudflare Worker is connected.",
      state: "succeeded",
    });

    return null;
  },
});
