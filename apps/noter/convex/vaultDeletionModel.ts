import { Infer, v } from "convex/values";

const { id, literal, number, object, string, union } = v;

export const VaultDeletionNotDeleting = object({
  state: literal("not_deleting"),
});
export type VaultDeletionNotDeleting = Infer<typeof VaultDeletionNotDeleting>;

export const VaultDeletionGate = union(
  object({
    state: literal("deleting"),
    runId: id("vaultDeletionRuns"),
    requestedAt: number(),
  }),
  object({
    state: literal("delete_failed"),
    runId: id("vaultDeletionRuns"),
    failedAt: number(),
  }),
);
export type VaultDeletionGate = Infer<typeof VaultDeletionGate>;

export const VaultDeletionState = union(
  VaultDeletionNotDeleting,
  VaultDeletionGate,
);
export type VaultDeletionState = Infer<typeof VaultDeletionState>;

export const VaultDeletionStep = union(
  literal("initialize_deletion"),
  literal("lock_vault"),
  literal("delete_codespaces"),
  literal("delete_cloudflare"),
  literal("delete_convex"),
  literal("delete_github_repo"),
  literal("cleanup_editor_state"),
  literal("cleanup_source_caches"),
  literal("cleanup_runtime_state"),
  literal("cleanup_access_state"),
  literal("detach_agent_context"),
  literal("cleanup_provisioning_history"),
  literal("delete_vault"),
  literal("finish"),
);
export type VaultDeletionStep = Infer<typeof VaultDeletionStep>;

export const VaultDeletionCleanupStep = union(
  literal("cleanup_editor_state"),
  literal("cleanup_source_caches"),
  literal("cleanup_runtime_state"),
  literal("cleanup_access_state"),
  literal("detach_agent_context"),
  literal("cleanup_provisioning_history"),
);
export type VaultDeletionCleanupStep = Infer<typeof VaultDeletionCleanupStep>;

export const VaultDeletionEventLevel = union(
  literal("info"),
  literal("warning"),
  literal("error"),
);
export type VaultDeletionEventLevel = Infer<typeof VaultDeletionEventLevel>;

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
  codespaces: union(
    skipNotRequested,
    object({
      action: literal("delete_connected_codespaces"),
    }),
  ),
  convex: union(
    object({
      action: literal("skip"),
      reason: union(
        literal("not_requested"),
        literal("not_noter_managed"),
        literal("not_recorded"),
      ),
    }),
    object({
      action: literal("delete_project"),
      projectId: string(),
    }),
    object({
      action: literal("delete_deployment"),
      deploymentName: string(),
    }),
  ),
  cloudflare: union(
    object({
      action: literal("skip"),
      reason: union(
        literal("not_requested"),
        literal("not_noter_managed"),
        literal("not_recorded"),
      ),
    }),
    object({
      action: literal("delete_pages_project"),
      accountId: string(),
      projectName: string(),
    }),
  ),
} as const;

export const VaultDeletionPlan = union(
  object({
    ...providerCleanupPlan,
    target: object({
      kind: literal("noter_managed_repository"),
      ...githubRepositoryCoordinates,
    }),
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
    ...providerCleanupPlan,
    target: object({
      kind: literal("existing_repository"),
      ...githubRepositoryCoordinates,
    }),
    githubRepository: object({
      action: literal("skip"),
      reason: union(literal("not_requested"), literal("not_noter_managed")),
    }),
  }),
  object({
    ...providerCleanupPlan,
    target: object({
      kind: literal("failed_repository_setup"),
      githubMode: union(
        literal("create_repository"),
        literal("connect_existing_repository"),
      ),
      ...repositorySetupCoordinates,
    }),
    githubRepository: object({
      action: literal("skip"),
      reason: union(literal("not_requested"), literal("no_confirmed_identity")),
    }),
  }),
);
export type VaultDeletionPlan = Infer<typeof VaultDeletionPlan>;

export const VaultDeletionRetainedSnapshot = object({
  state: literal("retained_for_retry"),
  plan: VaultDeletionPlan,
});
export type VaultDeletionRetainedSnapshot = Infer<
  typeof VaultDeletionRetainedSnapshot
>;

export const VaultDeletionSnapshot = union(
  VaultDeletionRetainedSnapshot,
  object({
    state: literal("scrubbed_after_success"),
  }),
);
export type VaultDeletionSnapshot = Infer<typeof VaultDeletionSnapshot>;

const vaultDeletionRunBase = {
  userId: id("users"),
  vaultId: id("vaults"),
  repositoryFullName: string(),
  createdAt: number(),
  updatedAt: number(),
} as const;

export const VaultDeletionAttempt = union(
  object({
    kind: literal("initial"),
  }),
  object({
    kind: literal("retry"),
    retryOf: id("vaultDeletionRuns"),
  }),
);
export type VaultDeletionAttempt = Infer<typeof VaultDeletionAttempt>;

export const VaultDeletionWorkflowNotStarted = object({
  state: literal("not_started"),
});
export const VaultDeletionWorkflowStarted = object({
  state: literal("started"),
  workflowId: string(),
});
export const VaultDeletionWorkflowRef = union(
  VaultDeletionWorkflowNotStarted,
  VaultDeletionWorkflowStarted,
);
export type VaultDeletionWorkflowRef = Infer<typeof VaultDeletionWorkflowRef>;

export const VaultDeletionRun = union(
  object({
    ...vaultDeletionRunBase,
    attempt: VaultDeletionAttempt,
    state: literal("queued"),
    workflow: VaultDeletionWorkflowNotStarted,
    currentStep: literal("initialize_deletion"),
    snapshot: VaultDeletionRetainedSnapshot,
  }),
  object({
    ...vaultDeletionRunBase,
    attempt: VaultDeletionAttempt,
    state: literal("running"),
    workflow: VaultDeletionWorkflowStarted,
    currentStep: VaultDeletionStep,
    snapshot: VaultDeletionRetainedSnapshot,
  }),
  object({
    ...vaultDeletionRunBase,
    attempt: VaultDeletionAttempt,
    state: literal("failed"),
    workflow: VaultDeletionWorkflowRef,
    currentStep: VaultDeletionStep,
    snapshot: VaultDeletionRetainedSnapshot,
    lastError: string(),
    completedAt: number(),
  }),
  object({
    ...vaultDeletionRunBase,
    attempt: VaultDeletionAttempt,
    state: literal("succeeded"),
    workflow: VaultDeletionWorkflowStarted,
    currentStep: literal("finish"),
    snapshot: object({
      state: literal("scrubbed_after_success"),
    }),
    completedAt: number(),
  }),
);
export type VaultDeletionRun = Infer<typeof VaultDeletionRun>;
