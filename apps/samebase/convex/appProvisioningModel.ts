import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vVaultCloudflareBuildConfig } from "./vault/model";

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
  literal("create_vault"),
  literal("sync_tree"),
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
  literal("record_domains"),
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
  literal("create_vault"),
  literal("sync_tree"),
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("configure_workers_builds_for_github"),
  literal("rotate_convex_deploy_keys_for_workers_builds"),
  literal("record_domains"),
  literal("finish"),
);
export type AppProvisioningRunStep = Infer<typeof vAppProvisioningRunStep>;

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

export const vaultProvisioningTables = {
  /**
   * The exact Convex project and Cloudflare Worker choices for one vault.
   * Retries read this row so every attempt uses the same provider names,
   * Convex config path, Cloudflare account, and Worker build configuration.
   * `created` variants preserve identities returned by earlier provider-creation
   * checkpoints. Recording a `created` checkpoint and its stable resource
   * attachment is one database transaction.
   */
  workflow_vaultProvisioning_plans: defineTable({
    vaultId: id("vaults"),
    userId: id("users"),
    convexConfigPath: string(),
    convex: union(
      object({
        state: literal("planned"),
        projectName: string(),
      }),
      object({
        state: literal("creating"),
        projectName: string(),
        teamId: string(),
      }),
      object({
        state: literal("created"),
        projectName: string(),
        teamId: string(),
        projectId: string(),
      }),
    ),
    cloudflare: union(
      object({
        state: literal("planned"),
        accountId: string(),
        workerName: string(),
        build: vVaultCloudflareBuildConfig,
      }),
      object({
        state: literal("creating"),
        accountId: string(),
        workerName: string(),
        build: vVaultCloudflareBuildConfig,
      }),
      object({
        state: literal("created"),
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        build: vVaultCloudflareBuildConfig,
      }),
    ),
    createdAt: number(),
    updatedAt: number(),
  }).index("by_vault", ["vaultId"]),

  /**
   * The provisioning write lock for one vault. Only its active run may change
   * Convex or Cloudflare resources. The row remains after completion so delayed
   * work from older runs cannot write.
   */
  workflow_vaultProvisioning_writeLocks: defineTable({
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    state: union(literal("active"), literal("succeeded"), literal("failed")),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_state", ["vaultId", "state"])
    .index("by_run", ["runId"]),

  /**
   * One managed attempt to create, connect, or retry a vault, including
   * background-workflow progress and outcome. Explicit provider actions do not
   * create runs.
   */
  workflow_vaultProvisioning_runs: defineTable({
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
    .index("by_vault_and_updated_at", ["vaultId", "updatedAt"])
    .index("by_vault_and_state", ["vaultId", "state"])
    .index("by_user_and_updated_at", ["userId", "updatedAt"])
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
