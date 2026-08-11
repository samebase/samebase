import { ConvexError, Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { query } from "./functions";
import {
  readBillingAccountState,
  requireBillingAccountForOrganization,
} from "./organizationBilling";
import { requireOrganizationNotBillingLimited } from "./organizationBillingLimits";
import { requireActiveVaultProvisioningAuthority } from "./vaultWorkflowAuthority";
import { requireManualProviderWriteCheckpoint } from "./vault/infrastructureOperation";

const { id, literal, null: nullValue, number, object, union } = v;

const PERSONAL_FREE_CONNECTION_LIMIT = 15;
const ORGANIZATION_FREE_CONNECTION_LIMIT = 6;
const PRO_CONNECTION_LIMIT = 120;
const CONNECTION_USAGE_READ_LIMIT = PRO_CONNECTION_LIMIT + 1;

const vBillingResourceKind = union(
  literal("github_repository"),
  literal("cloudflare_worker"),
  literal("convex_project"),
);
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
  connections: vResourceAttachmentUsage,
});
export type BillingResourceUsage = Infer<typeof vBillingResourceUsage>;

type OrganizationConnectionCounts = {
  repositories: number;
  cloudflareWorkers: number;
  convexProjects: number;
  total: number;
};

function readOrganizationConnectionLimit(
  account: Doc<"organizationBillingAccounts">,
  organization: Doc<"organizations">,
): number {
  const state = readBillingAccountState(account);
  if (state.plan === "pro" && (state.status === "active" || state.status === "past_due")) {
    return PRO_CONNECTION_LIMIT;
  }
  return organization.githubOwnerType === "user"
    ? PERSONAL_FREE_CONNECTION_LIMIT
    : ORGANIZATION_FREE_CONNECTION_LIMIT;
}

async function readOrganizationConnectionCounts(
  ctx: BillingResourceReadCtx,
  args: {
    organizationId: Id<"organizations">;
    maximumRows: number;
  },
): Promise<OrganizationConnectionCounts> {
  const [repositories, cloudflareWorkers, convexProjects] = await Promise.all([
    ctx.db
      .query("vaults")
      .withIndex("by_organization_and_state_and_deletion_state", (query) =>
        query.eq("organizationId", args.organizationId).eq("state", "connected"),
      )
      .take(args.maximumRows),
    ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
      .take(args.maximumRows),
    ctx.db
      .query("vaultConvexProjects")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
      .take(args.maximumRows),
  ]);
  return {
    repositories: repositories.length,
    cloudflareWorkers: cloudflareWorkers.length,
    convexProjects: convexProjects.length,
    total: repositories.length + cloudflareWorkers.length + convexProjects.length,
  };
}

function throwBillingResourceLimit(limit: number): never {
  throw new ConvexError(`Organization connection limit reached (${limit}).`);
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
  await requireBillingResourceCapacityForAccount(ctx, billing.account);
}

async function requireBillingResourceCapacityForAccount(
  ctx: BillingResourceReadCtx,
  account: Doc<"organizationBillingAccounts">,
): Promise<void> {
  const organization = await ctx.db.get(account.organizationId);
  if (organization === null) {
    throw new Error("Organization billing account refers to a missing organization.");
  }
  await requireOrganizationNotBillingLimited(ctx.db, account.organizationId);
  const limit = readOrganizationConnectionLimit(account, organization);
  const used = await readOrganizationConnectionCounts(ctx, {
    organizationId: account.organizationId,
    maximumRows: limit + 1,
  });
  if (used.total >= limit) {
    throwBillingResourceLimit(limit);
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
      await requireBillingResourceCapacityForAccount(ctx, account);
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
      await requireBillingResourceCapacityForAccount(ctx, account);
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
    const organization = await ctx.db.get(billing.account.organizationId);
    if (organization === null) {
      throw new Error("Organization billing account refers to a missing organization.");
    }
    const limit = readOrganizationConnectionLimit(billing.account, organization);
    const usage = await readOrganizationConnectionCounts(ctx, {
      organizationId: billing.account.organizationId,
      maximumRows: CONNECTION_USAGE_READ_LIMIT,
    });

    const isBounded =
      usage.repositories === CONNECTION_USAGE_READ_LIMIT ||
      usage.cloudflareWorkers === CONNECTION_USAGE_READ_LIMIT ||
      usage.convexProjects === CONNECTION_USAGE_READ_LIMIT;

    return {
      connections: {
        used: isBounded
          ? { state: "at_least", count: usage.total }
          : { state: "exact", count: usage.total },
        limit,
      },
    };
  },
});
