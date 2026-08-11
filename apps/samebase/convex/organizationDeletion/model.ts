import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { id, literal, number, object, string, union } = v;

export const vOrganizationDeletionGate = union(
  object({
    state: literal("deleting"),
    runId: id("workflow_organizationDeletion_runs"),
    requestedAt: number(),
  }),
  object({
    state: literal("delete_failed"),
    runId: id("workflow_organizationDeletion_runs"),
    failedAt: number(),
  }),
);
export type OrganizationDeletionGate = Infer<typeof vOrganizationDeletionGate>;
export const vOrganizationDeletionState = union(
  object({ state: literal("not_deleting") }),
  vOrganizationDeletionGate,
);
export type OrganizationDeletionState = Infer<typeof vOrganizationDeletionState>;

export const vOrganizationDeletionStep = union(
  literal("request_accepted"),
  literal("wait_for_active_work"),
  literal("stop_billing"),
  literal("delete_samebase_data"),
  literal("finish"),
);
export type OrganizationDeletionStep = Infer<typeof vOrganizationDeletionStep>;

export const vOrganizationDeletionEventLevel = union(
  literal("info"),
  literal("warning"),
  literal("error"),
);

export const vActiveOrganizationDeletionProviderCleanup = union(
  object({ state: literal("not_required") }),
  object({
    state: literal("pending_customer_lookup"),
    externalCustomerId: string(),
  }),
  object({
    state: literal("customer_identified"),
    externalCustomerId: string(),
    customerId: string(),
  }),
  object({
    state: literal("completed"),
    externalCustomerId: string(),
  }),
);
export type ActiveOrganizationDeletionProviderCleanup = Infer<
  typeof vActiveOrganizationDeletionProviderCleanup
>;

export const vCompletedOrganizationDeletionProviderCleanup = union(
  object({ state: literal("not_required") }),
  object({ state: literal("completed") }),
);

const activeOrganizationDeletionRunFields = {
  organization: object({
    state: literal("active"),
    organizationId: id("organizations"),
    githubOwnerLogin: string(),
  }),
  requestedByUserId: id("users"),
  currentStep: vOrganizationDeletionStep,
  requestedAt: number(),
  updatedAt: number(),
  retryCount: number(),
  executionAttempt: number(),
  automaticRestartCount: number(),
  providerWriteScanCursor: v.optional(string()),
  providerCleanup: vActiveOrganizationDeletionProviderCleanup,
};

export const organizationDeletionTables = {
  /** One recoverable organization-deletion attempt or scrubbed success receipt. */
  workflow_organizationDeletion_runs: defineTable(
    union(
      object({
        state: literal("running"),
        ...activeOrganizationDeletionRunFields,
      }),
      object({
        state: literal("needs_attention"),
        ...activeOrganizationDeletionRunFields,
        latestSafeError: string(),
      }),
      object({
        state: literal("succeeded"),
        organization: object({ state: literal("scrubbed") }),
        currentStep: literal("finish"),
        requestedAt: number(),
        updatedAt: number(),
        retryCount: number(),
        completedAt: number(),
        providerCleanup: vCompletedOrganizationDeletionProviderCleanup,
      }),
    ),
  )
    .index("by_organization_and_updated_at", ["organization.organizationId", "updatedAt"])
    .index("by_requested_by_user_and_state_and_updated_at", [
      "requestedByUserId",
      "state",
      "updatedAt",
    ])
    .index("by_updated_at", ["updatedAt"]),

  /** Ordered safe progress messages for one organization-deletion run. */
  workflow_organizationDeletion_events: defineTable({
    runId: id("workflow_organizationDeletion_runs"),
    step: vOrganizationDeletionStep,
    level: vOrganizationDeletionEventLevel,
    message: string(),
    createdAt: number(),
  }).index("by_run_and_created_at", ["runId", "createdAt"]),
};
