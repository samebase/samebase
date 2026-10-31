import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vConvexDeploymentRegion } from "../convexDeploymentRegionModel";
import { vRepositoryEventSourceOrder } from "./eventOrderModel";

const { id, literal, number, object, optional, string, union } = v;

export const vRepositoryProvisioningEventLevel = union(
  literal("info"),
  literal("warn"),
  literal("error"),
);
export type RepositoryProvisioningEventLevel = Infer<typeof vRepositoryProvisioningEventLevel>;

export const vRepositoryProvisioningStep = union(
  literal("initialize_repository"),
  literal("validate_connections"),
  literal("create_github_repository"),
  literal("fetch_github_repository"),
  literal("seed_starter"),
  literal("connect_github_repository"),
  literal("sync_tree"),
  literal("write_actions_secrets"),
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
  literal("finish"),
);
export type RepositoryProvisioningStep = Infer<typeof vRepositoryProvisioningStep>;

export const vRepositoryProvisioningRunStep = union(
  literal("run_created"),
  literal("initialize_repository"),
  literal("validate_connections"),
  literal("create_github_repository"),
  literal("fetch_github_repository"),
  literal("seed_starter"),
  literal("connect_github_repository"),
  literal("sync_tree"),
  literal("write_actions_secrets"),
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
  literal("finish"),
);
export type RepositoryProvisioningRunStep = Infer<typeof vRepositoryProvisioningRunStep>;

/**
Provider steps run after the GitHub repository is connected, so a managed setup that fails in one of
them can be retried. `write_actions_secrets` is the repository_actions mode's provider step: it runs
after `connect_github_repository` and before `seed_starter`.
*/
export function isRepositoryProvisioningProviderStep(step: RepositoryProvisioningRunStep): boolean {
  switch (step) {
    case "run_created":
    case "initialize_repository":
    case "validate_connections":
    case "create_github_repository":
    case "fetch_github_repository":
    case "seed_starter":
    case "connect_github_repository":
    case "sync_tree":
      return false;
    case "write_actions_secrets":
    case "claim_infra":
    case "attach_convex":
    case "attach_worker":
    case "configure_workers_builds_for_github":
    case "rotate_convex_deploy_keys_for_workers_builds":
    case "finish":
      return true;
    default:
      step satisfies never;
      throw new Error("Unknown repository provisioning step.");
  }
}

/**
samebase = Samebase's workflow creates the Convex project and the Worker and configures Workers Builds

repository_actions = the repository's alchemy workflow creates the Convex project and deploys the
app to Convex; Samebase writes the workflow's secret and variable
*/
export const vRepositoryProvisioningMode = union(
  literal("samebase"),
  literal("repository_actions"),
);
export type RepositoryProvisioningMode = Infer<typeof vRepositoryProvisioningMode>;

export const vRepositoryProvisioningRunTrigger = union(
  literal("create"),
  literal("connect_existing_repository"),
  literal("retry"),
);
export type RepositoryProvisioningRunTrigger = Infer<typeof vRepositoryProvisioningRunTrigger>;

export const vRepositoryProvisioningRunState = union(
  literal("queued"),
  literal("running"),
  literal("succeeded"),
  literal("failed"),
  literal("canceled"),
);
export type RepositoryProvisioningRunState = Infer<typeof vRepositoryProvisioningRunState>;

export const vRepositoryProviderWriteTimes = object({
  convex: optional(number()),
  cloudflare: optional(number()),
});
export type RepositoryProviderWriteTimes = Infer<typeof vRepositoryProviderWriteTimes>;

export const vRepositoryManualProviderWriteAction = union(
  literal("create_convex_project"),
  literal("connect_cloudflare_worker"),
  literal("create_cloudflare_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
);
export type RepositoryManualProviderWriteAction = Infer<
  typeof vRepositoryManualProviderWriteAction
>;

const repositoryProviderWriteBase = {
  repositoryId: id("repositories"),
  lastWriteAt: vRepositoryProviderWriteTimes,
  updatedAt: number(),
} as const;

const manualProviderWriteOwner = {
  kind: literal("manual_provider_write"),
  userId: id("users"),
  actionId: string(),
  action: vRepositoryManualProviderWriteAction,
  expiresAt: number(),
} as const;

const vSamebaseProvisioningPlan = object({
  repositoryId: id("repositories"),
  convexConfigPath: string(),
  convex: union(
    object({
      state: literal("planned"),
      projectName: string(),
      deploymentRegion: vConvexDeploymentRegion,
    }),
    object({
      state: literal("creating"),
      projectName: string(),
      deploymentRegion: vConvexDeploymentRegion,
    }),
    object({
      state: literal("created"),
      projectName: string(),
      deploymentRegion: vConvexDeploymentRegion,
      projectId: string(),
    }),
  ),
  cloudflare: union(
    object({
      state: literal("planned"),
      workerName: string(),
      rootDirectory: string(),
      buildTokenUuid: union(string(), v.null()),
    }),
    object({
      state: literal("creating"),
      workerName: string(),
      rootDirectory: string(),
      buildTokenUuid: string(),
    }),
    object({
      state: literal("created"),
      workerName: string(),
      workerTag: string(),
      rootDirectory: string(),
      buildTokenUuid: string(),
    }),
  ),
  createdAt: number(),
  updatedAt: number(),
});

/**
The Actions secret of one repository_actions repository. `credentialRevision` is the `updatedAt` of
the organization's Convex connection that was written, so a later reconnect can find the
repositories that still hold an older credential.
*/
export const vRepositoryActionsCiSecrets = union(
  object({ state: literal("planned") }),
  object({ state: literal("written"), writtenAt: number(), credentialRevision: number() }),
);
export type RepositoryActionsCiSecrets = Infer<typeof vRepositoryActionsCiSecrets>;

/**
The branch a repository_actions repository is seeded on and set as its GitHub default branch: the
template's alchemy workflow deploys the `prod` stage on each push to main.
*/
export const REPOSITORY_ACTIONS_DEFAULT_BRANCH = "main";

/**
The starter seed of one repository_actions repository. The starter goes onto main's bootstrap commit
as a fast-forward, and once the seed is `seeded` no retry seeds again. `seeding` records the starter
tree right before the push, because GitHub can accept the push although the step stops before it
records `seeded`; a retry then finds that tree on main.
*/
export const vRepositoryActionsSeed = union(
  object({ state: literal("planned") }),
  object({ state: literal("seeding"), manifestVersion: string(), treeSha: string() }),
  object({ state: literal("seeded"), seededAt: number(), manifestVersion: string() }),
);

/**
The setup output that Samebase last applied: the artifact `samebase-setup-output` of one workflow run
on the repository's default branch (scripts/setup-output.ts of samebase/base-actions). `artifactId` is
the change key: a rerun publishes the same content under a new artifact id. `artifactCreatedAt`
orders outputs, so an older one is never applied over it. The run's ids keep this readable after
GitHub deletes the run at the end of its retention period.

applied = the Workers and Convex projects of a `deployed` output are attached with origin
setup_stack

destroy_reported = the confirmed destroy of the app reported itself; the attachments stay until a
member removes them

An absent field means that no setup output was applied yet.
*/
export const vRepositoryActionsSetupOutput = union(
  object({
    state: literal("applied"),
    runId: number(),
    runAttempt: number(),
    artifactId: number(),
    artifactCreatedAt: string(),
    outputVersion: literal(1),
    appliedAt: number(),
  }),
  object({
    state: literal("destroy_reported"),
    runId: number(),
    runAttempt: number(),
    artifactId: number(),
    artifactCreatedAt: string(),
    reportedAt: number(),
  }),
);
export type RepositoryActionsSetupOutput = Infer<typeof vRepositoryActionsSetupOutput>;

/**
The last automatic apply of a setup output that failed in the apply transaction, such as on the
organization connection quota: observeFirstSetupOutput records its reason, and the next successful
apply removes it. An absent field means that no automatic apply failed since the last success.
*/
export const vRepositoryActionsSetupOutputApplyFailure = object({
  reason: string(),
  failedAt: number(),
});

const vRepositoryActionsProvisioningPlan = object({
  provisioning: literal("repository_actions"),
  repositoryId: id("repositories"),
  convexConfigPath: string(),
  ciSecrets: vRepositoryActionsCiSecrets,
  seed: vRepositoryActionsSeed,
  setupOutput: optional(vRepositoryActionsSetupOutput),
  setupOutputApplyFailure: optional(vRepositoryActionsSetupOutputApplyFailure),
  createdAt: number(),
  updatedAt: number(),
});

export const repositoryProvisioningTables = {
  /**
  One repository's provisioning choices. The samebase variant (no `provisioning` field) holds the
  exact Convex project and Worker that Samebase's workflow creates. The repository_actions variant
  holds no provider choice: the repository's alchemy workflow creates the Convex project and deploys
  the app, and Samebase writes the workflow's secret and variable. Read the mode with
  `readRepositoryProvisioningMode`.
  */
  workflow_repositoryProvisioning_plans: defineTable(
    union(vSamebaseProvisioningPlan, vRepositoryActionsProvisioningPlan),
  ).index("by_repository", ["repositoryId"]),

  /** Current or most recent provider write for one repository. */
  workflow_repositoryProvisioning_writeLocks: defineTable(
    union(
      object({
        ...repositoryProviderWriteBase,
        owner: object({
          kind: literal("managed_run"),
          runId: id("workflow_repositoryProvisioning_runs"),
        }),
        state: union(literal("active"), literal("succeeded"), literal("failed")),
      }),
      object({
        ...repositoryProviderWriteBase,
        owner: object(manualProviderWriteOwner),
        state: union(literal("active"), literal("succeeded"), literal("failed")),
      }),
    ),
  )
    .index("by_repository", ["repositoryId"])
    .index("by_state", ["state"])
    .index("by_manual_user_and_state", ["owner.userId", "state"]),

  /** One managed attempt to create, connect, or retry a repository. */
  workflow_repositoryProvisioning_runs: defineTable({
    organizationId: id("organizations"),
    userId: id("users"),
    repositoryId: id("repositories"),
    githubRepositoryFullName: string(),
    workflowId: optional(string()),
    trigger: vRepositoryProvisioningRunTrigger,
    state: vRepositoryProvisioningRunState,
    currentStep: vRepositoryProvisioningRunStep,
    lastError: optional(string()),
    createdAt: number(),
    updatedAt: number(),
    completedAt: optional(number()),
  })
    .index("by_organization_and_user_and_state_and_updated_at", [
      "organizationId",
      "userId",
      "state",
      "updatedAt",
    ])
    .index("by_state", ["state"])
    .index("by_repository_and_updated_at", ["repositoryId", "updatedAt"])
    .index("by_repository_and_state", ["repositoryId", "state"])
    .index("by_user_and_state_and_updated_at", ["userId", "state", "updatedAt"])
    .index("by_workflow_id", ["workflowId"]),

  /** Ordered user-visible messages for one repository-provisioning run. */
  workflow_repositoryProvisioning_events: defineTable({
    userId: id("users"),
    repositoryId: id("repositories"),
    githubRepositoryFullName: string(),
    runId: id("workflow_repositoryProvisioning_runs"),
    step: vRepositoryProvisioningStep,
    level: vRepositoryProvisioningEventLevel,
    message: string(),
    createdAt: number(),
    sourceOrder: vRepositoryEventSourceOrder,
  })
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
