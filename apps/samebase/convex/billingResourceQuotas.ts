import { ConvexError, Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { query } from "./functions";
import {
  readBillingAccountState,
  requireBillingAccountForOrganization,
} from "./organizationBilling";
import { requireActiveVaultProvisioningAuthority } from "./vaultWorkflowAuthority";
import { requireManualProviderWriteCheckpoint } from "./vault/infrastructureOperation";

const { id, literal, null: nullValue, number, object, union } = v;

const FREE_RESOURCE_ATTACHMENT_LIMIT = 5;
const PRO_RESOURCE_ATTACHMENT_LIMIT = 40;
const RESOURCE_USAGE_READ_LIMIT = PRO_RESOURCE_ATTACHMENT_LIMIT + 1;

const vBillingResourceKind = union(literal("cloudflare_worker"), literal("convex_project"));
type BillingResourceKind = Infer<typeof vBillingResourceKind>;
type BillingResourceReadCtx = Pick<QueryCtx, "db">;
export type BillingResourceAuthority =
  | {
      kind: "user";
      organizationId: Id<"organizations">;
      userId: Id<"users">;
    }
  | {
      kind: "vault_provisioning";
      runId: Id<"workflow_vaultProvisioning_runs">;
      userId: Id<"users">;
      vaultId: Id<"vaults">;
    }
  | {
      kind: "manual_provider_write";
      actionId: string;
      userId: Id<"users">;
      vaultId: Id<"vaults">;
    };

const vResourceAttachmentCount = union(
  object({
    state: literal("exact"),
    count: number(),
  }),
  object({
    state: literal("at_least"),
    count: number(),
  }),
);

const vResourceAttachmentUsage = object({
  used: vResourceAttachmentCount,
  limit: number(),
});

const vBillingResourceUsage = object({
  cloudflareWorkers: vResourceAttachmentUsage,
  convexProjects: vResourceAttachmentUsage,
});
export type BillingResourceUsage = Infer<typeof vBillingResourceUsage>;

function readResourceAttachmentLimit(account: Doc<"organizationBillingAccounts">): number {
  const state = readBillingAccountState(account);
  return state.plan === "pro" && (state.status === "active" || state.status === "past_due")
    ? PRO_RESOURCE_ATTACHMENT_LIMIT
    : FREE_RESOURCE_ATTACHMENT_LIMIT;
}

async function readResourceAttachmentCount(
  ctx: BillingResourceReadCtx,
  args: {
    kind: BillingResourceKind;
    organizationId: Id<"organizations">;
    maximumRows: number;
  },
): Promise<number> {
  let count: number;
  switch (args.kind) {
    case "cloudflare_worker":
      count = (
        await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
          .take(args.maximumRows)
      ).length;
      break;
    case "convex_project":
      count = (
        await ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
          .take(args.maximumRows)
      ).length;
      break;
    default:
      args.kind satisfies never;
      return 0;
  }
  return count;
}

function throwBillingResourceLimit(kind: BillingResourceKind, limit: number): never {
  switch (kind) {
    case "cloudflare_worker":
      throw new ConvexError(`Cloudflare Worker attachment limit reached (${limit}).`);
    case "convex_project":
      throw new ConvexError(`Convex project attachment limit reached (${limit}).`);
    default:
      kind satisfies never;
      throw new Error("Unsupported billing resource kind.");
  }
}

export async function requireBillingResourceCapacity(
  ctx: BillingResourceReadCtx,
  args: {
    kind: BillingResourceKind;
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  },
): Promise<void> {
  const billing = await requireBillingAccountForOrganization(ctx.db, args);
  await requireBillingResourceCapacityForAccount(ctx, args.kind, billing.account);
}

async function requireBillingResourceCapacityForAccount(
  ctx: BillingResourceReadCtx,
  kind: BillingResourceKind,
  account: Doc<"organizationBillingAccounts">,
): Promise<void> {
  const limit = readResourceAttachmentLimit(account);
  const used = await readResourceAttachmentCount(ctx, {
    kind,
    organizationId: account.organizationId,
    maximumRows: limit + 1,
  });
  if (used >= limit) {
    throwBillingResourceLimit(kind, limit);
  }
}

export const requireBillingResourceCapacityForProviderCreate = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
    kind: vBillingResourceKind,
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireBillingResourceCapacity(ctx, args);
    return null;
  },
});

export async function requireBillingResourceCapacityForVaultProvisioningRun(
  ctx: BillingResourceReadCtx,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    kind: BillingResourceKind;
  },
): Promise<void> {
  await requireBillingResourceCapacityForAuthority(ctx, {
    authority: {
      kind: "vault_provisioning",
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    },
    kind: args.kind,
  });
}

export async function requireBillingResourceCapacityForAuthority(
  ctx: BillingResourceReadCtx,
  args: {
    authority: BillingResourceAuthority;
    kind: BillingResourceKind;
  },
): Promise<void> {
  switch (args.authority.kind) {
    case "user":
      await requireBillingResourceCapacity(ctx, {
        kind: args.kind,
        organizationId: args.authority.organizationId,
        userId: args.authority.userId,
      });
      return;
    case "vault_provisioning": {
      const authority = await requireActiveVaultProvisioningAuthority(ctx.db, args.authority);
      const account = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) =>
          query.eq("organizationId", authority.organizationId),
        )
        .unique();
      if (account === null) {
        throw new Error("Organization billing account is required.");
      }
      await requireBillingResourceCapacityForAccount(ctx, args.kind, account);
      return;
    }
    case "manual_provider_write": {
      const vault = await requireManualProviderWriteCheckpoint(ctx, args.authority);
      const account = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", vault.organizationId))
        .unique();
      if (account === null) {
        throw new Error("Organization billing account is required.");
      }
      await requireBillingResourceCapacityForAccount(ctx, args.kind, account);
      return;
    }
    default:
      args.authority satisfies never;
      throw new Error("Billing resource authority is invalid.");
  }
}

export const requireBillingResourceCapacityForVaultProvisioning = internalQuery({
  args: {
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    vaultId: id("vaults"),
    kind: vBillingResourceKind,
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireBillingResourceCapacityForVaultProvisioningRun(ctx, args);
    return null;
  },
});

export const getViewerBillingResourceUsage = query({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
  },
  returns: vBillingResourceUsage,
  handler: async (ctx, args): Promise<BillingResourceUsage> => {
    const billing = await requireBillingAccountForOrganization(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const limit = readResourceAttachmentLimit(billing.account);
    const [cloudflareWorkers, convexProjects] = await Promise.all([
      readResourceAttachmentCount(ctx, {
        kind: "cloudflare_worker",
        organizationId: billing.account.organizationId,
        maximumRows: RESOURCE_USAGE_READ_LIMIT,
      }),
      readResourceAttachmentCount(ctx, {
        kind: "convex_project",
        organizationId: billing.account.organizationId,
        maximumRows: RESOURCE_USAGE_READ_LIMIT,
      }),
    ]);

    const toUsageCount = (count: number) =>
      count === RESOURCE_USAGE_READ_LIMIT
        ? { state: "at_least" as const, count }
        : { state: "exact" as const, count };

    return {
      cloudflareWorkers: { used: toUsageCount(cloudflareWorkers), limit },
      convexProjects: { used: toUsageCount(convexProjects), limit },
    };
  },
});
