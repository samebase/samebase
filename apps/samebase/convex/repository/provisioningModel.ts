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
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
  literal("finish"),
);
export type RepositoryProvisioningRunStep = Infer<typeof vRepositoryProvisioningRunStep>;

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

export const repositoryProvisioningTables = {
  /** Exact provider-resource choices for one repository. */
  workflow_repositoryProvisioning_plans: defineTable({
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
  }).index("by_repository", ["repositoryId"]),

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
