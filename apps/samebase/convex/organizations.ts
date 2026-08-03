import type { Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";

/**
 * Give one user one organization membership and its billing account. Repeated
 * calls keep the existing rows.
 */
export async function ensureOrganizationForUser(
  db: DatabaseWriter,
  userId: Id<"users">,
): Promise<void> {
  if ((await db.get(userId)) === null) {
    throw new Error("Organization provisioning requires an existing user.");
  }

  const membership = await db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .unique();
  const organizationId =
    membership === null ? await db.insert("organizations", {}) : membership.organizationId;

  if (membership === null) {
    await db.insert("organizationMemberships", {
      organizationId,
      userId,
    });
  } else if ((await db.get(organizationId)) === null) {
    throw new Error("Organization membership refers to a missing organization.");
  }

  const billingAccount = await db
    .query("organizationBillingAccounts")
    .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
    .unique();
  if (billingAccount === null) {
    await db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
  }
}
