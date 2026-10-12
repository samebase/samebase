import { Infer, v } from "convex/values";
import {
  getConvexCodeRootDirectory,
  readConvexCodeLocation,
} from "../../shared/convexCodeLocation";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { action, mutation, query } from "../functions";
import { isRecord, readBoolean, readString } from "../jsonUtils";
import { findRepositoryForUser, requireRepositoryForUser } from "../organizationAccess";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import { isLiveConnectedRepository } from "./state";
import {
  fetchConvexDeploymentJson,
  fetchConvexSystemQuery,
  withConvexInspectionDeployKey,
} from "./convexDeploymentInspection";
import {
  vRepositoryConvexSchemaGraph as vConvexSchemaGraph,
  type RepositoryConvexSchemaGraph as ConvexSchemaGraph,
  type RepositoryConvexSchemaGraphField as ConvexSchemaGraphField,
  type RepositoryConvexSchemaGraphFieldSource as ConvexSchemaGraphFieldSource,
  type RepositoryConvexSchemaGraphIndex as ConvexSchemaGraphIndex,
  type RepositoryConvexSchemaGraphRelationship as ConvexSchemaGraphRelationship,
  type RepositoryConvexSchemaGraphTable as ConvexSchemaGraphTable,
  type RepositoryConvexSchemaGraphTableSource as ConvexSchemaGraphTableSource,
} from "./convexSchemaGraphModel";
import { readConvexProductionDeployment } from "./convexProjectResources";

const { array, id, number, object, optional, string, union } = v;

type DeclaredTable = {
  documentType: unknown;
  indexes: ConvexSchemaGraphIndex[];
  tableName: string;
};
type TableDraft = {
  declared: boolean;
  declaredFields: ConvexSchemaGraphField[];
  documentCount?: number;
  inferred: boolean;
  inferredFields: ConvexSchemaGraphField[];
  indexes: ConvexSchemaGraphIndex[];
  name: string;
};
type FieldCollectorArgs = {
  fields: Map<string, ConvexSchemaGraphField>;
  optional: boolean;
  path: string;
  skipCurrentField?: boolean;
  source: ConvexSchemaGraphFieldSource;
  value: unknown;
};
type ConvexSchemaFetchResult = {
  declaredSchemaJson?: string;
  graph: ConvexSchemaGraph;
  inferredSchemaJson?: string;
};

const CONVEX_SCHEMA_SNAPSHOT_DOCUMENT_SOFT_LIMIT = 900_000;
const CONVEX_SCHEMA_RAW_JSON_TOTAL_MAX_LENGTH = 500_000;
const CONVEX_SCHEMA_SNAPSHOT_RETENTION_COUNT = 5;
const CONVEX_SCHEMA_TABLE_COUNT_CONCURRENCY = 8;

const vConvexSchemaGraphLayoutPoint = object({
  nodeId: string(),
  x: number(),
  y: number(),
});

const vConvexSchemaGraphProjectOption = object({
  convexProjectId: id("repositoryConvexProjects"),
  rootDirectory: string(),
  projectId: string(),
});

const vConvexSchemaGraphSnapshotResult = object({
  _id: id("observations_repositoryConvexSchema_snapshots"),
  fetchedAt: number(),
  schemaHash: string(),
  graph: vConvexSchemaGraph,
});

const vConvexSchemaGraphStateResult = object({
  project: vConvexSchemaGraphProjectOption,
  snapshot: union(vConvexSchemaGraphSnapshotResult, v.null()),
  layout: array(vConvexSchemaGraphLayoutPoint),
});
export type ConvexSchemaGraphStateResult = Infer<typeof vConvexSchemaGraphStateResult>;

function compareGraphTable(left: ConvexSchemaGraphTable, right: ConvexSchemaGraphTable): number {
  return left.name.localeCompare(right.name);
}

function compareGraphField(left: ConvexSchemaGraphField, right: ConvexSchemaGraphField): number {
  return (
    left.path.localeCompare(right.path) ||
    left.source.localeCompare(right.source) ||
    readFieldTargetTables(left).join("\0").localeCompare(readFieldTargetTables(right).join("\0")) ||
    left.kind.localeCompare(right.kind)
  );
}

function compareGraphRelationship(
  left: ConvexSchemaGraphRelationship,
  right: ConvexSchemaGraphRelationship,
): number {
  return (
    left.fromTable.localeCompare(right.fromTable) ||
    left.toTable.localeCompare(right.toTable) ||
    left.fromField.localeCompare(right.fromField) ||
    left.source.localeCompare(right.source)
  );
}

function readSchemaGraphLayoutTableName(nodeId: string): string {
  const separatorIndex = nodeId.lastIndexOf(":");
  if (separatorIndex === -1) {
    return nodeId;
  }

  const tableName = nodeId.slice(separatorIndex + 1);
  return tableName.length > 0 ? tableName : nodeId;
}

function readProjectOption(project: Doc<"repositoryConvexProjects">) {
  return {
    convexProjectId: project._id,
    rootDirectory: getConvexCodeRootDirectory(readConvexCodeLocation(project)),
    projectId: project.projectId,
  };
}

function readActiveSchemaJson(schemaResponse: unknown): string | undefined {
  if (!isRecord(schemaResponse)) {
    return undefined;
  }
  const value = schemaResponse["value"];
  if (!isRecord(value)) {
    return undefined;
  }
  return readString(value, "active");
}

function parseJsonOrNull(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function uniqueSortedStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function readFieldTargetTables(field: ConvexSchemaGraphField): string[] {
  if (field.targetTables !== undefined) {
    return field.targetTables;
  }
  return field.targetTable ? [field.targetTable] : [];
}

function buildFieldTargetProperties(targetTables: string[]): {
  targetTable?: string;
  targetTables?: string[];
} {
  const uniqueTargetTables = uniqueSortedStrings(targetTables);
  if (uniqueTargetTables.length === 0) {
    return {};
  }
  if (uniqueTargetTables.length === 1) {
    return { targetTable: uniqueTargetTables[0] };
  }
  return { targetTables: uniqueTargetTables };
}

async function fetchTableCount(args: {
  deployKey: string;
  deploymentUrl: string;
  tableName: string;
}): Promise<number | undefined> {
  try {
    const response = await fetchConvexSystemQuery({
      deployKey: args.deployKey,
      deploymentUrl: args.deploymentUrl,
      path: "_system/cli/tableSize:default",
      queryArgs: { tableName: args.tableName },
    });
    return typeof response?.value === "number" ? response.value : undefined;
  } catch {
    return undefined;
  }
}

function readDeclaredTables(schema: unknown): DeclaredTable[] {
  if (!isRecord(schema) || !Array.isArray(schema["tables"])) {
    return [];
  }

  const tables: DeclaredTable[] = [];
  for (const value of schema["tables"]) {
    if (!isRecord(value)) {
      continue;
    }
    const tableName = readString(value, "tableName");
    if (!tableName || tableName.startsWith("_")) {
      continue;
    }
    tables.push({
      tableName,
      documentType: value["documentType"],
      indexes: readDeclaredIndexes(value["indexes"]),
    });
  }
  return tables;
}

function readDeclaredIndexes(indexes: unknown): ConvexSchemaGraphIndex[] {
  if (!Array.isArray(indexes)) {
    return [];
  }

  const parsedIndexes: ConvexSchemaGraphIndex[] = [];
  for (const index of indexes) {
    if (!isRecord(index)) {
      continue;
    }
    const name = readString(index, "indexDescriptor");
    if (!name) {
      continue;
    }
    const fieldsValue = index["fields"];
    const fields = Array.isArray(fieldsValue)
      ? fieldsValue.filter((field) => typeof field === "string")
      : [];
    parsedIndexes.push({
      name,
      fields,
    });
  }
  return parsedIndexes.sort((left, right) => left.name.localeCompare(right.name));
}

function unwrapConvexFieldType(value: unknown): { optional: boolean; value: unknown } {
  if (!isRecord(value)) {
    return { optional: false, value };
  }
  const fieldType = value["fieldType"];
  if (fieldType !== undefined) {
    const wrappedOptional = readBoolean(value, "optional") ?? false;
    const unwrapped = unwrapConvexFieldType(fieldType);
    return {
      optional: wrappedOptional || unwrapped.optional,
      value: unwrapped.value,
    };
  }
  if (value["type"] === "optional") {
    const inner = value["inner"] ?? value["value"];
    const unwrapped = unwrapConvexFieldType(inner);
    return {
      optional: true,
      value: unwrapped.value,
    };
  }
  return { optional: false, value };
}

function formatDeclaredType(value: unknown): string {
  const unwrapped = unwrapConvexFieldType(value);
  if (!isRecord(unwrapped.value)) {
    return "unknown";
  }
  const type = readString(unwrapped.value, "type") ?? "unknown";
  switch (type) {
    case "id": {
      const tableName = readString(unwrapped.value, "tableName") ?? "unknown";
      return `Id<${tableName}>`;
    }
    case "array": {
      return `array<${formatDeclaredType(unwrapped.value["value"])}>`;
    }
    case "record": {
      return `record<${formatDeclaredType(unwrapped.value["value"])}>`;
    }
    case "union": {
      const values = unwrapped.value["value"];
      if (!Array.isArray(values)) {
        return "union";
      }
      return values.map(formatDeclaredType).join(" | ");
    }
    case "literal": {
      const literalValue = unwrapped.value["value"];
      return typeof literalValue === "string" ? `"${literalValue}"` : "literal";
    }
    default:
      return type;
  }
}

function readDeclaredTargetTables(value: unknown): string[] {
  const unwrapped = unwrapConvexFieldType(value);
  if (!isRecord(unwrapped.value)) {
    return [];
  }
  if (unwrapped.value["type"] === "id") {
    const tableName = readString(unwrapped.value, "tableName");
    return tableName ? [tableName] : [];
  }
  if (unwrapped.value["type"] === "union" && Array.isArray(unwrapped.value["value"])) {
    return uniqueSortedStrings(unwrapped.value["value"].flatMap(readDeclaredTargetTables));
  }
  return [];
}

function collectDeclaredFields(args: FieldCollectorArgs): void {
  const unwrapped = unwrapConvexFieldType(args.value);
  const optional = args.optional || unwrapped.optional;
  if (!isRecord(unwrapped.value)) {
    if (args.path.length > 0 && args.skipCurrentField !== true) {
      args.fields.set(args.path, {
        path: args.path,
        kind: "unknown",
        optional,
        source: args.source,
      });
    }
    return;
  }

  const type = readString(unwrapped.value, "type");
  if (args.path.length > 0 && args.skipCurrentField !== true) {
    const targetTables = readDeclaredTargetTables(unwrapped.value);
    args.fields.set(args.path, {
      path: args.path,
      kind: formatDeclaredType(unwrapped.value),
      optional,
      source: args.source,
      ...buildFieldTargetProperties(targetTables),
    });
  }

  if (type === "object" && isRecord(unwrapped.value["value"])) {
    for (const [name, fieldValue] of Object.entries(unwrapped.value["value"])) {
      const childPath = args.path.length > 0 ? `${args.path}.${name}` : name;
      collectDeclaredFields({
        ...args,
        optional,
        path: childPath,
        skipCurrentField: false,
        value: fieldValue,
      });
    }
    return;
  }

  if (type === "array") {
    collectDeclaredFields({
      ...args,
      optional,
      path: args.path.length > 0 ? `${args.path}[]` : "[]",
      skipCurrentField: false,
      value: unwrapped.value["value"],
    });
    return;
  }

  if (type === "record") {
    collectDeclaredFields({
      ...args,
      optional,
      path: args.path.length > 0 ? `${args.path}.*` : "*",
      skipCurrentField: false,
      value: unwrapped.value["value"],
    });
    return;
  }

  if (type === "union" && Array.isArray(unwrapped.value["value"])) {
    for (const member of unwrapped.value["value"]) {
      collectDeclaredFields({
        ...args,
        optional: true,
        skipCurrentField: true,
        value: member,
      });
    }
  }
}

function formatInferredShapeType(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return "unknown";
  }
  const type = readString(value, "type") ?? "unknown";
  switch (type) {
    case "String":
      return "string";
    case "Int64":
    case "Float64":
      return "number";
    case "Boolean":
      return "boolean";
    case "Id": {
      const tableName = readString(value, "tableName") ?? "unknown";
      return `Id<${tableName}>`;
    }
    case "Array":
      return `array<${formatInferredShapeType(value["shape"])}>`;
    case "Set":
      return `set<${formatInferredShapeType(value["shape"])}>`;
    case "Map":
      return `map<${formatInferredShapeType(value["shape"])}>`;
    case "Object":
      return "object";
    case "Union": {
      const shapes = value["shapes"];
      if (!Array.isArray(shapes)) {
        return "union";
      }
      return shapes.map(formatInferredShapeType).join(" | ");
    }
    case "Null":
      return "null";
    case "Bytes":
      return "bytes";
    default:
      return type.toLowerCase();
  }
}

function readInferredTargetTables(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const type = readString(value, "type");
  if (type === "Id") {
    const tableName = readString(value, "tableName");
    return tableName ? [tableName] : [];
  }
  if (type === "Union" && Array.isArray(value["shapes"])) {
    return uniqueSortedStrings(value["shapes"].flatMap(readInferredTargetTables));
  }
  return [];
}

function collectInferredFields(args: FieldCollectorArgs): void {
  if (Array.isArray(args.value)) {
    for (const member of args.value) {
      collectInferredFields({
        ...args,
        optional: true,
        value: member,
      });
    }
    return;
  }
  if (!isRecord(args.value)) {
    return;
  }

  const type = readString(args.value, "type");
  if (args.path.length > 0 && args.skipCurrentField !== true) {
    const targetTables = readInferredTargetTables(args.value);
    args.fields.set(args.path, {
      path: args.path,
      kind: formatInferredShapeType(args.value),
      optional: args.optional,
      source: args.source,
      ...buildFieldTargetProperties(targetTables),
    });
  }

  if (type === "Object" && Array.isArray(args.value["fields"])) {
    for (const field of args.value["fields"]) {
      if (!isRecord(field)) {
        continue;
      }
      const fieldName = readString(field, "fieldName");
      if (!fieldName || fieldName.startsWith("_")) {
        continue;
      }
      const childPath = args.path.length > 0 ? `${args.path}.${fieldName}` : fieldName;
      collectInferredFields({
        ...args,
        optional: args.optional || readBoolean(field, "optional") === true,
        path: childPath,
        skipCurrentField: false,
        value: field["shape"],
      });
    }
    return;
  }

  if (type === "Array" || type === "Set") {
    collectInferredFields({
      ...args,
      path: args.path.length > 0 ? `${args.path}[]` : "[]",
      skipCurrentField: false,
      value: args.value["shape"],
    });
    return;
  }

  if (type === "Map") {
    collectInferredFields({
      ...args,
      path: args.path.length > 0 ? `${args.path}.*` : "*",
      skipCurrentField: false,
      value: args.value["shape"],
    });
    return;
  }

  if (type === "Union" && Array.isArray(args.value["shapes"])) {
    for (const shape of args.value["shapes"]) {
      collectInferredFields({
        ...args,
        optional: true,
        skipCurrentField: true,
        value: shape,
      });
    }
  }
}

function fieldsFromDeclaredDocumentType(documentType: unknown): ConvexSchemaGraphField[] {
  const fields = new Map<string, ConvexSchemaGraphField>();
  collectDeclaredFields({
    fields,
    optional: false,
    path: "",
    source: "declared",
    value: documentType,
  });
  return [...fields.values()].sort(compareGraphField);
}

function fieldsFromInferredShape(shape: unknown): ConvexSchemaGraphField[] {
  const fields = new Map<string, ConvexSchemaGraphField>();
  collectInferredFields({
    fields,
    optional: false,
    path: "",
    source: "inferred",
    value: shape,
  });
  return [...fields.values()].sort(compareGraphField);
}

function ensureTableDraft(tables: Map<string, TableDraft>, tableName: string): TableDraft {
  const existing = tables.get(tableName);
  if (existing) {
    return existing;
  }
  const next: TableDraft = {
    name: tableName,
    declared: false,
    declaredFields: [],
    inferred: false,
    inferredFields: [],
    indexes: [],
  };
  tables.set(tableName, next);
  return next;
}

function readInferredShapeEntries(shapes: unknown): Array<{ shape: unknown; tableName: string }> {
  if (!isRecord(shapes)) {
    return [];
  }
  const entries: Array<{ shape: unknown; tableName: string }> = [];
  for (const [tableName, shape] of Object.entries(shapes)) {
    if (!tableName.startsWith("_")) {
      entries.push({ tableName, shape });
    }
  }
  return entries;
}

function relationshipId(args: { fromField: string; fromTable: string; toTable: string }): string {
  return `${args.fromTable}:${args.fromField}:${args.toTable}`;
}

function readTableSource(table: TableDraft): ConvexSchemaGraphTableSource {
  if (table.declaredFields.length > 0 && table.inferredFields.length > 0) {
    return "mixed";
  }
  if (table.declared && table.inferred) {
    return "mixed";
  }
  if (table.declared) {
    return "declared";
  }
  return "inferred";
}

function buildRelationships(args: {
  tableNames: ReadonlySet<string>;
  tables: TableDraft[];
  warnings: string[];
}): ConvexSchemaGraphRelationship[] {
  const relationships = new Map<string, ConvexSchemaGraphRelationship>();
  for (const table of args.tables) {
    for (const field of [...table.declaredFields, ...table.inferredFields]) {
      const targetTables = readFieldTargetTables(field);
      if (targetTables.length === 0) {
        continue;
      }
      for (const targetTable of targetTables) {
        if (!args.tableNames.has(targetTable)) {
          args.warnings.push(
            `${table.name}.${field.path} references missing table ${targetTable}.`,
          );
          continue;
        }
        if (targetTable === table.name) {
          continue;
        }
        const idValue = relationshipId({
          fromTable: table.name,
          fromField: field.path,
          toTable: targetTable,
        });
        const existing = relationships.get(idValue);
        if (existing?.source === "declared" && field.source === "inferred") {
          continue;
        }
        relationships.set(idValue, {
          id: idValue,
          fromTable: table.name,
          fromField: field.path,
          toTable: targetTable,
          source: field.source,
        });
      }
    }
  }
  return [...relationships.values()].sort(compareGraphRelationship);
}

async function buildSchemaGraph(args: {
  deployKey: string;
  deploymentUrl: string;
  declaredSchema: unknown;
  inferredShapes: unknown;
  warnings: string[];
}): Promise<ConvexSchemaGraph> {
  const tableDrafts = new Map<string, TableDraft>();
  for (const table of readDeclaredTables(args.declaredSchema)) {
    const draft = ensureTableDraft(tableDrafts, table.tableName);
    draft.declared = true;
    draft.indexes = table.indexes;
    draft.declaredFields = fieldsFromDeclaredDocumentType(table.documentType);
  }

  for (const entry of readInferredShapeEntries(args.inferredShapes)) {
    const draft = ensureTableDraft(tableDrafts, entry.tableName);
    draft.inferred = true;
    draft.inferredFields = fieldsFromInferredShape(entry.shape);
  }

  const tableDraftList = [...tableDrafts.values()];
  for (
    let index = 0;
    index < tableDraftList.length;
    index += CONVEX_SCHEMA_TABLE_COUNT_CONCURRENCY
  ) {
    await Promise.all(
      tableDraftList
        .slice(index, index + CONVEX_SCHEMA_TABLE_COUNT_CONCURRENCY)
        .map(async (table) => {
          table.documentCount = await fetchTableCount({
            deployKey: args.deployKey,
            deploymentUrl: args.deploymentUrl,
            tableName: table.name,
          });
        }),
    );
  }

  const drafts = tableDraftList.sort((left, right) => left.name.localeCompare(right.name));
  const tableNames = new Set(drafts.map((table) => table.name));
  const tables = drafts
    .map((table): ConvexSchemaGraphTable => {
      const declaredPaths = new Set(table.declaredFields.map((field) => field.path));
      const inferredOnlyFields = table.inferredFields.filter(
        (field) => !declaredPaths.has(field.path),
      );
      return {
        name: table.name,
        source: readTableSource(table),
        fields: [...table.declaredFields, ...inferredOnlyFields].sort(compareGraphField),
        indexes: table.indexes,
        ...(table.documentCount !== undefined ? { documentCount: table.documentCount } : {}),
      };
    })
    .sort(compareGraphTable);
  return {
    tables,
    relationships: buildRelationships({
      tableNames,
      tables: drafts,
      warnings: args.warnings,
    }),
    warnings: [...args.warnings].sort(),
  };
}

async function fetchConvexSchemaGraph(args: {
  deployKey: string;
  deploymentUrl: string;
}): Promise<ConvexSchemaFetchResult> {
  const warnings: string[] = [];
  const [inferredShapes, schemaResponse] = await Promise.all([
    fetchConvexDeploymentJson({
      deployKey: args.deployKey,
      deploymentUrl: args.deploymentUrl,
      path: "/api/shapes2",
    }),
    fetchConvexSystemQuery({
      deployKey: args.deployKey,
      deploymentUrl: args.deploymentUrl,
      path: "_system/frontend/getSchemas",
      queryArgs: {},
    }),
  ]);
  const activeSchemaJson =
    schemaResponse === null ? undefined : readActiveSchemaJson({ value: schemaResponse.value });
  const declaredSchema = activeSchemaJson ? parseJsonOrNull(activeSchemaJson) : null;
  if (!activeSchemaJson) {
    warnings.push("Declared Convex schema was not returned by the deployment.");
  } else if (declaredSchema === null) {
    warnings.push("Declared Convex schema JSON could not be parsed.");
  }

  const graph = await buildSchemaGraph({
    deployKey: args.deployKey,
    deploymentUrl: args.deploymentUrl,
    declaredSchema,
    inferredShapes,
    warnings,
  });
  const rawJson = buildRawSchemaJsonStorage({
    activeSchemaJson,
    graph,
    inferredShapes,
    warnings,
  });
  return {
    graph: {
      ...graph,
      warnings: [...warnings].sort(),
    },
    ...rawJson,
  };
}

function hashString(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildSchemaHash(graph: ConvexSchemaGraph): string {
  return hashString(JSON.stringify(graph));
}

function stringifyJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function buildRawSchemaJsonStorage(args: {
  activeSchemaJson?: string;
  graph: ConvexSchemaGraph;
  inferredShapes: unknown;
  warnings: string[];
}): {
  declaredSchemaJson?: string;
  inferredSchemaJson?: string;
} {
  const graphLength = JSON.stringify(args.graph).length;
  let remainingBudget = Math.min(
    CONVEX_SCHEMA_RAW_JSON_TOTAL_MAX_LENGTH,
    CONVEX_SCHEMA_SNAPSHOT_DOCUMENT_SOFT_LIMIT - graphLength,
  );
  if (remainingBudget <= 0) {
    if (args.activeSchemaJson) {
      args.warnings.push("Declared schema JSON was too large to store with the snapshot.");
    }
    args.warnings.push("Inferred schema JSON was too large to store with the snapshot.");
    return {};
  }

  const storage: {
    declaredSchemaJson?: string;
    inferredSchemaJson?: string;
  } = {};
  if (args.activeSchemaJson) {
    if (args.activeSchemaJson.length <= remainingBudget) {
      storage.declaredSchemaJson = args.activeSchemaJson;
      remainingBudget -= args.activeSchemaJson.length;
    } else {
      args.warnings.push("Declared schema JSON was too large to store with the snapshot.");
    }
  }

  const inferredSchemaJson = stringifyJson(args.inferredShapes);
  if (inferredSchemaJson !== undefined && inferredSchemaJson.length <= remainingBudget) {
    storage.inferredSchemaJson = inferredSchemaJson;
  } else {
    args.warnings.push("Inferred schema JSON was too large to store with the snapshot.");
  }

  return storage;
}

export const get = query({
  access: "access_schema_graph",
  args: {
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: union(vConvexSchemaGraphStateResult, v.null()),
  handler: async (ctx, args): Promise<ConvexSchemaGraphStateResult | null> => {
    const repository = await findRepositoryForUser(ctx.db, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
    });
    if (!isLiveConnectedRepository(repository)) {
      return null;
    }

    const project = await ctx.db.get(args.convexProjectId);
    if (
      !project ||
      project.repositoryId !== args.repositoryId ||
      project.organizationId !== repository.organizationId ||
      project.teamId !== repository.convexTeamId
    ) {
      return null;
    }

    const [snapshot, layoutRows] = await Promise.all([
      ctx.db
        .query("observations_repositoryConvexSchema_snapshots")
        .withIndex("by_project_and_fetched_at", (q) => q.eq("convexProjectId", project._id))
        .order("desc")
        .first(),
      ctx.db
        .query("ui_repositoryConvexSchemaGraph_nodeLayouts")
        .withIndex("by_user_repository_project", (q) =>
          q
            .eq("userId", ctx.viewer.userId)
            .eq("repositoryId", args.repositoryId)
            .eq("convexProjectId", project._id),
        )
        .collect(),
    ]);

    return {
      project: readProjectOption(project),
      snapshot: snapshot
        ? {
            _id: snapshot._id,
            fetchedAt: snapshot.fetchedAt,
            schemaHash: snapshot.schemaHash,
            graph: snapshot.graph,
          }
        : null,
      layout: layoutRows
        .map((row) => ({
          nodeId: row.nodeId,
          x: row.x,
          y: row.y,
        }))
        .sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    };
  },
});

export const saveLayout = mutation({
  access: "access_schema_graph",
  args: {
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
    nodeId: string(),
    x: number(),
    y: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repository = await findRepositoryForUser(ctx.db, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
    });
    const project = await ctx.db.get(args.convexProjectId);
    if (
      !isLiveConnectedRepository(repository) ||
      !project ||
      project.repositoryId !== args.repositoryId ||
      project.organizationId !== repository.organizationId
    ) {
      throw new Error("Convex project not found.");
    }

    const snapshot = await ctx.db
      .query("observations_repositoryConvexSchema_snapshots")
      .withIndex("by_project_and_fetched_at", (q) => q.eq("convexProjectId", args.convexProjectId))
      .order("desc")
      .first();
    const tableName = readSchemaGraphLayoutTableName(args.nodeId);
    if (!snapshot?.graph.tables.some((table) => table.name === tableName)) {
      throw new Error("Convex schema table not found.");
    }

    const existing = await ctx.db
      .query("ui_repositoryConvexSchemaGraph_nodeLayouts")
      .withIndex("by_user_repository_project_node", (q) =>
        q
          .eq("userId", ctx.viewer.userId)
          .eq("repositoryId", args.repositoryId)
          .eq("convexProjectId", args.convexProjectId)
          .eq("nodeId", args.nodeId),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        x: args.x,
        y: args.y,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("ui_repositoryConvexSchemaGraph_nodeLayouts", {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
      convexProjectId: args.convexProjectId,
      nodeId: args.nodeId,
      x: args.x,
      y: args.y,
      updatedAt: now,
    });
    return null;
  },
});

export const refresh = action({
  access: "access_schema_graph",
  args: {
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: object({ snapshotId: id("observations_repositoryConvexSchema_snapshots") }),
  handler: async (
    ctx,
    args,
  ): Promise<{ snapshotId: Id<"observations_repositoryConvexSchema_snapshots"> }> => {
    const target = await ctx.runQuery(internal.repository.convexDeploymentInspection.readTarget, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
      convexProjectId: args.convexProjectId,
    });
    const deployment: ConvexCloudDeployment | null = await readConvexProductionDeployment({
      token: target.token,
      projectId: target.project.projectId,
    });
    if (!deployment) {
      throw new Error("Convex project has no production deployment.");
    }

    const fetched = await withConvexInspectionDeployKey(
      { deployment, purpose: "schema", target },
      async (deployKey) =>
        await fetchConvexSchemaGraph({
          deployKey,
          deploymentUrl: deployment.deploymentUrl,
        }),
    );
    const graph = fetched.graph;
    const snapshotId = await ctx.runMutation(internal.repository.convexSchemaGraph.recordSnapshot, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
      convexProjectId: target.project._id,
      deploymentName: deployment.name,
      schemaHash: buildSchemaHash(graph),
      graph,
      declaredSchemaJson: fetched.declaredSchemaJson,
      inferredSchemaJson: fetched.inferredSchemaJson,
      fetchedAt: Date.now(),
    });
    return { snapshotId };
  },
});

async function pruneSchemaSnapshots(
  ctx: MutationCtx,
  convexProjectId: Id<"repositoryConvexProjects">,
): Promise<void> {
  const snapshots = await ctx.db
    .query("observations_repositoryConvexSchema_snapshots")
    .withIndex("by_project_and_fetched_at", (q) => q.eq("convexProjectId", convexProjectId))
    .order("desc")
    .take(CONVEX_SCHEMA_SNAPSHOT_RETENTION_COUNT + 1);
  for (const snapshot of snapshots.slice(CONVEX_SCHEMA_SNAPSHOT_RETENTION_COUNT)) {
    await ctx.db.delete(snapshot._id);
  }
}

export const recordSnapshot = internalMutation({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
    deploymentName: string(),
    schemaHash: string(),
    graph: vConvexSchemaGraph,
    declaredSchemaJson: optional(string()),
    inferredSchemaJson: optional(string()),
    fetchedAt: number(),
  },
  returns: id("observations_repositoryConvexSchema_snapshots"),
  handler: async (ctx, args): Promise<Id<"observations_repositoryConvexSchema_snapshots">> => {
    const repository = await requireRepositoryForUser(ctx.db, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    const project = await ctx.db.get(args.convexProjectId);
    if (
      !project ||
      project.repositoryId !== args.repositoryId ||
      project.organizationId !== repository.organizationId
    ) {
      throw new Error("Convex project not found.");
    }
    const latestSnapshot = await ctx.db
      .query("observations_repositoryConvexSchema_snapshots")
      .withIndex("by_project_and_fetched_at", (q) => q.eq("convexProjectId", args.convexProjectId))
      .order("desc")
      .first();
    if (latestSnapshot?.schemaHash === args.schemaHash) {
      await ctx.db.patch(latestSnapshot._id, {
        fetchedAt: args.fetchedAt,
      });
      await pruneSchemaSnapshots(ctx, args.convexProjectId);
      return latestSnapshot._id;
    }

    const snapshotId = await ctx.db.insert("observations_repositoryConvexSchema_snapshots", {
      repositoryId: args.repositoryId,
      convexProjectId: args.convexProjectId,
      deploymentName: args.deploymentName,
      schemaHash: args.schemaHash,
      graph: args.graph,
      declaredSchemaJson: args.declaredSchemaJson,
      inferredSchemaJson: args.inferredSchemaJson,
      fetchedAt: args.fetchedAt,
    });
    await pruneSchemaSnapshots(ctx, args.convexProjectId);
    return snapshotId;
  },
});
