import { ConvexError } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX } from "./billingErrors";

export type OrganizationMemberCapacity = {
  includedMembers: number;
  capacity: number;
  hasVerifiedSubscription: boolean;
};

export const PRO_INCLUDED_ORGANIZATION_MEMBERS = 2;

function readFreeOrganizationMemberLimit(
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
  const freeMemberLimit = readFreeOrganizationMemberLimit(args.organization.githubOwnerType);
  const seats = args.account.polarSeatQuantity;
  const hasVerifiedSubscription =
    args.account.provider === "polar" &&
    args.account.plan === "pro" &&
    (args.account.status === "active" || args.account.status === "past_due") &&
    args.account.polarExternalCustomerId !== undefined &&
    args.account.polarExternalCustomerId.trim().length > 0 &&
    args.account.polarBillingUserId !== undefined &&
    seats !== undefined &&
    Number.isSafeInteger(seats) &&
    seats >= PRO_INCLUDED_ORGANIZATION_MEMBERS;
  const capacity = hasVerifiedSubscription ? seats : freeMemberLimit;

  return {
    includedMembers: hasVerifiedSubscription ? PRO_INCLUDED_ORGANIZATION_MEMBERS : freeMemberLimit,
    capacity,
    hasVerifiedSubscription,
  };
}

async function readOrganizationMemberCapacityForId(
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
  const { capacity } = await readOrganizationMemberCapacityForId(db, organizationId);
  if ((await readOrganizationMembershipCount(db, organizationId)) >= capacity) {
    throw new ConvexError(
      "This organization needs another paid member seat before another member can join.",
    );
  }
}

export async function requireOrganizationNotBillingLimited(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
): Promise<void> {
  const { capacity } = await readOrganizationMemberCapacityForId(db, organizationId);
  if ((await readOrganizationMembershipCount(db, organizationId)) > capacity) {
    throw new ConvexError(
      `${ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX}. Billing and member management are still available.`,
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
