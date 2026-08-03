import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { array, id, literal, number, object, optional, string, union } = v;

export const vConvexSchemaGraphFieldSource = union(literal("declared"), literal("inferred"));
export type ConvexSchemaGraphFieldSource = Infer<typeof vConvexSchemaGraphFieldSource>;

export const vConvexSchemaGraphTableSource = union(
  literal("declared"),
  literal("inferred"),
  literal("mixed"),
);
export type ConvexSchemaGraphTableSource = Infer<typeof vConvexSchemaGraphTableSource>;

export const vConvexSchemaGraphRelationshipSource = union(literal("declared"), literal("inferred"));

export const vConvexSchemaGraphField = object({
  path: string(),
  kind: string(),
  optional: v.boolean(),
  source: vConvexSchemaGraphFieldSource,
  targetTable: optional(string()),
  targetTables: optional(array(string())),
});
export type ConvexSchemaGraphField = Infer<typeof vConvexSchemaGraphField>;

export const vConvexSchemaGraphIndex = object({
  name: string(),
  fields: array(string()),
});
export type ConvexSchemaGraphIndex = Infer<typeof vConvexSchemaGraphIndex>;

export const vConvexSchemaGraphTable = object({
  name: string(),
  source: vConvexSchemaGraphTableSource,
  fields: array(vConvexSchemaGraphField),
  indexes: array(vConvexSchemaGraphIndex),
  documentCount: optional(number()),
});
export type ConvexSchemaGraphTable = Infer<typeof vConvexSchemaGraphTable>;

export const vConvexSchemaGraphRelationship = object({
  id: string(),
  fromTable: string(),
  fromField: string(),
  toTable: string(),
  source: vConvexSchemaGraphRelationshipSource,
});
export type ConvexSchemaGraphRelationship = Infer<typeof vConvexSchemaGraphRelationship>;

export const vConvexSchemaGraph = object({
  tables: array(vConvexSchemaGraphTable),
  relationships: array(vConvexSchemaGraphRelationship),
  warnings: array(string()),
});
export type ConvexSchemaGraph = Infer<typeof vConvexSchemaGraph>;

export const vaultConvexSchemaGraphTables = {
  /**
   * One fetched production-deployment schema linked to its stable Convex project.
   */
  observations_vaultConvexSchema_snapshots: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    convexProjectId: id("vaultConvexProjects"),
    deploymentName: string(),
    schemaHash: string(),
    graph: vConvexSchemaGraph,
    declaredSchemaJson: optional(string()),
    inferredSchemaJson: optional(string()),
    fetchedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_project_and_fetched_at", ["convexProjectId", "fetchedAt"]),

  /** Per-user node positions kept separate from refreshed schema snapshots. */
  ui_vaultConvexSchemaGraph_nodeLayouts: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    convexProjectId: id("vaultConvexProjects"),
    nodeId: string(),
    x: number(),
    y: number(),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_user_vault_project", ["userId", "vaultId", "convexProjectId"])
    .index("by_user_vault_project_node", ["userId", "vaultId", "convexProjectId", "nodeId"]),
};
