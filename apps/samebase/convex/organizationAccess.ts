import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type DatabaseReader } from "./_generated/server";
import { requireOrganizationNotBillingLimited } from "./organizationBillingLimits";
import { vOrganizationMembershipRole } from "./organizationModel";
import { readActiveUser, type NonDeletedUserLifecycleDoc } from "./userLifecycle";

export type OrganizationAccessContext = {
  userId: Id<"users">;
  organizationId: Id<"organizations">;
};

export function requireOrganizationMembershipUser(
  user: Doc<"users"> | null,
): NonDeletedUserLifecycleDoc {
  if (user === null) {
    throw new Error("Organization membership user reference is invalid.");
  }
  if (user.state === "deleted") {
    throw new Error("Organization membership references a deleted user.");
  }
  return user;
}

export async function requireActiveOrganizationActor(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<void> {
  const user = await db.get(userId);
  if (user === null) {
    throw new Error("Organization actor user reference is invalid.");
  }
  if (readActiveUser(user) === null) {
    throw new Error("An active Samebase user is required.");
  }
}

export async function findOrganizationMembership(
  db: DatabaseReader,
  access: OrganizationAccessContext,
): Promise<Doc<"organizationMemberships"> | null> {
  return await db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) =>
      query.eq("organizationId", access.organizationId).eq("userId", access.userId),
    )
    .unique();
}

export async function findOrganizationAccessContext(
  db: DatabaseReader,
  access: OrganizationAccessContext,
): Promise<OrganizationAccessContext | null> {
  await requireActiveOrganizationActor(db, access.userId);
  const membership = await findOrganizationMembership(db, access);
  if (membership === null) {
    return null;
  }
  await requireOrganizationNotBillingLimited(db, access.organizationId);
  return access;
}

/** Resolve membership for billing and member-management recovery surfaces. */
export async function requireOrganizationSettingsMembership(
  db: DatabaseReader,
  access: OrganizationAccessContext,
): Promise<Doc<"organizationMemberships">> {
  await requireActiveOrganizationActor(db, access.userId);
  const membership = await findOrganizationMembership(db, access);
  if (membership === null) {
    throw new Error("Organization membership is required.");
  }

  return membership;
}

/** Resolve the acting user's membership for normal organization work. */
export async function requireOrganizationMembership(
  db: DatabaseReader,
  access: OrganizationAccessContext,
): Promise<Doc<"organizationMemberships">> {
  const membership = await requireOrganizationSettingsMembership(db, access);
  await requireOrganizationNotBillingLimited(db, access.organizationId);
  return membership;
}

/** Resolve the acting user's required organization membership. */
export async function requireOrganizationAccessContext(
  db: DatabaseReader,
  access: OrganizationAccessContext,
): Promise<OrganizationAccessContext> {
  await requireOrganizationMembership(db, access);

  return access;
}

/** Resolve the acting user's required owner role for an organization. */
export async function requireOrganizationOwnerAccessContext(
  db: DatabaseReader,
  access: OrganizationAccessContext,
): Promise<OrganizationAccessContext> {
  const membership = await requireOrganizationMembership(db, access);
  if (membership.role !== "owner") {
    throw new Error("Organization owner access is required.");
  }

  return access;
}

/** Resolve owner access for billing and member-management recovery surfaces. */
export async function requireOrganizationSettingsOwnerAccessContext(
  db: DatabaseReader,
  access: OrganizationAccessContext,
): Promise<OrganizationAccessContext> {
  const membership = await requireOrganizationSettingsMembership(db, access);
  if (membership.role !== "owner") {
    throw new Error("Organization owner access is required.");
  }

  return access;
}

/** Require an active owner other than the user whose owner role will be removed. */
export async function requireAnotherActiveOrganizationOwner(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    excludedUserId: Id<"users">;
  },
): Promise<void> {
  for await (const membership of db
    .query("organizationMemberships")
    .withIndex("by_organization_and_role", (query) =>
      query.eq("organizationId", args.organizationId).eq("role", "owner"),
    )) {
    if (membership.userId === args.excludedUserId) {
      continue;
    }
    const user = requireOrganizationMembershipUser(await db.get(membership.userId));
    if (readActiveUser(user) !== null) {
      return;
    }
  }

  throw new ConvexError("An organization must have at least one active owner.");
}

/** Load the organization that owns a vault and its current GitHub owner identity. */
export async function requireVaultOrganization(
  db: DatabaseReader,
  vault: Pick<Doc<"vaults">, "organizationId">,
): Promise<Doc<"organizations">> {
  const organization = await db.get(vault.organizationId);
  if (organization === null) {
    throw new Error("Vault organization not found.");
  }
  return organization;
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

export const requireOrganizationRoleForUser = internalQuery({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  returns: vOrganizationMembershipRole,
  handler: async (ctx, args) => {
    return (await requireOrganizationMembership(ctx.db, args)).role;
  },
});

export const requireOrganizationOwnerIdForUser = internalQuery({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    const access = await requireOrganizationOwnerAccessContext(ctx.db, args);
    return access.organizationId;
  },
});
