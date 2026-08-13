import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { standaloneCode } from "ajv/dist/standalone/index.js";
import openapiTS, {
  astToString,
  COMMENT_HEADER,
  STRING,
  type OpenAPI3,
  type SchemaObject,
  type TransformNodeOptions,
} from "openapi-typescript";
import { isRecord } from "@samebase/dependent/main";

import { samebaseAppFilePath } from "../../../scripts/lib/trackedFilePath.ts";

const sourceUrl = "https://api.convex.dev/v1/openapi.json";
const convexManagementOpenApiSchemaId = "https://api.convex.dev/v1/openapi.json";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const openApiDocumentOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/convexManagementApi/openApi.generated.json")}`,
    import.meta.url,
  ),
);
const validatorsOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/convexManagementApi/validators.generated.js")}`,
    import.meta.url,
  ),
);
const validatorTypesOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/convexManagementApi/validators.generated.d.ts")}`,
    import.meta.url,
  ),
);
const typesOutputPath = samebaseAppFilePath("convex/convexManagementApi/types.generated.d.ts");
const typesOutputFilePath = fileURLToPath(new URL(`../${typesOutputPath}`, import.meta.url));
const generatedFormatPaths = [
  samebaseAppFilePath("convex/convexManagementApi/openApi.generated.json"),
  typesOutputPath,
  samebaseAppFilePath("convex/convexManagementApi/validators.generated.js"),
  samebaseAppFilePath("convex/convexManagementApi/validators.generated.d.ts"),
];

/**
Convex publishes these identifiers as int64 schemas, but Samebase treats provider
IDs as opaque decimal strings so large values cannot lose precision in JS.
*/
const convexManagementDecimalIdSchemaNames = [
  "AccessTokenId",
  "CustomRoleId",
  "DeploymentId",
  "MemberId",
  "ProjectId",
  "TeamId",
] as const;
const convexManagementDecimalIdSchemaRefs = new Set(
  convexManagementDecimalIdSchemaNames.map((schemaName) => `#/components/schemas/${schemaName}`),
);

const convexManagementOperationMethods = ["get", "post"] as const;

type ConvexManagementOperationMethod = (typeof convexManagementOperationMethods)[number];

type ConvexManagementResponseNumberPathKind = "decimalId" | "safeNumber";

type ConvexManagementResponseNumberPath = {
  kind: ConvexManagementResponseNumberPathKind;
  path: string[];
};

type ConvexManagementResponseValidatorEntry = {
  method: ConvexManagementOperationMethod;
  path: string;
  operationId: string;
  exportName: string | null;
  schema: AnySchema | null;
  schemaId: string | null;
  decimalPaths: string[][];
};

// openapi-fetch gives callsites compile-time path/body/response types, but it
// does not runtime-validate provider JSON. Convex cannot compile AJV schemas at
// request time, so this script emits standalone validators during generation.
const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
}

const documentText = await response.text();
const documentJson = parseJsonSchemaDocument(documentText);
const validationDocumentJson = normalizeConvexManagementValidationDocument(documentJson);
const responseValidatorEntries = collectConvexManagementResponseValidatorEntries(documentJson);
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: false,
  validateSchema: false,
});
ajv.addFormat("int32", true);
ajv.addFormat("int64", true);
const validatorSchemaIds = buildConvexManagementValidatorSchemaIds(responseValidatorEntries);

function parseJsonSchemaDocument(documentText: string): OpenAPI3 {
  const payload: unknown = JSON.parse(documentText);
  if (isOpenApiDocument(payload)) {
    return payload;
  }
  throw new Error(`${sourceUrl} did not return an OpenAPI document.`);
}

// eslint-disable-next-line samebase/no-hand-written-type-predicate -- index-signature schema shape over unknown: control flow earns only boolean | object, never ajv's AnySchema object shape
function isJsonSchemaDocument(payload: unknown): payload is AnySchema {
  return (
    typeof payload === "boolean" ||
    (!!payload && typeof payload === "object" && !Array.isArray(payload))
  );
}

// eslint-disable-next-line samebase/no-hand-written-type-predicate -- fetched-document interface over unknown: the probes witness openapi/info as records, never the nested OpenAPI3 interface
function isOpenApiDocument(payload: unknown): payload is OpenAPI3 {
  return isRecord(payload) && typeof payload.openapi === "string" && isRecord(payload.info);
}

function normalizeConvexManagementValidationDocument(document: OpenAPI3): AnySchema {
  const normalizedDocument: unknown = structuredClone(document);
  const schemas = readRecordPath(normalizedDocument, ["components", "schemas"]);

  for (const schemaName of convexManagementDecimalIdSchemaNames) {
    const schema = schemas[schemaName];
    if (!isRecord(schema) || schema.type !== "integer" || schema.format !== "int64") {
      throw new Error(`${sourceUrl} schema ${schemaName} is no longer an int64 schema.`);
    }
    schemas[schemaName] = {
      description: schema.description,
      pattern: "^[0-9]+$",
      type: "string",
    };
  }

  if (isJsonSchemaDocument(normalizedDocument)) {
    return normalizedDocument;
  }
  throw new Error("Failed to build normalized Convex Management API schema.");
}

function readRecordPath(root: unknown, pathSegments: readonly string[]): Record<string, unknown> {
  let value = root;
  for (const segment of pathSegments) {
    if (!isRecord(value)) {
      throw new Error(`Expected ${pathSegments.join(".")} to be an object.`);
    }
    value = value[segment];
  }
  if (isRecord(value)) {
    return value;
  }
  throw new Error(`Expected ${pathSegments.join(".")} to be an object.`);
}

function collectConvexManagementResponseValidatorEntries(
  document: OpenAPI3,
): ConvexManagementResponseValidatorEntry[] {
  const paths = readRecordPath(document, ["paths"]);
  const entries: ConvexManagementResponseValidatorEntry[] = [];
  const usedExportNames = new Set<string>();

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      throw new Error(`Expected path ${path} to be an object.`);
    }
    for (const method of convexManagementOperationMethods) {
      const operation = pathItem[method];
      if (operation === undefined) {
        continue;
      }
      if (!isRecord(operation)) {
        throw new Error(`Expected ${method.toUpperCase()} ${path} to be an object.`);
      }
      const operationId = operation["operationId"];
      if (typeof operationId !== "string" || !operationId) {
        throw new Error(`Expected ${method.toUpperCase()} ${path} to have an operationId.`);
      }

      const schemas = readSuccessJsonResponseSchemas({
        method,
        operation,
        path,
      });
      const exportName =
        schemas.length === 0
          ? null
          : buildUniqueValidatorExportName({
              method,
              operationId,
              path,
              usedExportNames,
            });
      const schemaId =
        exportName === null ? null : `samebase://convex-management-api/${exportName}`;

      entries.push({
        method,
        path,
        operationId,
        exportName,
        schema: combineJsonResponseSchemas(schemas),
        schemaId,
        decimalPaths: collectConvexManagementDecimalPaths({
          document,
          method,
          path,
          schemas,
        }),
      });
    }
  }

  return entries;
}

function collectConvexManagementDecimalPaths(args: {
  document: OpenAPI3;
  method: ConvexManagementOperationMethod;
  path: string;
  schemas: AnySchema[];
}): string[][] {
  const numberPaths = new Map<string, ConvexManagementResponseNumberPath>();
  const endpointLabel = `${args.method.toUpperCase()} ${args.path}`;
  for (const schema of args.schemas) {
    collectConvexManagementDecimalPathsForSchema({
      document: args.document,
      endpointLabel,
      numberPaths,
      path: [],
      schema,
      seenRefs: new Set(),
    });
  }
  return Array.from(numberPaths.values())
    .filter((numberPath) => numberPath.kind === "decimalId")
    .map((numberPath) => numberPath.path)
    .sort(compareConvexManagementDecimalPaths);
}

function collectConvexManagementDecimalPathsForSchema(args: {
  document: OpenAPI3;
  endpointLabel: string;
  numberPaths: Map<string, ConvexManagementResponseNumberPath>;
  path: string[];
  schema: unknown;
  seenRefs: Set<string>;
}): void {
  if (!isRecord(args.schema)) {
    return;
  }

  const ref = args.schema["$ref"];
  if (typeof ref === "string") {
    if (convexManagementDecimalIdSchemaRefs.has(readConvexManagementLocalRef(ref))) {
      addConvexManagementResponseNumberPath({
        ...args,
        kind: "decimalId",
      });
      return;
    }

    if (args.seenRefs.has(ref)) {
      return;
    }
    const resolvedSchema = readConvexManagementOpenApiRef(args.document, ref);
    const nextSeenRefs = new Set(args.seenRefs);
    nextSeenRefs.add(ref);
    collectConvexManagementDecimalPathsForSchema({
      ...args,
      schema: resolvedSchema,
      seenRefs: nextSeenRefs,
    });
    return;
  }

  if (isConvexManagementNumericSchema(args.schema)) {
    addConvexManagementResponseNumberPath({
      ...args,
      kind: "safeNumber",
    });
  }

  const arrayItems = args.schema.items;
  if (arrayItems !== undefined) {
    collectConvexManagementDecimalPathsForSchema({
      ...args,
      path: [...args.path, "*"],
      schema: arrayItems,
    });
  }

  const properties = args.schema.properties;
  if (isRecord(properties)) {
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      collectConvexManagementDecimalPathsForSchema({
        ...args,
        path: [...args.path, propertyName],
        schema: propertySchema,
      });
    }
  }

  for (const key of ["oneOf", "anyOf", "allOf"]) {
    const schemas = args.schema[key];
    if (!Array.isArray(schemas)) {
      continue;
    }
    for (const schema of schemas) {
      collectConvexManagementDecimalPathsForSchema({
        ...args,
        schema,
      });
    }
  }

  const additionalProperties = args.schema.additionalProperties;
  if (isRecord(additionalProperties)) {
    collectConvexManagementDecimalPathsForSchema({
      ...args,
      path: [...args.path, "*"],
      schema: additionalProperties,
    });
  }
}

function addConvexManagementResponseNumberPath(args: {
  endpointLabel: string;
  kind: ConvexManagementResponseNumberPathKind;
  numberPaths: Map<string, ConvexManagementResponseNumberPath>;
  path: string[];
}): void {
  const key = formatConvexManagementDecimalPathKey(args.path);
  const existing = args.numberPaths.get(key);
  if (existing !== undefined && existing.kind !== args.kind) {
    throw new Error(
      `${args.endpointLabel} response schema uses ${formatConvexManagementDecimalPath(args.path)} as both ${formatConvexManagementResponseNumberPathKind(existing.kind)} and ${formatConvexManagementResponseNumberPathKind(args.kind)}.`,
    );
  }
  if (existing === undefined) {
    args.numberPaths.set(key, {
      kind: args.kind,
      path: args.path,
    });
  }
}

function isConvexManagementNumericSchema(schema: Record<string, unknown>): boolean {
  const type = schema.type;
  if (type === "integer" || type === "number") {
    return true;
  }
  return Array.isArray(type) && type.some((item) => item === "integer" || item === "number");
}

function readConvexManagementLocalRef(ref: string): string {
  const localRefPrefix = "#/";
  const documentRefPrefix = `${convexManagementOpenApiSchemaId}#/`;
  if (ref.startsWith(localRefPrefix)) {
    return ref;
  }
  if (ref.startsWith(documentRefPrefix)) {
    return `#/${ref.slice(documentRefPrefix.length)}`;
  }
  return ref;
}

function readConvexManagementOpenApiRef(document: OpenAPI3, ref: string): unknown {
  const localRef = readConvexManagementLocalRef(ref);
  if (!localRef.startsWith("#/")) {
    throw new Error(`Unsupported Convex Management OpenAPI ref ${ref}.`);
  }

  const segments = localRef.slice(2).split("/").map(unescapeJsonPointerSegment);
  let value: unknown = document;
  for (const segment of segments) {
    if (Array.isArray(value)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= value.length) {
        throw new Error(`Could not resolve Convex Management OpenAPI ref ${ref}.`);
      }
      value = value[index];
      continue;
    }
    if (!isRecord(value)) {
      throw new Error(`Could not resolve Convex Management OpenAPI ref ${ref}.`);
    }
    const nextValue = value[segment];
    if (nextValue === undefined) {
      throw new Error(`Could not resolve Convex Management OpenAPI ref ${ref}.`);
    }
    value = nextValue;
  }
  return value;
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function formatConvexManagementDecimalPathKey(path: readonly string[]): string {
  return path.join("\u0000");
}

function formatConvexManagementDecimalPath(path: readonly string[]): string {
  if (path.length === 0) {
    return "the root response";
  }
  return `/${path.join("/")}`;
}

function formatConvexManagementResponseNumberPathKind(
  kind: ConvexManagementResponseNumberPathKind,
): string {
  switch (kind) {
    case "decimalId":
      return "a decimal ID";
    case "safeNumber":
      return "a JavaScript-safe number";
  }
  kind satisfies never;
  return kind;
}

function compareConvexManagementDecimalPaths(left: readonly string[], right: readonly string[]) {
  return formatConvexManagementDecimalPathKey(left).localeCompare(
    formatConvexManagementDecimalPathKey(right),
  );
}

function readSuccessJsonResponseSchemas(args: {
  method: ConvexManagementOperationMethod;
  operation: Record<string, unknown>;
  path: string;
}): AnySchema[] {
  const responses = args.operation["responses"];
  if (!isRecord(responses)) {
    throw new Error(
      `Expected ${args.method.toUpperCase()} ${args.path} responses to be an object.`,
    );
  }

  const schemas: AnySchema[] = [];
  for (const [status, response] of Object.entries(responses)) {
    const statusCode = Number(status);
    if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 299) {
      continue;
    }
    if (!isRecord(response)) {
      throw new Error(
        `Expected ${args.method.toUpperCase()} ${args.path} response ${status} to be an object.`,
      );
    }
    const content = response["content"];
    if (content === undefined) {
      continue;
    }
    if (!isRecord(content)) {
      throw new Error(
        `Expected ${args.method.toUpperCase()} ${args.path} response ${status} content to be an object.`,
      );
    }
    const jsonMediaType = content["application/json"];
    if (jsonMediaType === undefined) {
      continue;
    }
    if (!isRecord(jsonMediaType)) {
      throw new Error(
        `Expected ${args.method.toUpperCase()} ${args.path} response ${status} application/json media type to be an object.`,
      );
    }
    if (jsonMediaType["schema"] === undefined) {
      throw new Error(
        `Expected ${args.method.toUpperCase()} ${args.path} response ${status} application/json to have a schema.`,
      );
    }

    schemas.push({
      $ref: `${convexManagementOpenApiSchemaId}#/paths/${escapeJsonPointer(args.path)}/${args.method}/responses/${escapeJsonPointer(status)}/content/application~1json/schema`,
    });
  }

  return schemas;
}

function combineJsonResponseSchemas(schemas: AnySchema[]): AnySchema | null {
  if (schemas.length === 0) {
    return null;
  }
  if (schemas.length === 1) {
    return schemas[0];
  }
  return { anyOf: schemas };
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function buildUniqueValidatorExportName(args: {
  method: ConvexManagementOperationMethod;
  operationId: string;
  path: string;
  usedExportNames: Set<string>;
}): string {
  const operationName = toPascalIdentifier(args.operationId);
  const baseName = `ajv${operationName || "Operation"}Response`;
  if (!args.usedExportNames.has(baseName)) {
    args.usedExportNames.add(baseName);
    return baseName;
  }

  const fallbackName = `ajv${toPascalIdentifier(`${args.method} ${args.path}`)}Response`;
  if (!args.usedExportNames.has(fallbackName)) {
    args.usedExportNames.add(fallbackName);
    return fallbackName;
  }

  throw new Error(
    `Could not create a unique validator export for ${args.method.toUpperCase()} ${args.path}.`,
  );
}

function toPascalIdentifier(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function buildConvexManagementValidatorSchemaIds(
  entries: ConvexManagementResponseValidatorEntry[],
): Record<string, string> {
  const schemaIds: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.exportName !== null && entry.schemaId !== null) {
      schemaIds[entry.exportName] = entry.schemaId;
    }
  }
  return schemaIds;
}

function formatConvexManagementResponseValidatorsJs(
  entries: ConvexManagementResponseValidatorEntry[],
): string {
  return `export const convexManagementResponseValidators = {
${formatConvexManagementResponseValidatorMethodJs(entries, "get")}
${formatConvexManagementResponseValidatorMethodJs(entries, "post")}
};

export const convexManagementResponseDecimalPaths = {
${formatConvexManagementResponseDecimalPathMethodJs(entries, "get")}
${formatConvexManagementResponseDecimalPathMethodJs(entries, "post")}
};
`;
}

function formatConvexManagementResponseValidatorMethodJs(
  entries: ConvexManagementResponseValidatorEntry[],
  method: ConvexManagementOperationMethod,
): string {
  const methodEntries = entries.filter((entry) => entry.method === method);
  let validatorEntries = "";
  for (const entry of methodEntries) {
    const value = entry.exportName ?? "null";
    validatorEntries = `${validatorEntries}    ${JSON.stringify(entry.path)}: ${value},
`;
  }
  return `  ${method.toUpperCase()}: {
${validatorEntries}
  },
`;
}

function formatConvexManagementResponseDecimalPathMethodJs(
  entries: ConvexManagementResponseValidatorEntry[],
  method: ConvexManagementOperationMethod,
): string {
  const methodEntries = entries.filter((entry) => entry.method === method);
  let pathEntries = "";
  for (const entry of methodEntries) {
    pathEntries = `${pathEntries}    ${JSON.stringify(entry.path)}: ${JSON.stringify(entry.decimalPaths)},
`;
  }
  return `  ${method.toUpperCase()}: {
${pathEntries}
  },
`;
}

function formatConvexManagementResponseValidatorsDts(
  entries: ConvexManagementResponseValidatorEntry[],
): string {
  return `export const convexManagementResponseValidators: {
${formatConvexManagementResponseValidatorMethodDts(entries, "get")}
${formatConvexManagementResponseValidatorMethodDts(entries, "post")}
};

export const convexManagementResponseDecimalPaths: {
${formatConvexManagementResponseDecimalPathMethodDts(entries, "get")}
${formatConvexManagementResponseDecimalPathMethodDts(entries, "post")}
};
`;
}

function formatConvexManagementResponseValidatorMethodDts(
  entries: ConvexManagementResponseValidatorEntry[],
  method: ConvexManagementOperationMethod,
): string {
  const methodEntries = entries.filter((entry) => entry.method === method);
  let validatorEntries = "";
  for (const entry of methodEntries) {
    const value =
      entry.exportName === null
        ? "null"
        : `AjvStandaloneValidateFunction<SuccessResponseJSON<operations[${JSON.stringify(entry.operationId)}]>>`;
    validatorEntries = `${validatorEntries}    ${JSON.stringify(entry.path)}: ${value};
`;
  }
  return `  ${method.toUpperCase()}: {
${validatorEntries}
  };
`;
}

function formatConvexManagementResponseDecimalPathMethodDts(
  entries: ConvexManagementResponseValidatorEntry[],
  method: ConvexManagementOperationMethod,
): string {
  const methodEntries = entries.filter((entry) => entry.method === method);
  let pathEntries = "";
  for (const entry of methodEntries) {
    pathEntries = `${pathEntries}    ${JSON.stringify(entry.path)}: readonly ConvexManagementResponseDecimalPath[];
`;
  }
  return `  ${method.toUpperCase()}: {
${pathEntries}
  };
`;
}

function transformConvexManagementOpenApiType(
  schemaObject: SchemaObject,
  options: TransformNodeOptions,
) {
  if (
    options.path &&
    convexManagementDecimalIdSchemaRefs.has(options.path) &&
    schemaObject.type === "integer" &&
    schemaObject.format === "int64"
  ) {
    return STRING;
  }
  return undefined;
}

writeFileSync(
  openApiDocumentOutputPath,
  `${JSON.stringify(documentJson, null, 2)}
`,
);

const openApiTypeAst = await openapiTS(documentJson, {
  rootTypes: true,
  rootTypesNoSchemaPrefix: true,
  transform: transformConvexManagementOpenApiType,
});
writeFileSync(
  typesOutputFilePath,
  `${COMMENT_HEADER}${astToString(openApiTypeAst)}
`,
);

ajv.addSchema(validationDocumentJson, convexManagementOpenApiSchemaId);
for (const entry of responseValidatorEntries) {
  if (entry.schema !== null && entry.schemaId !== null) {
    ajv.addSchema(entry.schema, entry.schemaId);
  }
}

writeFileSync(
  validatorsOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.
/* eslint-disable */

${standaloneCode(ajv, validatorSchemaIds)}
${formatConvexManagementResponseValidatorsJs(responseValidatorEntries)}`,
);
writeFileSync(
  validatorTypesOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.

import type { SuccessResponseJSON } from "openapi-typescript-helpers";
import type { operations } from "./types.generated";

export type AjvStandaloneValidationError = {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message?: string;
  params?: unknown;
};

export type AjvStandaloneValidateFunction<T> = {
  (payload: unknown): payload is T;
  errors: AjvStandaloneValidationError[] | null;
};

export type ConvexManagementResponseDecimalPath = readonly string[];

${formatConvexManagementResponseValidatorsDts(responseValidatorEntries)}`,
);

execFileSync("pnpm", ["exec", "vp", "fmt", ...generatedFormatPaths], {
  cwd: appRoot,
  stdio: "inherit",
});
