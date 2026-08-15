import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";

import { normalizeVaultRootDirectory } from "../../shared/vaultRootDirectory";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import type { ResolvedCloudflareConnection } from "../cloudflareOAuth";
import {
  readCloudflareWorkerIdentityByTag,
  readCloudflareWorkerRepositoryDiscoveryForIdentity,
} from "../cloudflareResources";
import { requireOrganizationMembershipRecord } from "../organizationAccess";
import { readVaultInfrastructureState } from "./infrastructureOperation";
import { isLiveConnectedVault } from "./state";

const { array, boolean, id, literal, null: nullValue, number, object, string, union } = v;
const BACKFILL_BATCH_SIZE = 20;
const AUDIT_BATCH_SIZE = 100;

const vBackfillSource = union(literal("managed_plan"), literal("cloudflare"));
const vUnresolvedReason = union(
  literal("attachment_changed"),
  literal("infrastructure_busy"),
  literal("managed_plan_changed"),
  literal("provider_connection_required"),
  literal("provider_request_failed"),
  literal("repository_root_unavailable"),
  literal("vault_unavailable"),
  literal("worker_identity_changed"),
  literal("worker_missing"),
);
const vBackfillResult = union(
  object({
    state: literal("current"),
    workerId: id("vaultCloudflareWorkers"),
    rootDirectory: string(),
  }),
  object({
    state: literal("ready"),
    workerId: id("vaultCloudflareWorkers"),
    rootDirectory: string(),
    source: vBackfillSource,
  }),
  object({
    state: literal("updated"),
    workerId: id("vaultCloudflareWorkers"),
    rootDirectory: string(),
    source: vBackfillSource,
  }),
  object({
    state: literal("unresolved"),
    workerId: id("vaultCloudflareWorkers"),
    reason: vUnresolvedReason,
  }),
);
type BackfillResult = Infer<typeof vBackfillResult>;

const vBackfillTarget = union(
  object({
    state: literal("current"),
    workerId: id("vaultCloudflareWorkers"),
    rootDirectory: string(),
  }),
  object({
    state: literal("unresolved"),
    workerId: id("vaultCloudflareWorkers"),
    reason: literal("vault_unavailable"),
  }),
  object({
    state: literal("candidate"),
    source: vBackfillSource,
    workerId: id("vaultCloudflareWorkers"),
    vaultId: id("vaults"),
    organizationId: id("organizations"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    ghRepoId: string(),
    defaultBranch: string(),
    candidateRootDirectory: union(string(), nullValue()),
  }),
);
type BackfillTarget = Infer<typeof vBackfillTarget>;

const vBackfillTargetPage = object({
  isDone: boolean(),
  continueCursor: string(),
  targets: array(vBackfillTarget),
});
type BackfillTargetPage = Infer<typeof vBackfillTargetPage>;

const vBackfillBatch = object({
  isDone: boolean(),
  continueCursor: string(),
  results: array(vBackfillResult),
});
type BackfillBatch = Infer<typeof vBackfillBatch>;

const vAuditBatch = object({
  isDone: boolean(),
  continueCursor: string(),
  scannedCount: number(),
  missingWorkerIds: array(id("vaultCloudflareWorkers")),
});
type AuditBatch = Infer<typeof vAuditBatch>;

function readNormalizedRootDirectory(value: string): string | null {
  try {
    return normalizeVaultRootDirectory(value);
  } catch {
    return null;
  }
}

export const readBatch = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    paginationOpts: paginationOptsValidator,
  },
  returns: vBackfillTargetPage,
  handler: async (ctx, args): Promise<BackfillTargetPage> => {
    await requireOrganizationMembershipRecord(ctx.db, {
      organizationId: args.organizationId,
      userId: args.userId,
    });
    const workers = await ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .paginate(args.paginationOpts);
    const targets: BackfillTarget[] = [];
    for (const worker of workers.page) {
      if (worker.rootDirectory) {
        targets.push({
          state: "current",
          workerId: worker._id,
          rootDirectory: worker.rootDirectory,
        });
        continue;
      }

      const [vault, plan] = await Promise.all([
        ctx.db.get(worker.vaultId),
        ctx.db
          .query("workflow_vaultProvisioning_plans")
          .withIndex("by_vault", (q) => q.eq("vaultId", worker.vaultId))
          .unique(),
      ]);
      if (
        !isLiveConnectedVault(vault) ||
        vault.organizationId !== worker.organizationId ||
        vault.cloudflareAccountId !== worker.accountId
      ) {
        targets.push({
          state: "unresolved",
          workerId: worker._id,
          reason: "vault_unavailable",
        });
        continue;
      }

      const managedRootDirectory =
        worker.origin === "provisioned" &&
        plan?.cloudflare.state === "created" &&
        plan.cloudflare.workerName === worker.workerName &&
        plan.cloudflare.workerTag === worker.workerTag
          ? readNormalizedRootDirectory(plan.cloudflare.rootDirectory)
          : null;
      targets.push({
        state: "candidate",
        source: managedRootDirectory ? "managed_plan" : "cloudflare",
        workerId: worker._id,
        vaultId: worker.vaultId,
        organizationId: worker.organizationId,
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        ghRepoId: vault.ghRepoId,
        defaultBranch: vault.defaultBranch,
        candidateRootDirectory: managedRootDirectory,
      });
    }
    return {
      isDone: workers.isDone,
      continueCursor: workers.continueCursor,
      targets,
    };
  },
});

export const auditBatch = internalQuery({
  args: { cursor: union(string(), nullValue()) },
  returns: vAuditBatch,
  handler: async (ctx, args): Promise<AuditBatch> => {
    const workers = await ctx.db.query("vaultCloudflareWorkers").paginate({
      cursor: args.cursor,
      numItems: AUDIT_BATCH_SIZE,
      maximumRowsRead: AUDIT_BATCH_SIZE,
    });
    return {
      isDone: workers.isDone,
      continueCursor: workers.continueCursor,
      scannedCount: workers.page.length,
      missingWorkerIds: workers.page.flatMap((worker) =>
        worker.rootDirectory ? [] : [worker._id],
      ),
    };
  },
});

export const writeRootDirectory = internalMutation({
  args: {
    userId: id("users"),
    workerId: id("vaultCloudflareWorkers"),
    vaultId: id("vaults"),
    organizationId: id("organizations"),
    accountId: string(),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
    source: vBackfillSource,
  },
  returns: vBackfillResult,
  handler: async (ctx, args): Promise<BackfillResult> => {
    await requireOrganizationMembershipRecord(ctx.db, {
      organizationId: args.organizationId,
      userId: args.userId,
    });
    const [worker, vault] = await Promise.all([
      ctx.db.get(args.workerId),
      ctx.db.get(args.vaultId),
    ]);
    if (
      !worker ||
      worker.vaultId !== args.vaultId ||
      worker.organizationId !== args.organizationId ||
      worker.accountId !== args.accountId ||
      worker.workerName !== args.workerName ||
      worker.workerTag !== args.workerTag
    ) {
      return { state: "unresolved", workerId: args.workerId, reason: "attachment_changed" };
    }
    if (worker.rootDirectory) {
      return {
        state: "current",
        workerId: worker._id,
        rootDirectory: worker.rootDirectory,
      };
    }
    if (
      !isLiveConnectedVault(vault) ||
      vault.organizationId !== worker.organizationId ||
      vault.cloudflareAccountId !== worker.accountId
    ) {
      return { state: "unresolved", workerId: worker._id, reason: "vault_unavailable" };
    }
    const infrastructure = await readVaultInfrastructureState(ctx, vault);
    if (infrastructure.operation.kind !== "none") {
      return { state: "unresolved", workerId: worker._id, reason: "infrastructure_busy" };
    }

    const rootDirectory = normalizeVaultRootDirectory(args.rootDirectory);
    if (args.source === "managed_plan") {
      const plan = await ctx.db
        .query("workflow_vaultProvisioning_plans")
        .withIndex("by_vault", (q) => q.eq("vaultId", worker.vaultId))
        .unique();
      if (
        plan?.cloudflare.state !== "created" ||
        plan.cloudflare.workerName !== worker.workerName ||
        plan.cloudflare.workerTag !== worker.workerTag ||
        readNormalizedRootDirectory(plan.cloudflare.rootDirectory) !== rootDirectory
      ) {
        return { state: "unresolved", workerId: worker._id, reason: "managed_plan_changed" };
      }
    }

    await ctx.db.patch(worker._id, { rootDirectory });
    return {
      state: "updated",
      workerId: worker._id,
      rootDirectory,
      source: args.source,
    };
  },
});

async function resolveTarget(
  ctx: Pick<ActionCtx, "runAction">,
  args: {
    userId: Id<"users">;
    target: Extract<BackfillTarget, { state: "candidate" }>;
  },
): Promise<BackfillResult> {
  if (args.target.candidateRootDirectory) {
    return {
      state: "ready",
      workerId: args.target.workerId,
      rootDirectory: args.target.candidateRootDirectory,
      source: "managed_plan",
    };
  }

  let connection: ResolvedCloudflareConnection | null;
  try {
    connection = await ctx.runAction(
      internal.cloudflareOAuth.resolveConnectionForWorkerRootDirectoryBackfill,
      {
        userId: args.userId,
        organizationId: args.target.organizationId,
        accountId: args.target.accountId,
      },
    );
  } catch {
    return {
      state: "unresolved",
      workerId: args.target.workerId,
      reason: "provider_request_failed",
    };
  }
  const token = connection?.auth.credential.trim();
  if (!connection || !token || connection.account.accountId !== args.target.accountId) {
    return {
      state: "unresolved",
      workerId: args.target.workerId,
      reason: "provider_connection_required",
    };
  }
  const transport = resolveCloudflareApiTransport(connection.auth.method);

  try {
    const identity = await readCloudflareWorkerIdentityByTag({
      token,
      transport,
      accountId: args.target.accountId,
      workerTag: args.target.workerTag,
    });
    if (!identity) {
      return { state: "unresolved", workerId: args.target.workerId, reason: "worker_missing" };
    }
    if (identity.workerTag !== args.target.workerTag) {
      return {
        state: "unresolved",
        workerId: args.target.workerId,
        reason: "worker_identity_changed",
      };
    }
    const repository = await readCloudflareWorkerRepositoryDiscoveryForIdentity({
      token,
      transport,
      accountId: args.target.accountId,
      workerName: identity.workerName,
      workerTag: identity.workerTag,
      expectedRepoId: args.target.ghRepoId,
      defaultBranch: args.target.defaultBranch,
    });
    if (repository.state !== "ready") {
      return {
        state: "unresolved",
        workerId: args.target.workerId,
        reason: "repository_root_unavailable",
      };
    }
    return {
      state: "ready",
      workerId: args.target.workerId,
      rootDirectory: repository.rootDirectory,
      source: "cloudflare",
    };
  } catch {
    return {
      state: "unresolved",
      workerId: args.target.workerId,
      reason: "provider_request_failed",
    };
  }
}

async function runBatch(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    cursor: string | null;
    write: boolean;
  },
): Promise<BackfillBatch> {
  const page: BackfillTargetPage = await ctx.runQuery(
    internal.vault.cloudflareWorkerRootDirectoryBackfill.readBatch,
    {
      organizationId: args.organizationId,
      userId: args.userId,
      paginationOpts: {
        cursor: args.cursor,
        numItems: BACKFILL_BATCH_SIZE,
        maximumRowsRead: BACKFILL_BATCH_SIZE,
      },
    },
  );
  const results: BackfillResult[] = [];
  for (const target of page.targets) {
    if (target.state !== "candidate") {
      results.push(target);
      continue;
    }
    const resolved = await resolveTarget(ctx, { userId: args.userId, target });
    if (!args.write || resolved.state !== "ready") {
      results.push(resolved);
      continue;
    }
    results.push(
      await ctx.runMutation(
        internal.vault.cloudflareWorkerRootDirectoryBackfill.writeRootDirectory,
        {
          userId: args.userId,
          workerId: target.workerId,
          vaultId: target.vaultId,
          organizationId: target.organizationId,
          accountId: target.accountId,
          workerName: target.workerName,
          workerTag: target.workerTag,
          rootDirectory: resolved.rootDirectory,
          source: resolved.source,
        },
      ),
    );
  }
  return {
    isDone: page.isDone,
    continueCursor: page.continueCursor,
    results,
  };
}

const batchArgs = {
  organizationId: id("organizations"),
  userId: id("users"),
  cursor: union(string(), nullValue()),
};

export const verifyBatch = internalAction({
  args: batchArgs,
  returns: vBackfillBatch,
  handler: async (ctx, args): Promise<BackfillBatch> =>
    await runBatch(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      cursor: args.cursor,
      write: false,
    }),
});

export const backfillBatch = internalAction({
  args: batchArgs,
  returns: vBackfillBatch,
  handler: async (ctx, args): Promise<BackfillBatch> =>
    await runBatch(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      cursor: args.cursor,
      write: true,
    }),
});
