import { Infer, v } from "convex/values";

const { id, literal, number, object, string, union } = v;

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

const vAccountDeletionBillingOutcome = union(
  object({ state: literal("not_started") }),
  object({ state: literal("not_applicable") }),
  object({ state: literal("succeeded") }),
  object({ state: literal("failed"), safeError: string() }),
);

export const GITHUB_REVOCATION_UNCONFIRMED_ERROR =
  "GitHub OAuth revocation could not be confirmed.";
export const CLOUDFLARE_REVOCATION_UNCONFIRMED_ERROR =
  "Cloudflare OAuth revocation could not be confirmed.";
export const CONVEX_MANUAL_REVOCATION_NOTICE =
  "Convex OAuth cannot be revoked by Samebase. Previously issued production and preview deploy keys remain usable until the user revokes Samebase in Convex Authorized Applications.";

const vProviderNotConnected = object({ state: literal("not_connected") });
const vProviderLocalDeleteOnly = object({ state: literal("local_delete_only") });
const vProviderRevoked = object({ state: literal("revoked") });

export const vAccountDeletionGithubOutcome = union(
  vProviderNotConnected,
  vProviderLocalDeleteOnly,
  vProviderRevoked,
  object({
    state: literal("unconfirmed"),
    safeError: literal(GITHUB_REVOCATION_UNCONFIRMED_ERROR),
  }),
);
export type AccountDeletionGithubOutcome = Infer<typeof vAccountDeletionGithubOutcome>;

export const vAccountDeletionCloudflareOutcome = union(
  vProviderNotConnected,
  vProviderLocalDeleteOnly,
  vProviderRevoked,
  object({
    state: literal("unconfirmed"),
    safeError: literal(CLOUDFLARE_REVOCATION_UNCONFIRMED_ERROR),
  }),
);
export type AccountDeletionCloudflareOutcome = Infer<typeof vAccountDeletionCloudflareOutcome>;

export const vAccountDeletionConvexOutcome = union(
  vProviderNotConnected,
  vProviderLocalDeleteOnly,
  object({
    state: literal("manual_revocation_required"),
    safeNotice: literal(CONVEX_MANUAL_REVOCATION_NOTICE),
  }),
);
export type AccountDeletionConvexOutcome = Infer<typeof vAccountDeletionConvexOutcome>;

export const vCompletedAccountDeletionProviderRevocationOutcome = object({
  state: literal("completed"),
  github: vAccountDeletionGithubOutcome,
  cloudflare: vAccountDeletionCloudflareOutcome,
  convex: vAccountDeletionConvexOutcome,
});

export const vAccountDeletionProviderRevocationOutcome = union(
  object({ state: literal("not_started") }),
  vCompletedAccountDeletionProviderRevocationOutcome,
);

export const vAccountDeletionCompletionEmailOutcome = union(
  object({ state: literal("not_started") }),
  object({ state: literal("sent") }),
  object({ state: literal("delivery_failed"), safeError: string() }),
);

export const vAccountDeletionOutcomeSummary = object({
  billing: vAccountDeletionBillingOutcome,
  providerRevocation: vAccountDeletionProviderRevocationOutcome,
  completionEmail: vAccountDeletionCompletionEmailOutcome,
});

const vAccountDeletionWorkflowNotStarted = object({
  state: literal("not_started"),
});

const vAccountDeletionWorkflowStarted = object({
  state: literal("started"),
  workflowId: string(),
  attempt: number(),
});

const activeIdentity = object({
  state: literal("active"),
  userId: id("users"),
  email: string(),
});

const activeRunFields = {
  identity: activeIdentity,
  completionCapability: string(),
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  updatedAt: number(),
  initiatingSessionId: id("authSessions"),
  retryCount: number(),
  outcomes: vAccountDeletionOutcomeSummary,
} as const;

const vQueuedAccountDeletionRun = object({
  ...activeRunFields,
  state: literal("queued"),
  workflow: vAccountDeletionWorkflowNotStarted,
});

const vRunningAccountDeletionRun = object({
  ...activeRunFields,
  state: literal("running"),
  workflow: vAccountDeletionWorkflowStarted,
});

const vNeedsAttentionAccountDeletionRun = object({
  ...activeRunFields,
  state: literal("needs_attention"),
  workflow: vAccountDeletionWorkflowStarted,
  latestSafeError: string(),
});

const scrubbedRunFields = {
  identity: object({
    state: literal("scrubbed"),
  }),
  state: literal("succeeded"),
  currentStep: literal("finish"),
  requestedAt: number(),
  updatedAt: number(),
  retryCount: number(),
  completedAt: number(),
  outcomes: vAccountDeletionOutcomeSummary,
} as const;

const vScrubbedAccountDeletionRun = object({
  ...scrubbedRunFields,
  // Receipts completed before public completion tracking shipped cannot be
  // backfilled because their browser-only capability was never created.
  completionCapability: v.optional(string()),
});

export const vAccountDeletionRun = union(
  vQueuedAccountDeletionRun,
  vRunningAccountDeletionRun,
  vNeedsAttentionAccountDeletionRun,
  vScrubbedAccountDeletionRun,
);
