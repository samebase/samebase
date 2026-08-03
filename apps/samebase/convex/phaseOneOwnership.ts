import type { Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";

type PhaseOneUserOwnedResource = {
  userId: Id<"users">;
  organizationId?: Id<"organizations">;
};

type PhaseOneVault = PhaseOneUserOwnedResource & {
  _id: Id<"vaults">;
};

type PhaseOneVaultChild = PhaseOneUserOwnedResource & {
  vaultId: Id<"vaults">;
};

export type PhaseOneOwnershipContext = {
  userId: Id<"users">;
  organizationId?: Id<"organizations">;
};

/**
 * Phase 1 keeps the legacy user owner authoritative. A prepared organization
 * key is only a consistency check until the Phase 2 access switch.
 */
export async function readPhaseOneOwnershipContext(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<PhaseOneOwnershipContext> {
  const membership = await db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .unique();
  return {
    userId,
    ...(membership ? { organizationId: membership.organizationId } : {}),
  };
}

export function hasPhaseOneUserOwnership(
  context: PhaseOneOwnershipContext,
  resource: PhaseOneUserOwnedResource,
): boolean {
  return (
    resource.userId === context.userId &&
    (resource.organizationId === undefined || resource.organizationId === context.organizationId)
  );
}

export function hasPhaseOneVaultChildOwnership(
  context: PhaseOneOwnershipContext,
  vault: PhaseOneVault,
  child: PhaseOneVaultChild,
): boolean {
  return (
    hasPhaseOneUserOwnership(context, vault) &&
    child.vaultId === vault._id &&
    hasPhaseOneUserOwnership(context, child) &&
    (child.organizationId === undefined || child.organizationId === vault.organizationId)
  );
}
