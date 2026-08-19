import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, number, object, optional, string, union } = v;

export const vAccountDeletionStep = union(
  literal("request_accepted"),
  literal("revoke_access"),
  literal("delete_samebase_data"),
  literal("send_completion_email"),
  literal("delete_identity"),
  literal("finish"),
);

export const vAccountDeletionEventLevel = union(
  literal("info"),
  literal("warning"),
  literal("error"),
);

export const CONVEX_MANUAL_REVOCATION_NOTICE =
  "Convex OAuth cannot be revoked by Samebase. Previously issued production and preview deploy keys remain usable until the user revokes Samebase in Convex Authorized Applications.";

export const vCompletedAccountDeletionProviderRevocationOutcome = object({
  state: literal("completed"),
  githubUserAuthorization: object({ state: literal("cleared") }),
  cloudflareConnections: object({ state: literal("cleared") }),
  convexConnections: union(
    object({ state: literal("cleared") }),
    object({
      state: literal("manual_revocation_required"),
      safeNotice: literal(CONVEX_MANUAL_REVOCATION_NOTICE),
    }),
  ),
});

export const vAccountDeletionProviderRevocationOutcome = union(
  object({ state: literal("not_started") }),
  object({
    state: literal("in_progress"),
    convexManualRevocationRequired: v.boolean(),
  }),
  vCompletedAccountDeletionProviderRevocationOutcome,
);

export const vAccountDeletionCompletionEmailOutcome = union(
  object({ state: literal("not_started") }),
  object({ state: literal("sent") }),
  object({ state: literal("delivery_failed"), safeError: string() }),
);

export const vAccountDeletionOutcomeSummary = object({
  providerRevocation: vAccountDeletionProviderRevocationOutcome,
  completionEmail: vAccountDeletionCompletionEmailOutcome,
});

const activeAccountDeletionRunFields = {
  identity: object({
    state: literal("active"),
    userId: id("users"),
    email: string(),
  }),
  completionCapability: string(),
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  updatedAt: number(),
  /** Present for self-service requests. Staff requests delete every target session. */
  initiatingSessionId: optional(id("authSessions")),
  retryCount: number(),
  outcomes: vAccountDeletionOutcomeSummary,
};

export const accountDeletionTables = {
  /** Account-deletion runs that are active or retained as scrubbed completion receipts. */
  workflow_accountDeletion_runs: defineTable(
    union(
      object({
        state: literal("queued"),
        ...activeAccountDeletionRunFields,
        workflow: object({
          state: literal("not_started"),
        }),
      }),
      object({
        state: literal("running"),
        ...activeAccountDeletionRunFields,
        workflow: object({
          state: literal("started"),
          workflowId: string(),
          attempt: number(),
        }),
      }),
      object({
        state: literal("needs_attention"),
        ...activeAccountDeletionRunFields,
        workflow: object({
          state: literal("started"),
          workflowId: string(),
          attempt: number(),
        }),
        latestSafeError: string(),
      }),
      object({
        state: literal("succeeded"),
        identity: object({
          state: literal("scrubbed"),
        }),
        completionCapability: string(),
        currentStep: literal("finish"),
        requestedAt: number(),
        updatedAt: number(),
        retryCount: number(),
        completedAt: number(),
        outcomes: vAccountDeletionOutcomeSummary,
      }),
    ),
  )
    .index("by_completion_capability", ["completionCapability"])
    .index("by_updated_at", ["updatedAt"]),

  /** Ordered identity-free progress messages for one account-deletion run. */
  workflow_accountDeletion_events: defineTable({
    runId: id("workflow_accountDeletion_runs"),
    step: vAccountDeletionStep,
    level: vAccountDeletionEventLevel,
    message: string(),
    createdAt: number(),
  }).index("by_run_and_created_at", ["runId", "createdAt"]),
};
