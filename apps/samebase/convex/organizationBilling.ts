import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader, DatabaseWriter } from "./_generated/server";

export type BillingAccountTarget =
  | {
      kind: "organization";
      account: Doc<"organizationBillingAccounts">;
    }
  | {
      kind: "legacy_user";
      account: Doc<"users">;
    };

export type UserBillingAccount = {
  user: Doc<"users">;
  target: BillingAccountTarget;
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

export async function findBillingAccountForUser(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<UserBillingAccount | null> {
  const user = await db.get(userId);
  if (user === null) {
    return null;
  }

  const membership = await db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .unique();
  if (membership === null) {
    return {
      user,
      target: { kind: "legacy_user", account: user },
    };
  }

  const account = await db
    .query("organizationBillingAccounts")
    .withIndex("by_organization", (query) => query.eq("organizationId", membership.organizationId))
    .unique();
  if (account === null) {
    throw new Error("Organization billing account is required.");
  }

  return {
    user,
    target: { kind: "organization", account },
  };
}

export async function requireBillingAccountForUser(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<UserBillingAccount> {
  const billing = await findBillingAccountForUser(db, userId);
  if (billing === null) {
    throw new Error("User not found.");
  }
  return billing;
}

export async function findBillingAccountByPolarExternalCustomerId(
  db: DatabaseReader,
  externalCustomerId: string,
): Promise<BillingAccountTarget | null> {
  const organizationAccount = await db
    .query("organizationBillingAccounts")
    .withIndex("by_polar_external_customer_id", (query) =>
      query.eq("polarExternalCustomerId", externalCustomerId),
    )
    .unique();
  if (organizationAccount !== null) {
    return { kind: "organization", account: organizationAccount };
  }

  const user = await db
    .query("users")
    .withIndex("by_polar_external_customer_id", (query) =>
      query.eq("billingPolarExternalCustomerId", externalCustomerId),
    )
    .unique();
  if (user === null) {
    return null;
  }

  const membership = await db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", user._id))
    .unique();
  return membership === null ? { kind: "legacy_user", account: user } : null;
}

export function readBillingAccountState(target: BillingAccountTarget): BillingAccountState {
  if (target.kind === "organization") {
    const account = target.account;
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

  const user = target.account;
  return {
    provider: user.billingProvider,
    plan: user.billingPlan ?? "free",
    status: user.billingStatus ?? "inactive",
    updatedAt: user.billingUpdatedAt,
    currentPeriodEndAt: user.billingCurrentPeriodEndAt,
    cancelAtPeriodEnd: user.billingCancelAtPeriodEnd,
    polarExternalCustomerId: user.billingPolarExternalCustomerId,
    polarStateChangedAt: user.billingPolarStateChangedAt,
    polarObservationRevision: user.billingPolarObservationRevision,
    polarAppliedObservationRevision: user.billingPolarAppliedObservationRevision,
    polarCheckoutAttempt: user.billingPolarCheckoutAttempt,
  };
}

export async function patchBillingAccount(
  db: DatabaseWriter,
  target: BillingAccountTarget,
  patch: Partial<BillingAccountState>,
): Promise<void> {
  if (
    ("plan" in patch && patch.plan === undefined) ||
    ("status" in patch && patch.status === undefined)
  ) {
    throw new Error("Billing plan and status cannot be removed.");
  }

  if (target.kind === "organization") {
    await db.patch(target.account._id, patch);
    return;
  }

  await db.patch(target.account._id, {
    ...("provider" in patch ? { billingProvider: patch.provider } : {}),
    ...("plan" in patch ? { billingPlan: patch.plan } : {}),
    ...("status" in patch ? { billingStatus: patch.status } : {}),
    ...("updatedAt" in patch ? { billingUpdatedAt: patch.updatedAt } : {}),
    ...("currentPeriodEndAt" in patch
      ? { billingCurrentPeriodEndAt: patch.currentPeriodEndAt }
      : {}),
    ...("cancelAtPeriodEnd" in patch ? { billingCancelAtPeriodEnd: patch.cancelAtPeriodEnd } : {}),
    ...("polarExternalCustomerId" in patch
      ? { billingPolarExternalCustomerId: patch.polarExternalCustomerId }
      : {}),
    ...("polarStateChangedAt" in patch
      ? { billingPolarStateChangedAt: patch.polarStateChangedAt }
      : {}),
    ...("polarObservationRevision" in patch
      ? { billingPolarObservationRevision: patch.polarObservationRevision }
      : {}),
    ...("polarAppliedObservationRevision" in patch
      ? { billingPolarAppliedObservationRevision: patch.polarAppliedObservationRevision }
      : {}),
    ...("polarCheckoutAttempt" in patch
      ? { billingPolarCheckoutAttempt: patch.polarCheckoutAttempt }
      : {}),
  });
}
