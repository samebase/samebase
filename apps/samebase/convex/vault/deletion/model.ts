import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { array, id, literal, number, object, optional, string, union } = v;

export const vVaultDeletionNotDeleting = object({
  state: literal("not_deleting"),
});

export const vVaultDeletionGate = union(
  object({
    state: literal("deleting"),
    runId: id("workflow_vaultDeletion_runs"),
    requestedAt: number(),
  }),
  object({
    state: literal("delete_failed"),
    runId: id("workflow_vaultDeletion_runs"),
    failedAt: number(),
  }),
);

export const vVaultDeletionState = union(vVaultDeletionNotDeleting, vVaultDeletionGate);
export type VaultDeletionState = Infer<typeof vVaultDeletionState>;

export const vVaultDeletionStep = union(
  literal("initialize_deletion"),
  literal("lock_vault"),
  literal("delete_cloudflare"),
  literal("delete_convex"),
  literal("delete_github_repo"),
  literal("cleanup_editor_state"),
  literal("cleanup_source_caches"),
  literal("cleanup_runtime_state"),
  literal("cleanup_provisioning_history"),
  literal("delete_vault"),
  literal("finish"),
);
export type VaultDeletionStep = Infer<typeof vVaultDeletionStep>;

export const vVaultDeletionCleanupStep = union(
  literal("cleanup_editor_state"),
  literal("cleanup_source_caches"),
  literal("cleanup_runtime_state"),
  literal("cleanup_provisioning_history"),
);
export type VaultDeletionCleanupStep = Infer<typeof vVaultDeletionCleanupStep>;

export const vVaultDeletionEventLevel = union(
  literal("info"),
  literal("warning"),
  literal("error"),
);
export type VaultDeletionEventLevel = Infer<typeof vVaultDeletionEventLevel>;

const skipNotRequested = object({
  action: literal("skip"),
  reason: literal("not_requested"),
});

const githubRepositoryCoordinates = {
  ghRepoId: string(),
  owner: string(),
  name: string(),
  repositoryFullName: string(),
} as const;

const repositorySetupCoordinates = {
  owner: string(),
  name: string(),
  repositoryFullName: string(),
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
      action: literal("delete_project"),
      teamId: string(),
      projectId: string(),
    }),
    object({
      action: literal("delete_projects"),
      teamId: string(),
      projectIds: array(string()),
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
      action: literal("delete_worker"),
      accountId: string(),
      workerName: string(),
      workerTag: string(),
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

export const vVaultDeletionPlan = union(
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
        ghRepoId: string(),
        owner: string(),
        name: string(),
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
export type VaultDeletionPlan = Infer<typeof vVaultDeletionPlan>;

export const vVaultDeletionRetainedSnapshot = object({
  state: literal("retained_for_retry"),
  plan: vVaultDeletionPlan,
});
export type VaultDeletionRetainedSnapshot = Infer<typeof vVaultDeletionRetainedSnapshot>;

export const vaultDeletionTables = {
  /**
   * One vault-deletion attempt, including its retained provider-cleanup plan,
   * background-workflow progress, outcome, and link to an earlier attempt.
   * Actor IDs are historical provenance only while the parent vault exists.
   * They can refer to a deleted user and must never authorize access.
   */
  workflow_vaultDeletion_runs: defineTable(
    union(
      object({
        state: literal("queued"),
        userId: id("users"),
        requestedByUserId: optional(id("users")),
        vaultId: id("vaults"),
        repositoryFullName: string(),
        createdAt: number(),
        updatedAt: number(),
        attempt: union(
          object({
            kind: literal("initial"),
          }),
          object({
            kind: literal("retry"),
            retryOf: id("workflow_vaultDeletion_runs"),
          }),
        ),
        workflow: object({
          state: literal("not_started"),
        }),
        currentStep: literal("initialize_deletion"),
        snapshot: vVaultDeletionRetainedSnapshot,
      }),
      object({
        state: literal("running"),
        userId: id("users"),
        requestedByUserId: optional(id("users")),
        vaultId: id("vaults"),
        repositoryFullName: string(),
        createdAt: number(),
        updatedAt: number(),
        attempt: union(
          object({
            kind: literal("initial"),
          }),
          object({
            kind: literal("retry"),
            retryOf: id("workflow_vaultDeletion_runs"),
          }),
        ),
        workflow: object({
          state: literal("started"),
          workflowId: string(),
        }),
        currentStep: vVaultDeletionStep,
        snapshot: vVaultDeletionRetainedSnapshot,
      }),
      object({
        state: literal("failed"),
        userId: id("users"),
        requestedByUserId: optional(id("users")),
        vaultId: id("vaults"),
        repositoryFullName: string(),
        createdAt: number(),
        updatedAt: number(),
        attempt: union(
          object({
            kind: literal("initial"),
          }),
          object({
            kind: literal("retry"),
            retryOf: id("workflow_vaultDeletion_runs"),
          }),
        ),
        workflow: union(
          object({
            state: literal("not_started"),
          }),
          object({
            state: literal("started"),
            workflowId: string(),
          }),
        ),
        currentStep: vVaultDeletionStep,
        snapshot: vVaultDeletionRetainedSnapshot,
        lastError: string(),
        completedAt: number(),
      }),
      object({
        state: literal("succeeded"),
        userId: id("users"),
        requestedByUserId: optional(id("users")),
        vaultId: id("vaults"),
        repositoryFullName: string(),
        createdAt: number(),
        updatedAt: number(),
        attempt: union(
          object({
            kind: literal("initial"),
          }),
          object({
            kind: literal("retry"),
            retryOf: id("workflow_vaultDeletion_runs"),
          }),
        ),
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
    .index("by_vault_and_updated_at", ["vaultId", "updatedAt"])
    .index("by_user_and_updated_at", ["userId", "updatedAt"])
    .index("by_user_and_state_and_updated_at", ["userId", "state", "updatedAt"])
    .index("by_workflow_id", ["workflow.workflowId"])
    .index("by_retry_of", ["attempt.retryOf"]),

  /**
   * Ordered user-visible progress messages for one vault-deletion run, without
   * provider payloads or credentials. The copied user ID is historical
   * provenance only while the parent vault exists.
   */
  workflow_vaultDeletion_events: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    runId: id("workflow_vaultDeletion_runs"),
    step: vVaultDeletionStep,
    level: vVaultDeletionEventLevel,
    message: string(),
    createdAt: number(),
  })
    .index("by_vault_and_created_at", ["vaultId", "createdAt"])
    .index("by_run_and_created_at", ["runId", "createdAt"]),
};
