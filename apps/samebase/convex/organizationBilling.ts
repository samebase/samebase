import { pick } from "@samebase/dependent/object";

import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import { requireOrganizationMembership } from "./organizationAccess";

export type OrganizationBillingAccess = {
  user: Doc<"users">;
  account: Doc<"organizationBillingAccounts">;
  role: Doc<"organizationMemberships">["role"];
};

export type BillingAccountState = Pick<
  Doc<"organizationBillingAccounts">,
  | "provider"
  | "plan"
  | "status"
  | "updatedAt"
  | "currentPeriodEndAt"
  | "cancelAtPeriodEnd"
  | "polarExternalCustomerId"
  | "polarStateChangedAt"
  | "polarObservationRevision"
  | "polarAppliedObservationRevision"
  | "polarCheckoutAttempt"
>;

type BillingAccountPatch = {
  [Field in keyof BillingAccountState]?: undefined extends BillingAccountState[Field]
    ? BillingAccountState[Field] | undefined
    : BillingAccountState[Field];
};

export async function findBillingAccountForOrganization(
  db: DatabaseReader,
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<OrganizationBillingAccess | null> {
  const user = await db.get(args.userId);
  if (user === null) {
    return null;
  }

  const membership = await requireOrganizationMembership(db, args);

  const account = await db
    .query("organizationBillingAccounts")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .unique();
  if (account === null) {
    throw new Error("Organization billing account is required.");
  }

  return {
    account,
    role: membership.role,
    user,
  };
}

export async function requireBillingAccountForOrganization(
  db: DatabaseReader,
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<OrganizationBillingAccess> {
  const billing = await findBillingAccountForOrganization(db, args);
  if (billing === null) {
    throw new Error("User not found.");
  }

  return billing;
}

export async function requireOwnerBillingAccountForOrganization(
  db: DatabaseReader,
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<OrganizationBillingAccess> {
  const billing = await requireBillingAccountForOrganization(db, args);
  if (billing.role !== "owner") {
    throw new Error("Organization owner access is required.");
  }

  return billing;
}

export async function findBillingAccountByPolarExternalCustomerId(
  db: DatabaseReader,
  externalCustomerId: string,
): Promise<Doc<"organizationBillingAccounts"> | null> {
  return await db
    .query("organizationBillingAccounts")
    .withIndex("by_polar_external_customer_id", (query) =>
      query.eq("polarExternalCustomerId", externalCustomerId),
    )
    .unique();
}

export function readBillingAccountState(
  account: Doc<"organizationBillingAccounts">,
): BillingAccountState {
  return pick(account, [
    "provider",
    "plan",
    "status",
    "updatedAt",
    "currentPeriodEndAt",
    "cancelAtPeriodEnd",
    "polarExternalCustomerId",
    "polarStateChangedAt",
    "polarObservationRevision",
    "polarAppliedObservationRevision",
    "polarCheckoutAttempt",
  ]);
}

export async function patchBillingAccount(
  db: DatabaseWriter,
  account: Doc<"organizationBillingAccounts">,
  patch: BillingAccountPatch,
): Promise<void> {
  await db.patch(account._id, patch);
}
