import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type DatabaseReader } from "./_generated/server";

type OrganizationResource = {
  organizationId: Id<"organizations">;
};

type OrganizationVault = OrganizationResource & {
  _id: Id<"vaults">;
};

type OrganizationVaultChild = OrganizationResource & {
  vaultId: Id<"vaults">;
};

export type OrganizationAccessContext = {
  userId: Id<"users">;
  organizationId: Id<"organizations">;
};

export async function findOrganizationAccessContext(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<OrganizationAccessContext | null> {
  const membership = await db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .unique();
  if (membership === null) {
    return null;
  }

  return {
    userId,
    organizationId: membership.organizationId,
  };
}

export async function findOrganizationAccessContextForOrganization(
  db: DatabaseReader,
  access: OrganizationAccessContext,
): Promise<OrganizationAccessContext | null> {
  const membership = await db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) =>
      query.eq("organizationId", access.organizationId).eq("userId", access.userId),
    )
    .unique();

  return membership === null ? null : access;
}

/** Resolve the acting user's required organization membership. */
export async function requireOrganizationAccessContext(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<OrganizationAccessContext> {
  const access = await findOrganizationAccessContext(db, userId);
  if (access === null) {
    throw new Error("Organization membership is required.");
  }
  return access;
}

export const getOrganizationIdForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccessContext(ctx.db, args.userId);
    return access.organizationId;
  },
});

export function hasOrganizationAccess(
  context: OrganizationAccessContext,
  resource: OrganizationResource,
): boolean {
  return resource.organizationId === context.organizationId;
}

export function hasVaultChildOrganizationAccess(
  context: OrganizationAccessContext,
  vault: OrganizationVault,
  child: OrganizationVaultChild,
): boolean {
  return (
    hasOrganizationAccess(context, vault) &&
    child.vaultId === vault._id &&
    hasOrganizationAccess(context, child)
  );
}
