import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { id, literal, number, object, optional, string, union } = v;

export const vAppProvisioningEventLevel = union(literal("info"), literal("warn"), literal("error"));
export type AppProvisioningEventLevel = Infer<typeof vAppProvisioningEventLevel>;

export const vAppProvisioningStep = union(
  literal("initialize_vault"),
  literal("validate_connections"),
  literal("create_github_repo"),
  literal("fetch_github_repo"),
  literal("seed_starter"),
  literal("connect_github"),
  literal("sync_tree"),
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
  literal("finish"),
);
export type AppProvisioningStep = Infer<typeof vAppProvisioningStep>;

export const vAppProvisioningRunStep = union(
  literal("run_created"),
  literal("initialize_vault"),
  literal("validate_connections"),
  literal("create_github_repo"),
  literal("fetch_github_repo"),
  literal("seed_starter"),
  literal("connect_github"),
  literal("sync_tree"),
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
  literal("finish"),
);
export type AppProvisioningRunStep = Infer<typeof vAppProvisioningRunStep>;

export function isAppProvisioningProviderStep(step: AppProvisioningRunStep): boolean {
  switch (step) {
    case "run_created":
    case "initialize_vault":
    case "validate_connections":
    case "create_github_repo":
    case "fetch_github_repo":
    case "seed_starter":
    case "connect_github":
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
      throw new Error("Unknown app provisioning step.");
  }
}

export const vAppProvisioningRunTrigger = union(
  literal("create"),
  literal("connect_existing_repository"),
  literal("retry"),
);
export type AppProvisioningRunTrigger = Infer<typeof vAppProvisioningRunTrigger>;

export const vAppProvisioningRunState = union(
  literal("queued"),
  literal("running"),
  literal("succeeded"),
  literal("failed"),
  literal("canceled"),
);
export type AppProvisioningRunState = Infer<typeof vAppProvisioningRunState>;

export const vVaultProviderWriteTimes = object({
  convex: optional(number()),
  cloudflare: optional(number()),
});
export type VaultProviderWriteTimes = Infer<typeof vVaultProviderWriteTimes>;

export const vManualProviderWriteAction = union(
  literal("create_convex_project"),
  literal("connect_cloudflare_worker"),
  literal("create_cloudflare_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
);
export type ManualProviderWriteAction = Infer<typeof vManualProviderWriteAction>;

const vaultProviderWriteBase = {
  vaultId: id("vaults"),
  lastWriteAt: vVaultProviderWriteTimes,
  updatedAt: number(),
};

const manualProviderWriteOwner = {
  kind: literal("manual_provider_write"),
  userId: id("users"),
  actionId: string(),
  action: vManualProviderWriteAction,
  expiresAt: number(),
};

export const vaultProvisioningTables = {
  /**
   * The exact Convex project and Cloudflare Worker choices for one vault.
   * Retries read this row so every attempt uses the same provider names,
   * Convex config path, and Worker root directory. The vault stores the exact
   * Convex team and Cloudflare account.
   * `created` variants preserve identities returned by earlier provider-creation
   * checkpoints. Recording a `created` checkpoint and its stable resource
   * attachment is one database transaction.
   */
  workflow_vaultProvisioning_plans: defineTable({
    vaultId: id("vaults"),
    convexConfigPath: string(),
    convex: union(
      object({
        state: literal("planned"),
        projectName: string(),
      }),
      object({
        state: literal("creating"),
        projectName: string(),
      }),
      object({
        state: literal("created"),
        projectName: string(),
        projectId: string(),
      }),
    ),
    cloudflare: union(
      object({
        state: literal("planned"),
        workerName: string(),
        rootDirectory: string(),
      }),
      object({
        state: literal("creating"),
        workerName: string(),
        rootDirectory: string(),
      }),
      object({
        state: literal("created"),
        workerName: string(),
        workerTag: string(),
        rootDirectory: string(),
      }),
    ),
    createdAt: number(),
    updatedAt: number(),
  }).index("by_vault", ["vaultId"]),

  /**
   * The current or most recent provider write for one vault. Active managed
   * runs and manual provider writes use this row as one vault-level lock.
   * Terminal rows preserve provider refresh times and reject delayed completion
   * from an older owner.
   */
  workflow_vaultProvisioning_writeLocks: defineTable(
    union(
      object({
        ...vaultProviderWriteBase,
        owner: object({
          kind: literal("managed_run"),
          runId: id("workflow_vaultProvisioning_runs"),
        }),
        state: union(literal("active"), literal("succeeded"), literal("failed")),
      }),
      object({
        ...vaultProviderWriteBase,
        owner: object(manualProviderWriteOwner),
        state: union(literal("active"), literal("succeeded"), literal("failed")),
      }),
    ),
  )
    .index("by_vault", ["vaultId"])
    .index("by_manual_user_and_state", ["owner.userId", "state"]),

  /**
   * One managed attempt to create, connect, or retry a vault, including
   * background-workflow progress and outcome. Explicit provider actions do not
   * create runs.
   */
  workflow_vaultProvisioning_runs: defineTable({
    organizationId: id("organizations"),
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    workflowId: optional(string()),
    trigger: vAppProvisioningRunTrigger,
    state: vAppProvisioningRunState,
    currentStep: vAppProvisioningRunStep,
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
    .index("by_vault_and_updated_at", ["vaultId", "updatedAt"])
    .index("by_vault_and_state", ["vaultId", "state"])
    .index("by_user_and_state_and_updated_at", ["userId", "state", "updatedAt"])
    .index("by_workflow_id", ["workflowId"]),

  /** Ordered user-visible progress messages for one vault provisioning run. */
  workflow_vaultProvisioning_events: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    runId: id("workflow_vaultProvisioning_runs"),
    step: vAppProvisioningStep,
    level: vAppProvisioningEventLevel,
    message: string(),
    createdAt: number(),
  })
    .index("by_vault_and_created_at", ["vaultId", "createdAt"])
    .index("by_run_and_created_at", ["runId", "createdAt"]),
};
