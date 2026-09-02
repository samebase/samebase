import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { array, id, literal, number, object, optional, string, union } = v;

export const vRepositoryConvexSchemaGraphFieldSource = union(
  literal("declared"),
  literal("inferred"),
);
export type RepositoryConvexSchemaGraphFieldSource = Infer<
  typeof vRepositoryConvexSchemaGraphFieldSource
>;

export const vRepositoryConvexSchemaGraphTableSource = union(
  literal("declared"),
  literal("inferred"),
  literal("mixed"),
);
export type RepositoryConvexSchemaGraphTableSource = Infer<
  typeof vRepositoryConvexSchemaGraphTableSource
>;

export const vRepositoryConvexSchemaGraphRelationshipSource = union(
  literal("declared"),
  literal("inferred"),
);

export const vRepositoryConvexSchemaGraphField = object({
  path: string(),
  kind: string(),
  optional: v.boolean(),
  source: vRepositoryConvexSchemaGraphFieldSource,
  targetTable: optional(string()),
  targetTables: optional(array(string())),
});
export type RepositoryConvexSchemaGraphField = Infer<typeof vRepositoryConvexSchemaGraphField>;

export const vRepositoryConvexSchemaGraphIndex = object({
  name: string(),
  fields: array(string()),
});
export type RepositoryConvexSchemaGraphIndex = Infer<typeof vRepositoryConvexSchemaGraphIndex>;

export const vRepositoryConvexSchemaGraphTable = object({
  name: string(),
  source: vRepositoryConvexSchemaGraphTableSource,
  fields: array(vRepositoryConvexSchemaGraphField),
  indexes: array(vRepositoryConvexSchemaGraphIndex),
  documentCount: optional(number()),
});
export type RepositoryConvexSchemaGraphTable = Infer<typeof vRepositoryConvexSchemaGraphTable>;

export const vRepositoryConvexSchemaGraphRelationship = object({
  id: string(),
  fromTable: string(),
  fromField: string(),
  toTable: string(),
  source: vRepositoryConvexSchemaGraphRelationshipSource,
});
export type RepositoryConvexSchemaGraphRelationship = Infer<
  typeof vRepositoryConvexSchemaGraphRelationship
>;

export const vRepositoryConvexSchemaGraph = object({
  tables: array(vRepositoryConvexSchemaGraphTable),
  relationships: array(vRepositoryConvexSchemaGraphRelationship),
  warnings: array(string()),
});
export type RepositoryConvexSchemaGraph = Infer<typeof vRepositoryConvexSchemaGraph>;

export const repositoryConvexSchemaGraphTables = {
  /** One fetched deployment schema linked to its stable Convex project. */
  observations_repositoryConvexSchema_snapshots: defineTable({
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
    deploymentName: string(),
    schemaHash: string(),
    graph: vRepositoryConvexSchemaGraph,
    declaredSchemaJson: optional(string()),
    inferredSchemaJson: optional(string()),
    fetchedAt: number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_project_and_fetched_at", ["convexProjectId", "fetchedAt"]),

  /** Per-user node positions kept separate from refreshed schema snapshots. */
  ui_repositoryConvexSchemaGraph_nodeLayouts: defineTable({
    userId: id("users"),
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
    nodeId: string(),
    x: number(),
    y: number(),
    updatedAt: number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_user_repository_project", ["userId", "repositoryId", "convexProjectId"])
    .index("by_user_repository_project_node", [
      "userId",
      "repositoryId",
      "convexProjectId",
      "nodeId",
    ]),
};
