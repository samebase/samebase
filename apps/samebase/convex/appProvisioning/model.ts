import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

const { id, literal, number, object, optional, string, union } = v;

export const vAppProvisioningEventLevel = union(literal("info"), literal("warn"), literal("error"));
export type AppProvisioningEventLevel = Infer<typeof vAppProvisioningEventLevel>;

const appProvisioningSteps = [
  "initialize_vault",
  "validate_connections",
  "create_github_repo",
  "fetch_github_repo",
  "seed_starter",
  "connect_github",
  "create_vault",
  "sync_tree",
  "claim_infra",
  "attach_convex",
  "attach_worker",
  "wire_builds",
  "wire_convex_build_access",
  "verify_infrastructure",
  "record_domains",
  "finish",
] as const;
const appProvisioningStepValidators = appProvisioningSteps.map((step) => literal(step));

export const vAppProvisioningStep = union(...appProvisioningStepValidators);
export type AppProvisioningStep = Infer<typeof vAppProvisioningStep>;

export const vAppProvisioningRunStep = union(
  literal("run_created"),
  ...appProvisioningStepValidators,
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

/** App-owned Workflow run identity for Samebase-managed provisioning. */
export const appProvisioningRunsTable = defineTable({
  userId: id("users"),
  vaultId: id("vaults"),
  repositoryFullName: string(),
  // Assigned after the Workflow component start call returns; run identity
  // exists first so early events can still be linked deterministically.
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
  .index("by_workflow_id", ["workflowId"]);

/** User-visible provisioning events for Samebase-managed app creation. */
export const appProvisioningEventsTable = defineTable({
  userId: id("users"),
  vaultId: id("vaults"),
  repositoryFullName: string(),
  runId: id("appProvisioningRuns"),
  step: vAppProvisioningStep,
  level: vAppProvisioningEventLevel,
  message: string(),
  createdAt: number(),
})
  .index("by_vault_and_created_at", ["vaultId", "createdAt"])
  .index("by_run_and_created_at", ["runId", "createdAt"]);
