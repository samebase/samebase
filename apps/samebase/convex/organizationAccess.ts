import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type DatabaseReader } from "./_generated/server";

export type OrganizationAccessContext = {
  userId: Id<"users">;
  organizationId: Id<"organizations">;
};

export async function findOrganizationAccessContext(
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
  access: OrganizationAccessContext,
): Promise<OrganizationAccessContext> {
  const verifiedAccess = await findOrganizationAccessContext(db, access);
  if (verifiedAccess === null) {
    throw new Error("Organization membership is required.");
  }

  return verifiedAccess;
}

/** List every organization the user can access in stable identifier order. */
export async function listOrganizationIdsForUser(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<Id<"organizations">[]> {
  const organizationIds = new Set<Id<"organizations">>();
  for await (const membership of db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", userId))) {
    organizationIds.add(membership.organizationId);
  }

  return [...organizationIds].sort((left, right) => left.localeCompare(right));
}

/** Load a vault, then verify that the user is a current organization member. */
export async function findVaultForUser(
  db: DatabaseReader,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"vaults"> | null> {
  const vault = await db.get(args.vaultId);
  if (vault === null) {
    return null;
  }

  const access = await findOrganizationAccessContext(db, {
    userId: args.userId,
    organizationId: vault.organizationId,
  });
  return access === null ? null : vault;
}

/** Load a vault and require current membership in its organization. */
export async function requireVaultForUser(
  db: DatabaseReader,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"vaults">> {
  const vault = await findVaultForUser(db, args);
  if (vault === null) {
    throw new Error("Vault not found");
  }

  return vault;
}

export const requireOrganizationIdForUser = internalQuery({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccessContext(ctx.db, args);
    return access.organizationId;
  },
});
