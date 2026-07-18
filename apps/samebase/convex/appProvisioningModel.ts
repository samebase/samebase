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
  literal("wire_builds"),
  literal("wire_convex_build_access"),
  literal("verify_infrastructure"),
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
  literal("wire_builds"),
  literal("wire_convex_build_access"),
  literal("verify_infrastructure"),
  literal("record_domains"),
  literal("finish"),
);
export type AppProvisioningRunStep = Infer<typeof vAppProvisioningRunStep>;

export const vAppProvisioningRunTrigger = union(
  literal("create"),
  literal("connect_existing_repository"),
  literal("connect_convex_deployment"),
  literal("connect_cloudflare_worker"),
  literal("wire_builds"),
  literal("wire_convex_build_access"),
  literal("verify_infrastructure"),
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

export const appProvisioningTables = {
  /** User-selected target state for Samebase-managed infrastructure. */
  operations_vaultInfrastructureTargets: defineTable({
    vaultId: id("vaults"),
    appRoot: string(),
    convex: union(
      object({
        state: literal("planned"),
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
        accountId: string(),
        workerName: string(),
        build: vVaultCloudflareBuildConfig,
      }),
      object({
        state: literal("created"),
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        workersDevUrl: optional(string()),
        build: vVaultCloudflareBuildConfig,
      }),
    ),
    createdAt: number(),
    updatedAt: number(),
  }).index("by_vault", ["vaultId"]),

  /** Latest Workflow run allowed to write provider state for a vault. */
  operations_vaultInfrastructureOwnership: defineTable({
    vaultId: id("vaults"),
    runId: id("operations_vaultProvisioningRuns"),
    state: union(literal("active"), literal("succeeded"), literal("failed")),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_state", ["vaultId", "state"])
    .index("by_run", ["runId"]),

  /** App-owned Workflow run identity for Samebase-managed provisioning. */
  operations_vaultProvisioningRuns: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    workflowId: optional(string()),
    trigger: vAppProvisioningRunTrigger,
    createdConvexProject: optional(
      object({
        projectName: string(),
        projectId: string(),
        projectSlug: string(),
      }),
    ),
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

  /** User-visible provisioning events for Samebase-managed app creation. */
  operations_vaultProvisioningEvents: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    runId: id("operations_vaultProvisioningRuns"),
    step: vAppProvisioningStep,
    level: vAppProvisioningEventLevel,
    message: string(),
    createdAt: number(),
  })
    .index("by_vault_and_created_at", ["vaultId", "createdAt"])
    .index("by_run_and_created_at", ["runId", "createdAt"]),
};
