import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const nullValidator = v.null();
const { id, literal, number, object, string, union } = v;

export const vRepositoryWriteMode = union(
  literal("normal"),
  literal("draining"),
  literal("frozen"),
);
export type RepositoryWriteMode = Infer<typeof vRepositoryWriteMode>;

export const vRepositoryWriteModeStatus = object({
  mode: vRepositoryWriteMode,
  changedAt: union(number(), nullValidator),
});
export type RepositoryWriteModeStatus = Infer<typeof vRepositoryWriteModeStatus>;

export const vRepositoryOperationLeaseResult = object({
  leaseId: id("repositoryOperationLeases"),
  expiresAt: number(),
});
export type RepositoryOperationLeaseResult = Infer<typeof vRepositoryOperationLeaseResult>;

export const repositoryMigrationMaintenanceTables = {
  /** The singleton global mode that controls repository-domain writes during migration. */
  repositoryWriteGates: defineTable({
    scope: literal("global"),
    mode: vRepositoryWriteMode,
    changedAt: number(),
  }).index("by_scope", ["scope"]),

  /** Time-limited permission for one repository operation to continue while writes drain. */
  repositoryOperationLeases: defineTable({
    operationId: string(),
    operationName: string(),
    startedAt: number(),
    expiresAt: number(),
  })
    .index("by_operation_id", ["operationId"])
    .index("by_expires_at", ["expiresAt"]),
};
