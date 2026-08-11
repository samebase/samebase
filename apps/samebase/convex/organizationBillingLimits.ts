import { ConvexError } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";

export type OrganizationMemberCapacity = {
  includedMembers: number;
  capacity: number;
  hasVerifiedSubscription: boolean;
};

export function readIncludedOrganizationMembers(
  githubOwnerType: Doc<"organizations">["githubOwnerType"],
): number {
  switch (githubOwnerType) {
    case "user":
      return 1;
    case "organization":
      return 2;
    default:
      githubOwnerType satisfies never;
      throw new Error("GitHub owner type is invalid.");
  }
}

export function readOrganizationMemberCapacity(args: {
  account: Doc<"organizationBillingAccounts">;
  organization: Doc<"organizations">;
}): OrganizationMemberCapacity {
  const includedMembers = readIncludedOrganizationMembers(args.organization.githubOwnerType);
  const seats = args.account.polarSeatQuantity;
  const hasVerifiedSubscription =
    (args.account.status === "active" || args.account.status === "past_due") &&
    seats !== undefined &&
    Number.isSafeInteger(seats) &&
    seats >= includedMembers;

  return {
    includedMembers,
    capacity: hasVerifiedSubscription ? seats : includedMembers,
    hasVerifiedSubscription,
  };
}

export async function readOrganizationMemberCapacityFromDb(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
): Promise<OrganizationMemberCapacity> {
  const [organization, account] = await Promise.all([
    db.get(organizationId),
    db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
      .unique(),
  ]);
  if (organization === null) {
    throw new Error("Organization not found.");
  }
  if (account === null) {
    throw new Error("Organization billing account is required.");
  }

  return readOrganizationMemberCapacity({ account, organization });
}

export async function readOrganizationMembershipCount(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
): Promise<number> {
  let count = 0;
  for await (const _membership of db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) => query.eq("organizationId", organizationId))) {
    count += 1;
  }
  return count;
}

export async function requireAdditionalOrganizationMemberCapacity(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
): Promise<void> {
  const { capacity } = await readOrganizationMemberCapacityFromDb(db, organizationId);
  const currentMemberships = await db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) => query.eq("organizationId", organizationId))
    .take(capacity);
  if (currentMemberships.length >= capacity) {
    throw new ConvexError(
      "This organization needs another paid member seat before you can accept this invitation.",
    );
  }
}

export async function isOrganizationBillingLimited(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
): Promise<boolean> {
  const { capacity } = await readOrganizationMemberCapacityFromDb(db, organizationId);
  const currentMemberships = await db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) => query.eq("organizationId", organizationId))
    .take(capacity + 1);
  return currentMemberships.length > capacity;
}

export async function requireOrganizationNotBillingLimited(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
): Promise<void> {
  if (await isOrganizationBillingLimited(db, organizationId)) {
    throw new ConvexError(
      "This organization needs more paid member seats. Billing and member management are still available.",
    );
  }
}

export async function requireUserIsNotOrganizationBillingPayer(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<void> {
  const account = await db
    .query("organizationBillingAccounts")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .unique();
  if (account === null) {
    throw new Error("Organization billing account is required.");
  }
  if (account.polarBillingUserId === args.userId) {
    throw new ConvexError(
      "Transfer organization billing before changing or removing the billing payer.",
    );
  }
}
