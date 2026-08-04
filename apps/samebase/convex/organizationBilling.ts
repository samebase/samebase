import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader, DatabaseWriter } from "./_generated/server";

export type UserBillingAccount = {
  user: Doc<"users">;
  account: Doc<"organizationBillingAccounts">;
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

export async function findBillingAccountForOrganization(
  db: DatabaseReader,
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<UserBillingAccount | null> {
  const user = await db.get(args.userId);
  if (user === null) {
    return null;
  }

  const membership = await db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) =>
      query.eq("organizationId", args.organizationId).eq("userId", args.userId),
    )
    .unique();
  if (membership === null) {
    throw new Error("Organization membership is required.");
  }

  const account = await db
    .query("organizationBillingAccounts")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .unique();
  if (account === null) {
    throw new Error("Organization billing account is required.");
  }

  return {
    account,
    user,
  };
}

export async function requireBillingAccountForOrganization(
  db: DatabaseReader,
  args: { userId: Id<"users">; organizationId: Id<"organizations"> },
): Promise<UserBillingAccount> {
  const billing = await findBillingAccountForOrganization(db, args);
  if (billing === null) {
    throw new Error("User not found.");
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
  return {
    provider: account.provider,
    plan: account.plan,
    status: account.status,
    updatedAt: account.updatedAt,
    currentPeriodEndAt: account.currentPeriodEndAt,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
    polarExternalCustomerId: account.polarExternalCustomerId,
    polarStateChangedAt: account.polarStateChangedAt,
    polarObservationRevision: account.polarObservationRevision,
    polarAppliedObservationRevision: account.polarAppliedObservationRevision,
    polarCheckoutAttempt: account.polarCheckoutAttempt,
  };
}

export async function patchBillingAccount(
  db: DatabaseWriter,
  account: Doc<"organizationBillingAccounts">,
  patch: Partial<BillingAccountState>,
): Promise<void> {
  if (
    ("plan" in patch && patch.plan === undefined) ||
    ("status" in patch && patch.status === undefined)
  ) {
    throw new Error("Billing plan and status cannot be removed.");
  }

  await db.patch(account._id, patch);
}
