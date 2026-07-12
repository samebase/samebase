import { v } from "convex/values";

const { id, literal, number, object, optional, string, union } = v;

export const vAccountDeletionMarker = union(
  object({
    state: literal("deleting"),
    runId: id("accountDeletionRuns"),
    requestedAt: number(),
  }),
  object({
    state: literal("finalizing"),
    runId: id("accountDeletionRuns"),
    requestedAt: number(),
  }),
);

export const vAccountDeletionStep = union(
  literal("request_accepted"),
  literal("cancel_billing"),
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

const accountDeletionRunProgress = {
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  stagedFileCount: number(),
  updatedAt: number(),
} as const;

export const vActiveAccountDeletionRun = object({
  identity: object({
    state: literal("active"),
    userId: id("users"),
    email: string(),
  }),
  state: union(literal("queued"), literal("running"), literal("needs_attention")),
  ...accountDeletionRunProgress,
  initiatingSessionId: id("authSessions"),
  retryCount: number(),
  latestSafeError: optional(string()),
});

export const vScrubbedAccountDeletionRun = object({
  identity: object({
    state: literal("scrubbed"),
  }),
  state: literal("succeeded"),
  ...accountDeletionRunProgress,
  retryCount: number(),
  completedAt: number(),
});

export const vAccountDeletionRun = union(vActiveAccountDeletionRun, vScrubbedAccountDeletionRun);
