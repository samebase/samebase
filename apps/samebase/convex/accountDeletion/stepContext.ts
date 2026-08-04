import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { internalQuery, type QueryCtx } from "../_generated/server";
import {
  findBillingAccountForOrganization,
  readBillingAccountState,
  type BillingAccountState,
} from "../organizationBilling";

const { boolean, id, literal, object, optional, string, union } = v;

type RunningAccountDeletionRun = Extract<
  Doc<"workflow_accountDeletion_runs">,
  { state: "running" }
>;

export type AccountDeletionOrganization = {
  membershipId: Id<"organizationMemberships">;
  organizationId: Id<"organizations">;
  membershipState: "sole" | "shared";
};

export type AccountDeletionBilling =
  | {
      kind: "preserve_organization";
      hasCheckoutAttempt: boolean;
      organizationId: Id<"organizations">;
      user: Doc<"users">;
    }
  | {
      kind: "cancel";
      organizationId: Id<"organizations">;
      state: BillingAccountState;
      user: Doc<"users">;
    };

export async function readAccountDeletionOrganization(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<AccountDeletionOrganization> {
  const membershipsForUser = await db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .take(2);

  if (membershipsForUser.length === 0) {
    throw new Error("Organization membership is required.");
  }
  if (membershipsForUser.length > 1) {
    throw new Error("Account deletion is unavailable for accounts in multiple organizations.");
  }
  const [membership] = membershipsForUser;

  const memberships = await db
    .query("organizationMemberships")
    .withIndex("by_organization_and_user", (query) =>
      query.eq("organizationId", membership.organizationId),
    )
    .take(2);

  return {
    membershipId: membership._id,
    organizationId: membership.organizationId,
    membershipState: memberships.length === 1 ? "sole" : "shared",
  };
}

export async function readAccountDeletionBilling(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<AccountDeletionBilling | null> {
  const organization = await readAccountDeletionOrganization(db, userId);
  const billing = await findBillingAccountForOrganization(db, {
    userId,
    organizationId: organization.organizationId,
  });

  if (billing === null) {
    return null;
  }

  if (organization.membershipState === "shared") {
    const state = readBillingAccountState(billing.account);
    return {
      kind: "preserve_organization",
      hasCheckoutAttempt: state.polarCheckoutAttempt !== undefined,
      organizationId: organization.organizationId,
      user: billing.user,
    };
  }

  return {
    kind: "cancel",
    organizationId: organization.organizationId,
    state: readBillingAccountState(billing.account),
    user: billing.user,
  };
}

export async function readOwnedActiveRun(
  ctx: Pick<QueryCtx, "db">,
  args: { runId: Id<"workflow_accountDeletion_runs">; workflowId: string },
): Promise<RunningAccountDeletionRun> {
  const run = await ctx.db.get(args.runId);

  if (run === null || run.state !== "running") {
    throw new Error("Account deletion workflow is not running.");
  }

  if (run.workflow.workflowId !== args.workflowId) {
    throw new Error("Account deletion workflow ownership changed.");
  }

  return run;
}

export const getOwnedIdentity = internalQuery({
  args: {
    runId: id("workflow_accountDeletion_runs"),
    workflowId: string(),
  },
  returns: object({
    userId: id("users"),
    email: string(),
  }),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    return {
      userId: run.identity.userId,
      email: run.identity.email,
    };
  },
});

export const getOwnedBilling = internalQuery({
  args: {
    runId: id("workflow_accountDeletion_runs"),
    workflowId: string(),
  },
  returns: union(
    object({ state: literal("invalid") }),
    object({ state: literal("preserve_organization") }),
    object({
      state: literal("cancel"),
      hasCheckoutAttempt: boolean(),
      provider: optional(literal("polar")),
      plan: union(literal("free"), literal("pro")),
      status: union(literal("inactive"), literal("active"), literal("past_due")),
      polarExternalCustomerId: optional(string()),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const billing = await readAccountDeletionBilling(ctx.db, run.identity.userId);

    if (billing === null || billing.user.accountDeletion?.runId !== run._id) {
      return { state: "invalid" } as const;
    }

    if (billing.kind === "preserve_organization") {
      return { state: "preserve_organization" } as const;
    }

    return {
      state: "cancel" as const,
      hasCheckoutAttempt: billing.state.polarCheckoutAttempt !== undefined,
      provider: billing.state.provider,
      plan: billing.state.plan,
      status: billing.state.status,
      polarExternalCustomerId: billing.state.polarExternalCustomerId,
    };
  },
});
