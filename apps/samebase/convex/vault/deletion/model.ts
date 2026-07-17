import { Infer, v } from "convex/values";
import { vConvexDeployKeys } from "../deployKeyModel";

const { array, id, literal, number, object, string, union } = v;

export const vVaultDeletionNotDeleting = object({
  state: literal("not_deleting"),
});
export type VaultDeletionNotDeleting = Infer<typeof vVaultDeletionNotDeleting>;

export const vVaultDeletionGate = union(
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
export type VaultDeletionGate = Infer<typeof vVaultDeletionGate>;

export const vVaultDeletionState = union(vVaultDeletionNotDeleting, vVaultDeletionGate);
export type VaultDeletionState = Infer<typeof vVaultDeletionState>;

export const vVaultDeletionStep = union(
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
export type VaultDeletionStep = Infer<typeof vVaultDeletionStep>;

export const vVaultDeletionCleanupStep = union(
  literal("cleanup_editor_state"),
  literal("cleanup_source_caches"),
  literal("cleanup_runtime_state"),
  literal("cleanup_access_state"),
  literal("detach_agent_context"),
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
  codespaces: union(
    skipNotRequested,
    object({
      action: literal("skip"),
      reason: literal("feature_disabled"),
    }),
    object({
      action: literal("delete_connected_codespaces"),
    }),
  ),
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
      projectId: string(),
    }),
    object({
      action: literal("delete_projects"),
      projectIds: array(string()),
    }),
    object({
      action: literal("delete_deployment"),
      deploymentName: string(),
    }),
  ),
  convexDependencyDeployKeys: union(
    object({
      action: literal("skip"),
      reason: literal("not_recorded"),
    }),
    object({
      action: literal("revoke"),
      dependencies: array(
        object({
          dependencyId: string(),
          deployKeys: vConvexDeployKeys,
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
  cloudflareBuildTriggers: union(
    object({
      action: literal("skip"),
      reason: literal("not_recorded"),
    }),
    object({
      action: literal("detach"),
      workers: array(
        object({
          accountId: string(),
          workerTag: string(),
        }),
      ),
    }),
  ),
} as const;

export const vVaultDeletionPlan = union(
  object({
    ...providerCleanupPlan,
    target: object({
      kind: literal("samebase_managed_repository"),
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
      reason: union(literal("not_requested"), literal("not_samebase_managed")),
    }),
  }),
  object({
    ...providerCleanupPlan,
    target: object({
      kind: literal("failed_repository_setup"),
      githubMode: union(literal("create_repository"), literal("connect_existing_repository")),
      ...repositorySetupCoordinates,
    }),
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

export const vVaultDeletionSnapshot = union(
  vVaultDeletionRetainedSnapshot,
  object({
    state: literal("scrubbed_after_success"),
  }),
);
export type VaultDeletionSnapshot = Infer<typeof vVaultDeletionSnapshot>;

const vaultDeletionRunBase = {
  userId: id("users"),
  vaultId: id("vaults"),
  repositoryFullName: string(),
  createdAt: number(),
  updatedAt: number(),
} as const;

export const vVaultDeletionAttempt = union(
  object({
    kind: literal("initial"),
  }),
  object({
    kind: literal("retry"),
    retryOf: id("vaultDeletionRuns"),
  }),
);
export type VaultDeletionAttempt = Infer<typeof vVaultDeletionAttempt>;

export const vVaultDeletionWorkflowNotStarted = object({
  state: literal("not_started"),
});
export const vVaultDeletionWorkflowStarted = object({
  state: literal("started"),
  workflowId: string(),
});
export const vVaultDeletionWorkflowRef = union(
  vVaultDeletionWorkflowNotStarted,
  vVaultDeletionWorkflowStarted,
);
export type VaultDeletionWorkflowRef = Infer<typeof vVaultDeletionWorkflowRef>;

export const vVaultDeletionRun = union(
  object({
    ...vaultDeletionRunBase,
    attempt: vVaultDeletionAttempt,
    state: literal("queued"),
    workflow: vVaultDeletionWorkflowNotStarted,
    currentStep: literal("initialize_deletion"),
    snapshot: vVaultDeletionRetainedSnapshot,
  }),
  object({
    ...vaultDeletionRunBase,
    attempt: vVaultDeletionAttempt,
    state: literal("running"),
    workflow: vVaultDeletionWorkflowStarted,
    currentStep: vVaultDeletionStep,
    snapshot: vVaultDeletionRetainedSnapshot,
  }),
  object({
    ...vaultDeletionRunBase,
    attempt: vVaultDeletionAttempt,
    state: literal("failed"),
    workflow: vVaultDeletionWorkflowRef,
    currentStep: vVaultDeletionStep,
    snapshot: vVaultDeletionRetainedSnapshot,
    lastError: string(),
    completedAt: number(),
  }),
  object({
    ...vaultDeletionRunBase,
    attempt: vVaultDeletionAttempt,
    state: literal("succeeded"),
    workflow: vVaultDeletionWorkflowStarted,
    currentStep: literal("finish"),
    snapshot: object({
      state: literal("scrubbed_after_success"),
    }),
    completedAt: number(),
  }),
);
export type VaultDeletionRun = Infer<typeof vVaultDeletionRun>;
