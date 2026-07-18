import { Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { action, mutation, query } from "../functions";
import { isRecord, readBoolean, readString, toErrorMessage } from "../jsonUtils";
import { isLiveConnectedVault } from "./state";
import {
  createConvexDeploymentDeployKey,
  deleteConvexDeploymentDeployKey,
  type ConvexDeployKeyAllowedAction,
  type ConvexDeployKeyAuthMethod,
} from "./convexDeployKeys";
import { requireActiveConvexTeam } from "./convexTeam";
import {
  vConvexSchemaGraph,
  type ConvexSchemaGraph,
  type ConvexSchemaGraphField,
  type ConvexSchemaGraphFieldSource,
  type ConvexSchemaGraphIndex,
  type ConvexSchemaGraphRelationship,
  type ConvexSchemaGraphTable,
  type ConvexSchemaGraphTableSource,
} from "./convexSchemaGraphModel";
import { vaultAppResourceTables } from "./model";

const { array, id, literal, null: nullValue, number, object, optional, string, union } = v;

type ConvexSchemaRefreshTarget = {
  authMethod: ConvexDeployKeyAuthMethod;
  deployment: Doc<"vaultConvexDeployments">;
  token: string;
};
type VaultConvexDeploymentContext = {
  app: Doc<"vaultApps">;
  deployment: Doc<"vaultConvexDeployments">;
};
type ConvexSystemQueryResponse = {
  value: unknown;
};
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

const CONVEX_SCHEMA_REFRESH_TIMEOUT_MS = 10_000;
const CONVEX_SCHEMA_INSPECTION_KEY_TTL_MS = 31 * 60 * 1000;
const CONVEX_SCHEMA_SNAPSHOT_DOCUMENT_SOFT_LIMIT = 900_000;
const CONVEX_SCHEMA_RAW_JSON_TOTAL_MAX_LENGTH = 500_000;
const CONVEX_SCHEMA_SNAPSHOT_RETENTION_COUNT = 5;
const CONVEX_SCHEMA_TABLE_COUNT_CONCURRENCY = 8;
const CONVEX_SCHEMA_DEPLOY_KEY_ALLOWED_ACTIONS = [
  "deployment:data:view",
] satisfies ConvexDeployKeyAllowedAction[];

const vConvexProviderAuthMethod = union(literal("api_key"), literal("oauth"));
const vConnectedConvexDeployment = vaultAppResourceTables.vaultConvexDeployments.validator.extend({
  _id: id("vaultConvexDeployments"),
  _creationTime: number(),
});

const vConvexSchemaRefreshTarget = object({
  token: string(),
  authMethod: vConvexProviderAuthMethod,
  deployment: vConnectedConvexDeployment,
});

const vConvexSchemaGraphLayoutPoint = object({
  nodeId: string(),
  x: number(),
  y: number(),
});

const vConvexSchemaGraphDeploymentOption = object({
  _id: id("vaultConvexDeployments"),
  appId: id("vaultApps"),
  rootDirectory: string(),
  deploymentName: string(),
  projectSlug: string(),
  teamSlug: string(),
});

const vConvexSchemaGraphSnapshotResult = object({
  _id: id("vaultConvexSchemaSnapshots"),
  fetchedAt: number(),
  schemaHash: string(),
  graph: vConvexSchemaGraph,
});

const vConvexSchemaGraphStateResult = object({
  deployments: array(vConvexSchemaGraphDeploymentOption),
  selectedDeploymentId: union(id("vaultConvexDeployments"), nullValue()),
  snapshot: union(vConvexSchemaGraphSnapshotResult, nullValue()),
  layout: array(vConvexSchemaGraphLayoutPoint),
});
export type ConvexSchemaGraphStateResult = Infer<typeof vConvexSchemaGraphStateResult>;

function compareDeploymentSortOrder(
  left: VaultConvexDeploymentContext,
  right: VaultConvexDeploymentContext,
): number {
  return (
    left.app.rootDirectory.localeCompare(right.app.rootDirectory) ||
    left.deployment.projectSlug.localeCompare(right.deployment.projectSlug) ||
    left.deployment.projectId.localeCompare(right.deployment.projectId) ||
    left.deployment._id.localeCompare(right.deployment._id)
  );
}

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

async function readDeploymentsForVault(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<VaultConvexDeploymentContext[]> {
  const [apps, deployments] = await Promise.all([
    ctx.db
      .query("vaultApps")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .collect(),
    ctx.db
      .query("vaultConvexDeployments")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .collect(),
  ]);
  const appsById = new Map(apps.map((app) => [app._id, app]));
  const contexts = deployments.map((deployment) => {
    const app = appsById.get(deployment.appId);
    if (!app || app.userId !== deployment.userId) {
      throw new Error("Convex deployment has inconsistent app ownership.");
    }
    return { app, deployment };
  });
  return contexts.sort(compareDeploymentSortOrder);
}

function selectDeployment(args: {
  deployments: VaultConvexDeploymentContext[];
  deploymentId?: string;
}): VaultConvexDeploymentContext | null {
  if (args.deploymentId !== undefined) {
    return args.deployments.find(({ deployment }) => deployment._id === args.deploymentId) ?? null;
  }
  return args.deployments[0] ?? null;
}

function readActiveSchemaJson(schemaResponse: unknown): string | undefined {
  if (!isRecord(schemaResponse)) {
    return undefined;
  }
  const value = schemaResponse.value;
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

function readSystemQueryResponse(response: unknown): ConvexSystemQueryResponse | null {
  if (!isRecord(response) || !("value" in response)) {
    return null;
  }
  return { value: response.value };
}

function buildConvexInspectionDeployKeyName(deploymentName: string): string {
  const timestamp = Date.now().toString(36);
  const normalizedDeploymentName = deploymentName.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40);
  return `samebase-schema-${normalizedDeploymentName}-${timestamp}`;
}

async function createConvexInspectionDeployKey(args: {
  authMethod: ConvexDeployKeyAuthMethod;
  deploymentName: string;
  token: string;
}): Promise<{ deployKey: string; name: string }> {
  const name = buildConvexInspectionDeployKeyName(args.deploymentName);
  const expiresAt = Date.now() + CONVEX_SCHEMA_INSPECTION_KEY_TTL_MS;
  const deployKey = await createConvexDeploymentDeployKey({
    allowedActions: CONVEX_SCHEMA_DEPLOY_KEY_ALLOWED_ACTIONS,
    authMethod: args.authMethod,
    deploymentName: args.deploymentName,
    expiresAt,
    name,
    token: args.token,
  });
  return { deployKey, name };
}

async function deleteConvexInspectionDeployKey(args: {
  deploymentName: string;
  name: string;
  token: string;
}): Promise<void> {
  await deleteConvexDeploymentDeployKey({
    deploymentName: args.deploymentName,
    name: args.name,
    token: args.token,
  });
}

async function fetchConvexDeploymentJson(args: {
  deployKey: string;
  deploymentUrl: string;
  path: string;
  body?: unknown;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CONVEX_SCHEMA_REFRESH_TIMEOUT_MS);
  const headers = new Headers({
    Authorization: `Convex ${args.deployKey}`,
    "Content-Type": "application/json",
  });
  let body: string | undefined;
  if (args.body !== undefined) {
    body = JSON.stringify(args.body);
  }

  try {
    const response = await fetch(new Request(`${args.deploymentUrl}${args.path}`), {
      method: args.body === undefined ? "GET" : "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Convex deployment request failed: ${response.status} ${response.statusText}`,
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Convex deployment request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchConvexSystemQuery(args: {
  deployKey: string;
  deploymentUrl: string;
  path: string;
  queryArgs: unknown;
}): Promise<ConvexSystemQueryResponse | null> {
  const response = await fetchConvexDeploymentJson({
    deployKey: args.deployKey,
    deploymentUrl: args.deploymentUrl,
    path: "/api/query",
    body: {
      path: args.path,
      args: args.queryArgs,
      format: "json",
    },
  });
  return readSystemQueryResponse(response);
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
  if (!isRecord(schema) || !Array.isArray(schema.tables)) {
    return [];
  }

  const tables: DeclaredTable[] = [];
  for (const value of schema.tables) {
    if (!isRecord(value)) {
      continue;
    }
    const tableName = readString(value, "tableName");
    if (!tableName || tableName.startsWith("_")) {
      continue;
    }
    tables.push({
      tableName,
      documentType: value.documentType,
      indexes: readDeclaredIndexes(value.indexes),
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
    const fieldsValue = index.fields;
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
  const fieldType = value.fieldType;
  if (fieldType !== undefined) {
    const wrappedOptional = readBoolean(value, "optional") ?? false;
    const unwrapped = unwrapConvexFieldType(fieldType);
    return {
      optional: wrappedOptional || unwrapped.optional,
      value: unwrapped.value,
    };
  }
  if (value.type === "optional") {
    const inner = value.inner ?? value.value;
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
      return `array<${formatDeclaredType(unwrapped.value.value)}>`;
    }
    case "record": {
      return `record<${formatDeclaredType(unwrapped.value.value)}>`;
    }
    case "union": {
      const values = unwrapped.value.value;
      if (!Array.isArray(values)) {
        return "union";
      }
      return values.map(formatDeclaredType).join(" | ");
    }
    case "literal": {
      const literalValue = unwrapped.value.value;
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
  if (unwrapped.value.type === "id") {
    const tableName = readString(unwrapped.value, "tableName");
    return tableName ? [tableName] : [];
  }
  if (unwrapped.value.type === "union" && Array.isArray(unwrapped.value.value)) {
    return uniqueSortedStrings(unwrapped.value.value.flatMap(readDeclaredTargetTables));
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

  if (type === "object" && isRecord(unwrapped.value.value)) {
    for (const [name, fieldValue] of Object.entries(unwrapped.value.value)) {
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
      value: unwrapped.value.value,
    });
    return;
  }

  if (type === "record") {
    collectDeclaredFields({
      ...args,
      optional,
      path: args.path.length > 0 ? `${args.path}.*` : "*",
      skipCurrentField: false,
      value: unwrapped.value.value,
    });
    return;
  }

  if (type === "union" && Array.isArray(unwrapped.value.value)) {
    for (const member of unwrapped.value.value) {
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
      return `array<${formatInferredShapeType(value.shape)}>`;
    case "Set":
      return `set<${formatInferredShapeType(value.shape)}>`;
    case "Map":
      return `map<${formatInferredShapeType(value.shape)}>`;
    case "Object":
      return "object";
    case "Union": {
      const shapes = value.shapes;
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
  if (type === "Union" && Array.isArray(value.shapes)) {
    return uniqueSortedStrings(value.shapes.flatMap(readInferredTargetTables));
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

  if (type === "Object" && Array.isArray(args.value.fields)) {
    for (const field of args.value.fields) {
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
        value: field.shape,
      });
    }
    return;
  }

  if (type === "Array" || type === "Set") {
    collectInferredFields({
      ...args,
      path: args.path.length > 0 ? `${args.path}[]` : "[]",
      skipCurrentField: false,
      value: args.value.shape,
    });
    return;
  }

  if (type === "Map") {
    collectInferredFields({
      ...args,
      path: args.path.length > 0 ? `${args.path}.*` : "*",
      skipCurrentField: false,
      value: args.value.shape,
    });
    return;
  }

  if (type === "Union" && Array.isArray(args.value.shapes)) {
    for (const shape of args.value.shapes) {
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
    vaultId: id("vaults"),
    // Route parameters are untrusted strings. A match below promotes the value
    // to the stored deployment document without asserting an Id.
    deploymentId: optional(string()),
  },
  returns: union(vConvexSchemaGraphStateResult, nullValue()),
  handler: async (ctx, args): Promise<ConvexSchemaGraphStateResult | null> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== ctx.viewer.userId) {
      return null;
    }

    const deployments = await readDeploymentsForVault(ctx, args.vaultId);
    const selectedDeploymentContext = selectDeployment({
      deployments,
      deploymentId: args.deploymentId,
    });
    const deploymentOptions = deployments.map(({ app, deployment }) => ({
      _id: deployment._id,
      appId: app._id,
      rootDirectory: app.rootDirectory,
      deploymentName: deployment.deploymentName,
      projectSlug: deployment.projectSlug,
      teamSlug: deployment.teamSlug,
    }));
    if (!selectedDeploymentContext) {
      return {
        deployments: deploymentOptions,
        selectedDeploymentId: null,
        snapshot: null,
        layout: [],
      };
    }
    const selectedDeployment = selectedDeploymentContext.deployment;

    const [snapshot, layoutRows] = await Promise.all([
      ctx.db
        .query("vaultConvexSchemaSnapshots")
        .withIndex("by_deployment_and_fetched_at", (q) =>
          q.eq("deploymentId", selectedDeployment._id),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("vaultConvexSchemaGraphLayouts")
        .withIndex("by_user_vault_deployment", (q) =>
          q
            .eq("userId", ctx.viewer.userId)
            .eq("vaultId", args.vaultId)
            .eq("deploymentId", selectedDeployment._id),
        )
        .collect(),
    ]);

    return {
      deployments: deploymentOptions,
      selectedDeploymentId: selectedDeployment._id,
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
    vaultId: id("vaults"),
    deploymentId: id("vaultConvexDeployments"),
    nodeId: string(),
    x: number(),
    y: number(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    const deployment = await ctx.db.get(args.deploymentId);
    if (
      !isLiveConnectedVault(vault) ||
      vault.userId !== ctx.viewer.userId ||
      !deployment ||
      deployment.vaultId !== args.vaultId ||
      deployment.userId !== ctx.viewer.userId
    ) {
      throw new Error("Convex deployment not found.");
    }

    const snapshot = await ctx.db
      .query("vaultConvexSchemaSnapshots")
      .withIndex("by_deployment_and_fetched_at", (q) => q.eq("deploymentId", args.deploymentId))
      .order("desc")
      .first();
    const tableName = readSchemaGraphLayoutTableName(args.nodeId);
    if (!snapshot?.graph.tables.some((table) => table.name === tableName)) {
      throw new Error("Convex schema table not found.");
    }

    const existing = await ctx.db
      .query("vaultConvexSchemaGraphLayouts")
      .withIndex("by_user_vault_deployment_node", (q) =>
        q
          .eq("userId", ctx.viewer.userId)
          .eq("vaultId", args.vaultId)
          .eq("deploymentId", args.deploymentId)
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

    await ctx.db.insert("vaultConvexSchemaGraphLayouts", {
      userId: ctx.viewer.userId,
      vaultId: args.vaultId,
      deploymentId: args.deploymentId,
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
    vaultId: id("vaults"),
    deploymentId: optional(id("vaultConvexDeployments")),
  },
  returns: object({ snapshotId: id("vaultConvexSchemaSnapshots") }),
  handler: async (ctx, args): Promise<{ snapshotId: Id<"vaultConvexSchemaSnapshots"> }> => {
    const target = await ctx.runQuery(internal.vault.convexSchemaGraph.readRefreshTarget, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
      deploymentId: args.deploymentId,
    });
    let deployKey: string | null = null;
    let deployKeyName: string | null = null;
    try {
      const createdDeployKey = await createConvexInspectionDeployKey({
        authMethod: target.authMethod,
        deploymentName: target.deployment.deploymentName,
        token: target.token,
      });
      deployKey = createdDeployKey.deployKey;
      deployKeyName = createdDeployKey.name;
      const fetched = await fetchConvexSchemaGraph({
        deployKey,
        deploymentUrl: target.deployment.cloudUrl,
      });
      const graph = fetched.graph;
      const snapshotId = await ctx.runMutation(internal.vault.convexSchemaGraph.recordSnapshot, {
        userId: ctx.viewer.userId,
        vaultId: args.vaultId,
        deploymentId: target.deployment._id,
        deploymentName: target.deployment.deploymentName,
        schemaHash: buildSchemaHash(graph),
        graph,
        declaredSchemaJson: fetched.declaredSchemaJson,
        inferredSchemaJson: fetched.inferredSchemaJson,
        fetchedAt: Date.now(),
      });
      return { snapshotId };
    } finally {
      if (deployKeyName) {
        try {
          await deleteConvexInspectionDeployKey({
            deploymentName: target.deployment.deploymentName,
            name: deployKeyName,
            token: target.token,
          });
        } catch (error) {
          console.warn("convex_schema_graph:deploy_key_cleanup_failed", {
            deploymentName: target.deployment.deploymentName,
            message: toErrorMessage(error),
          });
        }
      }
    }
  },
});

export const readRefreshTarget = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    deploymentId: optional(id("vaultConvexDeployments")),
  },
  returns: vConvexSchemaRefreshTarget,
  handler: async (ctx, args): Promise<ConvexSchemaRefreshTarget> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const deployments = await readDeploymentsForVault(ctx, args.vaultId);
    const deploymentContext = selectDeployment({
      deployments,
      deploymentId: args.deploymentId,
    });
    const deployment = deploymentContext?.deployment;
    if (!deployment || deployment.userId !== args.userId) {
      throw new Error("Convex deployment not found.");
    }

    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_kind", (q) => q.eq("userId", args.userId).eq("kind", "convex"))
      .first();
    if (connection?.kind !== "convex") {
      throw new Error("Convex connection is required.");
    }
    const token = connection.auth.credential.trim();
    if (!token || !connection.teamId.trim()) {
      throw new Error("Convex connection is required.");
    }
    requireActiveConvexTeam({
      activeTeamId: connection.teamId,
      targetTeamId: deployment.teamId,
    });

    return {
      token,
      authMethod: connection.auth.method,
      deployment,
    };
  },
});

async function pruneSchemaSnapshots(
  ctx: MutationCtx,
  deploymentId: Id<"vaultConvexDeployments">,
): Promise<void> {
  const snapshots = await ctx.db
    .query("vaultConvexSchemaSnapshots")
    .withIndex("by_deployment_and_fetched_at", (q) => q.eq("deploymentId", deploymentId))
    .order("desc")
    .take(CONVEX_SCHEMA_SNAPSHOT_RETENTION_COUNT + 1);
  for (const snapshot of snapshots.slice(CONVEX_SCHEMA_SNAPSHOT_RETENTION_COUNT)) {
    await ctx.db.delete(snapshot._id);
  }
}

export const recordSnapshot = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    deploymentId: id("vaultConvexDeployments"),
    deploymentName: string(),
    schemaHash: string(),
    graph: vConvexSchemaGraph,
    declaredSchemaJson: optional(string()),
    inferredSchemaJson: optional(string()),
    fetchedAt: number(),
  },
  returns: id("vaultConvexSchemaSnapshots"),
  handler: async (ctx, args): Promise<Id<"vaultConvexSchemaSnapshots">> => {
    const deployment = await ctx.db.get(args.deploymentId);
    if (
      !deployment ||
      deployment.userId !== args.userId ||
      deployment.vaultId !== args.vaultId ||
      deployment.deploymentName !== args.deploymentName
    ) {
      throw new Error("Convex deployment not found.");
    }

    const latestSnapshot = await ctx.db
      .query("vaultConvexSchemaSnapshots")
      .withIndex("by_deployment_and_fetched_at", (q) => q.eq("deploymentId", args.deploymentId))
      .order("desc")
      .first();
    if (latestSnapshot?.schemaHash === args.schemaHash) {
      await ctx.db.patch(latestSnapshot._id, {
        fetchedAt: args.fetchedAt,
      });
      await ctx.db.patch(args.deploymentId, {
        lastObservedAt: args.fetchedAt,
      });
      await pruneSchemaSnapshots(ctx, args.deploymentId);
      return latestSnapshot._id;
    }

    const snapshotId = await ctx.db.insert("vaultConvexSchemaSnapshots", {
      userId: args.userId,
      vaultId: args.vaultId,
      deploymentId: args.deploymentId,
      deploymentName: args.deploymentName,
      schemaHash: args.schemaHash,
      graph: args.graph,
      declaredSchemaJson: args.declaredSchemaJson,
      inferredSchemaJson: args.inferredSchemaJson,
      fetchedAt: args.fetchedAt,
    });
    await ctx.db.patch(args.deploymentId, {
      lastObservedAt: args.fetchedAt,
    });
    await pruneSchemaSnapshots(ctx, args.deploymentId);
    return snapshotId;
  },
});
