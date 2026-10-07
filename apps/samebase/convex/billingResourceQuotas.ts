import { ConvexError, Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import {
  ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX,
  ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX,
} from "./billingErrors";
import { query } from "./functions";
import { requireBillingAccountForOrganization } from "./organizationBilling";
import {
  readOrganizationMemberCapacity,
  readOrganizationMembershipCount,
} from "./organization/billingLimits";
import { requireActiveRepositoryProvisioningAuthority } from "./repositoryWorkflowAuthority";
import { requireManualProviderWriteCheckpoint } from "./repository/infrastructureOperation";

const { id, literal, number, object, union } = v;

const PERSONAL_FREE_CONNECTION_LIMIT = 12;
const ORGANIZATION_FREE_CONNECTION_LIMIT = 6;
export const MAX_ORGANIZATION_CONNECTIONS = 120;
const CONNECTION_USAGE_READ_LIMIT = MAX_ORGANIZATION_CONNECTIONS + 1;

type BillingResourceReadCtx = Pick<QueryCtx, "db">;
export type BillingResourceAuthority =
  | {
      kind: "user";
      organizationId: Id<"organizations">;
      userId: Id<"users">;
    }
  | {
      kind: "repository_provisioning";
      runId: Id<"workflow_repositoryProvisioning_runs">;
      userId: Id<"users">;
      repositoryId: Id<"repositories">;
    }
  | {
      kind: "manual_provider_write";
      actionId: string;
      userId: Id<"users">;
      repositoryId: Id<"repositories">;
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
  if (readOrganizationMemberCapacity({ account, organization }).hasVerifiedSubscription) {
    return MAX_ORGANIZATION_CONNECTIONS;
  }
  switch (organization.githubOwnerType) {
    case "user":
      return PERSONAL_FREE_CONNECTION_LIMIT;
    case "organization":
      return ORGANIZATION_FREE_CONNECTION_LIMIT;
    default:
      organization.githubOwnerType satisfies never;
      throw new Error("GitHub owner type is invalid.");
  }
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
      .query("repositories")
      .withIndex("by_organization_and_state_and_deletion_state", (query) =>
        query.eq("organizationId", args.organizationId).eq("state", "connected"),
      )
      .take(args.maximumRows),
    ctx.db
      .query("repositoryCloudflareWorkers")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
      .take(args.maximumRows),
    ctx.db
      .query("repositoryConvexProjects")
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

/**
Fails unless the organization's member seats are paid and it has `connections` connections left:
the repositories, Workers, and Convex projects that the caller is about to add.
*/
export async function requireBillingResourceCapacity(
  ctx: BillingResourceReadCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    connections: number;
  },
): Promise<void> {
  const billing = await requireBillingAccountForOrganization(ctx.db, args);
  const organization = await ctx.db.get(billing.account.organizationId);
  if (organization === null) {
    throw new Error("Organization billing account refers to a missing organization.");
  }
  const memberCapacity = readOrganizationMemberCapacity({
    account: billing.account,
    organization,
  });
  if (
    (await readOrganizationMembershipCount(ctx.db, billing.account.organizationId)) >
    memberCapacity.capacity
  ) {
    throw new ConvexError(
      `${ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX}. Billing and member management are still available.`,
    );
  }
  await requireOrganizationConnectionCapacity(ctx, {
    account: billing.account,
    organization,
    connections: args.connections,
  });
}

async function requireOrganizationConnectionCapacity(
  ctx: BillingResourceReadCtx,
  args: {
    account: Doc<"organizationBillingAccounts">;
    organization: Doc<"organizations">;
    connections: number;
  },
): Promise<void> {
  const limit = readOrganizationConnectionLimit(args.account, args.organization);
  const used = await readOrganizationConnectionCounts(ctx, {
    organizationId: args.account.organizationId,
    maximumRows: limit + 1,
  });
  if (used.total + args.connections <= limit) {
    return;
  }
  const left = Math.max(0, limit - used.total);
  throw new ConvexError(
    args.connections === 1
      ? `${ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX} (${limit}).`
      : `${ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX} (${limit}). This takes ${args.connections} connections, and the organization has ${left} left.`,
  );
}

async function requireOrganizationConnectionCapacityForId(
  ctx: BillingResourceReadCtx,
  organizationId: Id<"organizations">,
): Promise<void> {
  const [account, organization] = await Promise.all([
    ctx.db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
      .unique(),
    ctx.db.get(organizationId),
  ]);
  if (account === null) {
    throw new Error("Organization billing account is required.");
  }
  if (organization === null) {
    throw new Error("Organization not found.");
  }
  await requireOrganizationConnectionCapacity(ctx, { account, organization, connections: 1 });
}

export const requireBillingResourceCapacityForProviderCreate = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireBillingResourceCapacity(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      connections: 1,
    });
    return null;
  },
});

export async function requireBillingResourceCapacityForAuthority(
  ctx: BillingResourceReadCtx,
  args: {
    authority: BillingResourceAuthority;
  },
): Promise<void> {
  switch (args.authority.kind) {
    case "user":
      await requireBillingResourceCapacity(ctx, {
        organizationId: args.authority.organizationId,
        userId: args.authority.userId,
        connections: 1,
      });
      return;
    case "repository_provisioning": {
      const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, args.authority);
      await requireOrganizationConnectionCapacityForId(ctx, authority.organizationId);
      return;
    }
    case "manual_provider_write": {
      const repository = await requireManualProviderWriteCheckpoint(ctx, args.authority);
      await requireOrganizationConnectionCapacityForId(ctx, repository.organizationId);
      return;
    }
    default:
      args.authority satisfies never;
      throw new Error("Billing resource authority is invalid.");
  }
}

export const requireBillingResourceCapacityForRepositoryProvisioning = internalQuery({
  args: {
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    repositoryId: id("repositories"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireBillingResourceCapacityForAuthority(ctx, {
      authority: {
        kind: "repository_provisioning",
        runId: args.runId,
        userId: args.userId,
        repositoryId: args.repositoryId,
      },
    });
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
