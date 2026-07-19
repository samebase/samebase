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
   * One fetched Convex deployment schema, including raw provider responses and
   * the normalized graph rendered by the vault dashboard.
   */
  observations_vaultConvexSchema_snapshots: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    deploymentId: id("vaultConvexDeployments"),
    appRoot: string(),
    deploymentName: string(),
    schemaHash: string(),
    graph: vConvexSchemaGraph,
    declaredSchemaJson: optional(string()),
    inferredSchemaJson: optional(string()),
    fetchedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_deployment_and_fetched_at", ["deploymentId", "fetchedAt"]),

  /** Per-user node positions kept separate from refreshed schema snapshots. */
  ui_vaultConvexSchemaGraph_nodeLayouts: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    deploymentId: id("vaultConvexDeployments"),
    nodeId: string(),
    x: number(),
    y: number(),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user_vault_deployment", ["userId", "vaultId", "deploymentId"])
    .index("by_user_vault_deployment_node", ["userId", "vaultId", "deploymentId", "nodeId"]),
};
