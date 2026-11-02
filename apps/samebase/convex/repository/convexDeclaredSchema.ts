import { isRecord, readBoolean, readString } from "../jsonUtils";
import type {
  RepositoryConvexSchemaGraphField as ConvexSchemaGraphField,
  RepositoryConvexSchemaGraphFieldSource as ConvexSchemaGraphFieldSource,
  RepositoryConvexSchemaGraphIndex as ConvexSchemaGraphIndex,
} from "./convexSchemaGraphModel";

type DeclaredTable = {
  documentType: unknown;
  indexes: ConvexSchemaGraphIndex[];
  tableName: string;
};
type FieldCollectorArgs = {
  fields: Map<string, ConvexSchemaGraphField>;
  optional: boolean;
  path: string;
  skipCurrentField?: boolean;
  source: ConvexSchemaGraphFieldSource;
  value: unknown;
};

function compareGraphField(left: ConvexSchemaGraphField, right: ConvexSchemaGraphField): number {
  return (
    left.path.localeCompare(right.path) ||
    left.source.localeCompare(right.source) ||
    readFieldTargetTables(left).join("\0").localeCompare(readFieldTargetTables(right).join("\0")) ||
    left.kind.localeCompare(right.kind)
  );
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

export function readDeclaredTables(schema: unknown): DeclaredTable[] {
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

export function fieldsFromDeclaredDocumentType(documentType: unknown): ConvexSchemaGraphField[] {
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
