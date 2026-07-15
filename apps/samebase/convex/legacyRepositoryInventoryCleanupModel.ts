import { v } from "convex/values";

const { id, literal, number, object, string, union } = v;

const vLegacyRepositoryRefreshDemand = union(
  object({ scope: literal("repository"), source: literal("dashboard") }),
  object({ scope: literal("repository"), source: literal("manual") }),
  object({
    scope: literal("repository"),
    source: literal("source_setup"),
    runId: id("appProvisioningRuns"),
  }),
  object({ scope: literal("branch"), branch: string(), source: literal("file_view") }),
  object({ scope: literal("branch"), branch: string(), source: literal("manual") }),
  object({ scope: literal("branch"), branch: string(), source: literal("commit") }),
  object({ scope: literal("branch"), branch: string(), source: literal("pull") }),
);

const vLegacyRepositoryRefreshLifecycle = union(
  object({
    state: literal("queued"),
    notBefore: number(),
    queuedAt: number(),
  }),
  object({
    state: literal("scheduled"),
    notBefore: number(),
    queuedAt: number(),
    scheduledAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("running"),
    startedAt: number(),
    leaseExpiresAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("succeeded"),
    startedAt: number(),
    completedAt: number(),
    result: union(
      object({ kind: literal("no_work_needed") }),
      object({ kind: literal("refreshed") }),
    ),
  }),
  object({
    state: literal("failed"),
    startedAt: number(),
    failedAt: number(),
    failure: union(
      object({
        kind: literal("rate_limited"),
        retryAfter: number(),
        message: string(),
      }),
      object({
        kind: literal("provider_error"),
        cooldownUntil: number(),
        message: string(),
      }),
    ),
  }),
  object({
    state: literal("canceled"),
    canceledAt: number(),
    reason: union(
      literal("superseded"),
      literal("worker_canceled"),
      literal("vault_deleting"),
      literal("vault_deleted"),
    ),
  }),
);

/**
Temporary deploy-one validator for rows written by the retired refresh queue. The cleanup migration
deletes every row before the follow-up schema deploy removes the table.
*/
export const vLegacyRepositoryRefreshRequest = object({
  userId: id("users"),
  vaultId: id("vaults"),
  dedupeKey: string(),
  demand: vLegacyRepositoryRefreshDemand,
  lifecycle: vLegacyRepositoryRefreshLifecycle,
  createdAt: number(),
  updatedAt: number(),
});
