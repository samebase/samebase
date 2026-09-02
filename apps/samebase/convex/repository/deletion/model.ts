import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vRepositoryEventSourceOrder } from "../eventOrderModel";

const { array, id, literal, number, object, string, union } = v;

export const vRepositoryDeletionNotDeleting = object({
  state: literal("not_deleting"),
});

export const vRepositoryDeletionGate = union(
  object({
    state: literal("deleting"),
    runId: id("workflow_repositoryDeletion_runs"),
    requestedAt: number(),
  }),
  object({
    state: literal("delete_failed"),
    runId: id("workflow_repositoryDeletion_runs"),
    failedAt: number(),
  }),
);

export const vRepositoryDeletionState = union(
  vRepositoryDeletionNotDeleting,
  vRepositoryDeletionGate,
);
export type RepositoryDeletionState = Infer<typeof vRepositoryDeletionState>;

export const vRepositoryDeletionStep = union(
  literal("initialize_deletion"),
  literal("lock_repository"),
  literal("delete_cloudflare"),
  literal("delete_convex"),
  literal("delete_github_repository"),
  literal("cleanup_editor_state"),
  literal("cleanup_source_caches"),
  literal("cleanup_runtime_state"),
  literal("cleanup_provisioning_history"),
  literal("remove_repository"),
  literal("finish"),
);
export type RepositoryDeletionStep = Infer<typeof vRepositoryDeletionStep>;

export const vRepositoryDeletionCleanupStep = union(
  literal("cleanup_editor_state"),
  literal("cleanup_source_caches"),
  literal("cleanup_runtime_state"),
  literal("cleanup_provisioning_history"),
);
export type RepositoryDeletionCleanupStep = Infer<typeof vRepositoryDeletionCleanupStep>;

export const vRepositoryDeletionEventLevel = union(
  literal("info"),
  literal("warning"),
  literal("error"),
);
export type RepositoryDeletionEventLevel = Infer<typeof vRepositoryDeletionEventLevel>;

const skipNotRequested = object({
  action: literal("skip"),
  reason: literal("not_requested"),
});

const githubRepositoryCoordinates = {
  githubRepositoryDatabaseId: string(),
  githubOwnerLogin: string(),
  githubRepositoryName: string(),
  githubRepositoryFullName: string(),
} as const;

const repositorySetupCoordinates = {
  githubOwnerLogin: string(),
  githubRepositoryName: string(),
  githubRepositoryFullName: string(),
} as const;

const providerCleanupPlan = {
  convex: union(
    object({
      action: literal("skip"),
      reason: union(
        literal("not_requested"),
        literal("not_managed"),
        literal("not_samebase_managed"),
        literal("not_recorded"),
      ),
    }),
    object({
      action: literal("delete_projects"),
      projects: array(
        object({
          teamId: string(),
          projectId: string(),
        }),
      ),
    }),
  ),
  cloudflare: union(
    object({
      action: literal("skip"),
      reason: union(
        literal("not_requested"),
        literal("not_managed"),
        literal("not_samebase_managed"),
        literal("not_recorded"),
      ),
    }),
    object({
      action: literal("delete_workers"),
      workers: array(
        object({
          accountId: string(),
          workerName: string(),
          workerTag: string(),
        }),
      ),
    }),
  ),
} as const;

export const vRepositoryDeletionPlan = union(
  object({
    target: object({
      kind: literal("samebase_managed_repository"),
      ...githubRepositoryCoordinates,
    }),
    ...providerCleanupPlan,
    githubRepository: union(
      skipNotRequested,
      object({
        action: literal("delete_repository"),
        githubRepositoryDatabaseId: string(),
        githubOwnerLogin: string(),
        githubRepositoryName: string(),
      }),
    ),
  }),
  object({
    target: object({
      kind: literal("existing_repository"),
      ...githubRepositoryCoordinates,
    }),
    ...providerCleanupPlan,
    githubRepository: object({
      action: literal("skip"),
      reason: union(literal("not_requested"), literal("not_samebase_managed")),
    }),
  }),
  object({
    target: object({
      kind: literal("failed_repository_setup"),
      githubMode: union(literal("create_repository"), literal("connect_existing_repository")),
      ...repositorySetupCoordinates,
    }),
    ...providerCleanupPlan,
    githubRepository: object({
      action: literal("skip"),
      reason: union(literal("not_requested"), literal("no_confirmed_identity")),
    }),
  }),
);
export type RepositoryDeletionPlan = Infer<typeof vRepositoryDeletionPlan>;

export const vRepositoryDeletionRetainedSnapshot = object({
  state: literal("retained_for_retry"),
  plan: vRepositoryDeletionPlan,
});
export type RepositoryDeletionRetainedSnapshot = Infer<typeof vRepositoryDeletionRetainedSnapshot>;

const initialAttempt = object({
  kind: literal("initial"),
});
const retryAttempt = object({
  kind: literal("retry"),
  retryOf: id("workflow_repositoryDeletion_runs"),
});
const repositoryDeletionAttempt = union(initialAttempt, retryAttempt);

const repositoryDeletionRunBase = {
  organizationId: id("organizations"),
  userId: id("users"),
  repositoryId: id("repositories"),
  githubRepositoryFullName: string(),
  createdAt: number(),
  updatedAt: number(),
  attempt: repositoryDeletionAttempt,
} as const;

export const repositoryDeletionTables = {
  /**
   * One repository-removal attempt, including its retained provider cleanup
   * plan, background-workflow progress, outcome, and earlier attempt.
   */
  workflow_repositoryDeletion_runs: defineTable(
    union(
      object({
        state: literal("queued"),
        ...repositoryDeletionRunBase,
        workflow: object({
          state: literal("not_started"),
        }),
        currentStep: literal("initialize_deletion"),
        snapshot: vRepositoryDeletionRetainedSnapshot,
      }),
      object({
        state: literal("running"),
        ...repositoryDeletionRunBase,
        workflow: object({
          state: literal("started"),
          workflowId: string(),
        }),
        currentStep: vRepositoryDeletionStep,
        snapshot: vRepositoryDeletionRetainedSnapshot,
      }),
      object({
        state: literal("failed"),
        ...repositoryDeletionRunBase,
        workflow: union(
          object({
            state: literal("not_started"),
          }),
          object({
            state: literal("started"),
            workflowId: string(),
          }),
        ),
        currentStep: vRepositoryDeletionStep,
        snapshot: vRepositoryDeletionRetainedSnapshot,
        lastError: string(),
        completedAt: number(),
      }),
      object({
        state: literal("succeeded"),
        ...repositoryDeletionRunBase,
        workflow: object({
          state: literal("started"),
          workflowId: string(),
        }),
        currentStep: literal("finish"),
        snapshot: object({
          state: literal("scrubbed_after_success"),
        }),
        completedAt: number(),
      }),
    ),
  )
    .index("by_state", ["state"])
    .index("by_repository_and_updated_at", ["repositoryId", "updatedAt"])
    .index("by_organization_and_updated_at", ["organizationId", "updatedAt"])
    .index("by_organization_and_state_and_updated_at", ["organizationId", "state", "updatedAt"])
    .index("by_organization_and_user_and_state_and_updated_at", [
      "organizationId",
      "userId",
      "state",
      "updatedAt",
    ])
    .index("by_user_and_state_and_updated_at", ["userId", "state", "updatedAt"])
    .index("by_workflow_id", ["workflow.workflowId"])
    .index("by_retry_of", ["attempt.retryOf"]),

  /** Ordered user-visible messages for one repository-removal run. */
  workflow_repositoryDeletion_events: defineTable({
    organizationId: id("organizations"),
    userId: id("users"),
    repositoryId: id("repositories"),
    githubRepositoryFullName: string(),
    runId: id("workflow_repositoryDeletion_runs"),
    step: vRepositoryDeletionStep,
    level: vRepositoryDeletionEventLevel,
    message: string(),
    createdAt: number(),
    sourceOrder: vRepositoryEventSourceOrder,
  })
    .index("by_organization_and_created_at_and_source_order", [
      "organizationId",
      "createdAt",
      "sourceOrder.creationTime",
      "sourceOrder.documentId",
    ])
    .index("by_repository_and_created_at_and_source_order", [
      "repositoryId",
      "createdAt",
      "sourceOrder.creationTime",
      "sourceOrder.documentId",
    ])
    .index("by_run_and_created_at_and_source_order", [
      "runId",
      "createdAt",
      "sourceOrder.creationTime",
      "sourceOrder.documentId",
    ]),
};
