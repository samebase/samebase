import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { id, literal, number, object, string, union } = v;

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

const vAccountDeletionDataGroupNotStarted = object({
  state: literal("not_started"),
});

const vAccountDeletionDataGroupInProgress = object({
  state: literal("in_progress"),
  startedAt: number(),
  updatedAt: number(),
});

const vAccountDeletionDataGroupCompleted = object({
  state: literal("completed"),
  startedAt: number(),
  completedAt: number(),
});

export const vAccountDeletionDataGroupProgress = union(
  vAccountDeletionDataGroupNotStarted,
  vAccountDeletionDataGroupInProgress,
  vAccountDeletionDataGroupCompleted,
);

export const vAccountDeletionVaultCleanupPhase = union(
  literal("staged_changes"),
  literal("vault_data"),
  literal("source_data"),
  literal("app_data"),
  literal("access_state"),
  literal("provisioning_history"),
);
export type AccountDeletionVaultCleanupPhase = Infer<typeof vAccountDeletionVaultCleanupPhase>;

const vAccountDeletionVaultsNotStarted = object({
  state: literal("not_started"),
});

const vAccountDeletionVaultsInProgress = object({
  state: literal("in_progress"),
  startedAt: number(),
  updatedAt: number(),
  deletedVaultCount: number(),
  currentVaultPhase: vAccountDeletionVaultCleanupPhase,
});

const vAccountDeletionVaultsCompleted = object({
  state: literal("completed"),
  startedAt: number(),
  completedAt: number(),
  deletedVaultCount: number(),
  currentVaultPhase: v.null(),
});

export const vAccountDeletionDataProgress = object({
  chatsAndAgentData: vAccountDeletionDataGroupProgress,
  vaultsAndStagedChanges: union(
    vAccountDeletionVaultsNotStarted,
    vAccountDeletionVaultsInProgress,
    vAccountDeletionVaultsCompleted,
  ),
  connectedMachines: vAccountDeletionDataGroupProgress,
  preferences: vAccountDeletionDataGroupProgress,
  appAccessAndTokens: vAccountDeletionDataGroupProgress,
  accessRequestsAndHistory: vAccountDeletionDataGroupProgress,
});
export type AccountDeletionDataProgress = Infer<typeof vAccountDeletionDataProgress>;

export const INITIAL_ACCOUNT_DELETION_DATA_PROGRESS = {
  chatsAndAgentData: { state: "not_started" },
  vaultsAndStagedChanges: { state: "not_started" },
  connectedMachines: { state: "not_started" },
  preferences: { state: "not_started" },
  appAccessAndTokens: { state: "not_started" },
  accessRequestsAndHistory: { state: "not_started" },
} as const satisfies AccountDeletionDataProgress;

export const accountDeletionTables = {
  /** Active account deletion operations and scrubbed completion receipts. */
  operations_accountDeletionRuns: defineTable(
    union(
      object({
        state: literal("queued"),
        identity: object({
          state: literal("active"),
          userId: id("users"),
          email: string(),
        }),
        completionCapability: string(),
        currentStep: vAccountDeletionStep,
        requestedAt: number(),
        updatedAt: number(),
        initiatingSessionId: id("authSessions"),
        retryCount: number(),
        outcomes: vAccountDeletionOutcomeSummary,
        // Active runs created before durable data progress shipped remain readable
        // and finish through the legacy cleanup path.
        dataDeletion: v.optional(vAccountDeletionDataProgress),
        workflow: object({
          state: literal("not_started"),
        }),
      }),
      object({
        state: literal("running"),
        identity: object({
          state: literal("active"),
          userId: id("users"),
          email: string(),
        }),
        completionCapability: string(),
        currentStep: vAccountDeletionStep,
        requestedAt: number(),
        updatedAt: number(),
        initiatingSessionId: id("authSessions"),
        retryCount: number(),
        outcomes: vAccountDeletionOutcomeSummary,
        dataDeletion: v.optional(vAccountDeletionDataProgress),
        workflow: object({
          state: literal("started"),
          workflowId: string(),
          attempt: number(),
        }),
      }),
      object({
        state: literal("needs_attention"),
        identity: object({
          state: literal("active"),
          userId: id("users"),
          email: string(),
        }),
        completionCapability: string(),
        currentStep: vAccountDeletionStep,
        requestedAt: number(),
        updatedAt: number(),
        initiatingSessionId: id("authSessions"),
        retryCount: number(),
        outcomes: vAccountDeletionOutcomeSummary,
        dataDeletion: v.optional(vAccountDeletionDataProgress),
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
        currentStep: literal("finish"),
        requestedAt: number(),
        updatedAt: number(),
        retryCount: number(),
        completedAt: number(),
        outcomes: vAccountDeletionOutcomeSummary,
        // Receipts completed before public completion tracking shipped cannot be
        // backfilled because their browser-only capability was never created.
        completionCapability: v.optional(string()),
      }),
    ),
  )
    .index("by_completion_capability", ["completionCapability"])
    .index("by_updated_at", ["updatedAt"]),

  /** Ordered identity-free progress messages for one account-deletion run. */
  operations_accountDeletionEvents: defineTable({
    runId: id("operations_accountDeletionRuns"),
    step: vAccountDeletionStep,
    level: vAccountDeletionEventLevel,
    message: string(),
    createdAt: number(),
  }).index("by_run_and_created_at", ["runId", "createdAt"]),
};
