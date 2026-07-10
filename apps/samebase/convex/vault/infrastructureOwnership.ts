import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type InfrastructureOwnershipClaim =
  | { state: "blocked" }
  | {
      state: "claimed";
      supersededRunId: Id<"appProvisioningRuns"> | null;
    };
const ACTIVE_OWNERSHIP_STALE_MS = 10 * 60 * 1000;

export async function getVaultInfrastructureOwnership(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<Doc<"vaultInfrastructureOwnership"> | null> {
  return await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

export function isActiveVaultInfrastructureOwner(
  ownership: Doc<"vaultInfrastructureOwnership"> | null,
  runId: Id<"appProvisioningRuns">,
): boolean {
  return ownership?.state === "active" && ownership.runId === runId;
}

export async function claimVaultInfrastructureOwnership(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
  },
): Promise<InfrastructureOwnershipClaim> {
  const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
  const now = Date.now();
  if (
    ownership?.state === "active" &&
    ownership.runId !== args.runId &&
    now - ownership.updatedAt < ACTIVE_OWNERSHIP_STALE_MS
  ) {
    return { state: "blocked" };
  }

  const supersededRunId =
    ownership?.state === "active" && ownership.runId !== args.runId ? ownership.runId : null;
  if (ownership) {
    await ctx.db.patch(ownership._id, {
      runId: args.runId,
      state: "active",
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("vaultInfrastructureOwnership", {
      vaultId: args.vaultId,
      runId: args.runId,
      state: "active",
      updatedAt: now,
    });
  }

  return { state: "claimed", supersededRunId };
}
